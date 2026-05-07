# Architecture Decisions

Decisions made during the Stripe Hosted Checkout + OrderCloud PoC, with rationale.

---

## ADR-1: Stripe Hosted Checkout (not Payment Element, not custom form)

**Decision:** Use Stripe's full-page Hosted Checkout for payment collection.

**Context:** We needed a payment integration for the Commerce in SitecoreAI PoC. Options were:
1. Stripe Hosted Checkout — full redirect to Stripe's domain
2. Stripe Payment Element — embedded payment form (iframe on our domain)
3. Custom card form via Stripe.js — fully custom UI with tokenization

**Rationale:**
- **PCI compliance:** Hosted Checkout qualifies us for SAQ A (simplest tier). Card data never touches our servers or domain. No self-attestation burden.
- **Reduced scope:** Stripe handles payment form, shipping collection, tax calculation, promo code UI, and receipt emails. We only create a session and handle the webhook.
- **Speed to MVP:** No payment UI to build, style, or maintain. No edge cases around form validation, 3D Secure flows, or payment method rendering.

**Trade-offs:**
- Less UI control (can't deeply customize the checkout page beyond Stripe Dashboard settings)
- Full-page redirect (not inline/modal)
- Async payment flow means OC Integration Events can't be used for payment processing (see ADR-3)

**Status:** Confirmed. No plans to switch to Payment Element — that would reintroduce PCI burden and frontend complexity that Hosted Checkout explicitly eliminates.

---

## ADR-2: OrderCloud as Pricing Authority (server-side validation)

**Decision:** OC is the single source of truth for product pricing. The client never submits prices.

**Context:** Initial implementation had the client sending `{id, name, price, quantity}` to the checkout endpoint. A tech lead flagged this as a security risk — client-submitted prices could be manipulated.

**Rationale:**
- Server creates an OC order with the requested products
- OC applies PriceSchedule pricing automatically when line items are created
- Server reads back `LineItem.UnitPrice` — this is the authoritative price
- Stripe session is created using OC-determined prices only

**Flow:**
```
Client sends: { items: [{id, quantity}], promoCode? }
Server does:  OC order → add line items → read back UnitPrice → create Stripe session
```

**The client cannot influence pricing.** Even if the request is tampered with, the server only uses OC's response.

---

## ADR-3: No OC Integration Events (incompatible with Hosted Checkout)

**Decision:** Do not use OrderCloud Integration Events for payment processing.

**Context:** OC Integration Events (`OrderCheckout`, `Payment`) are designed for synchronous server-side payment — OC calls your endpoint, you charge the card, respond with success/failure within the HTTP request.

**Why it doesn't fit:**
- Hosted Checkout is inherently **async**: redirect → customer fills Stripe form → pays → webhook fires minutes later
- You cannot respond to an OC Integration Event with "wait a few minutes while the customer completes checkout on another domain"
- Integration Events are designed for tokenized card vaults / server-to-server payment processors

**Correct pattern for Hosted Checkout:**
1. OC manages catalog, cart (order), pricing
2. Our server creates the Stripe Checkout Session from the OC order
3. Stripe handles payment collection
4. Stripe webhook confirms payment
5. Our webhook handler updates OC (submit order, record payment)

**Status:** Closed. Integration Events would only be relevant if we switched to Payment Element (ADR-1 rules this out).

---

## ADR-4: Stripe-Only Promo Code Strategy

**Decision:** Promotions are managed exclusively in Stripe. OC Promotions API is not used.

**Context:** Two promo sources were evaluated:
- **OC Promotions API** — promotions defined in OrderCloud
- **Stripe Coupons/Promotion Codes** — promotions defined in Stripe Dashboard

**Implementation:**
- `allow_promotion_codes: true` is always set on the Checkout Session
- Customer enters promo codes on the Stripe-hosted checkout page
- Stripe validates, applies the discount, and collects the net payment
- On `checkout.session.completed`, the webhook reads per-line-item discount details from Stripe (`amount_subtotal`, `amount_discount`, `amount_total`) and persists them to OC line item `xp.stripe`
- Promo attribution (`promoCode`, `couponId`) is only set on line items where `discountCents > 0`
- OC line items keep PriceSchedule pricing (gross) — no `OverrideUnitPrice`

**Rationale:**
- Reduces integration surface — no OC promo resolution code needed
- Stripe owns the full promo lifecycle (creation, validation, redemption, reporting)
- OC receives the financial outcome per line item for reconciliation
- `Payment.Amount` (net) vs `Order.Subtotal` (gross) delta is fully explained by `xp` metadata

---

## ADR-5: Webhook-Driven Fulfillment (not redirect-driven)

**Decision:** Order fulfillment is triggered exclusively by the `checkout.session.completed` webhook, never by the success redirect.

**Rationale:**
- The success redirect is not a guarantee of payment (customer could close the tab, network issues, etc.)
- Stripe retries failed webhooks for up to 3 days
- Webhook includes the full session data (payment status, amounts, line items)

**Implementation:** The webhook handler calls `fulfillOrder(session)` which is resumable and idempotent:
1. **Find-or-create** OC order (keyed on `xp.stripeSessionId`) — if found, resumes from current state
2. **Ensure line items exist** — skips already-created items by ProductID
3. **Submit order** — only if `order.Status === "Unsubmitted"`. Throws on failure to trigger webhook retry
4. **Ensure payment recorded** — checks existing payments by `xp.stripeSessionId`, only creates if missing

If any step fails, the webhook returns 500 so Stripe retries. On retry, completed steps are skipped.

---

## ADR-6: Client Credentials Auth with DefaultContextUser

**Decision:** Use OC Client Credentials grant with a DefaultContextUser configured on the API Client.

**Context:** For server-to-server (M2M) communication with OC, two patterns exist:
1. Client Credentials **with** DefaultContextUser — token has buyer user context, `Me.*` endpoints work
2. Client Credentials **without** DefaultContextUser — token is admin-only, must use admin endpoints with explicit buyer IDs

**Rationale for keeping DefaultContextUser (PoC):**
- Simpler code — can use `Me.ListOrders`, `Me.ListProducts`, `Me.GetProduct`
- All orders created under one buyer user (`buyer01_user`)
- Appropriate for a PoC where we don't yet have real buyer authentication

**Production consideration:** A production system would likely use admin endpoints or pass-through buyer tokens instead, with explicit buyer routing. The DefaultContextUser pattern is a PoC convenience.

---

## ADR-7: Cart Order Cleanup

**Decision:** The temporary OC order used for pricing is deleted after the Stripe Checkout Session is created.

**Context:**
- At checkout time: server creates an OC order to read PriceSchedule pricing
- The Stripe session is created from that pricing
- The cart order is then deleted — it was only needed to read `UnitPrice`
- After payment: the webhook creates a **new** OC order (the fulfillment order) with a deterministic ID (`stripe-{last 8 of session ID}`)

**Why not reuse the cart order?**
- The fulfillment order needs Stripe-specific metadata (session ID, payment intent, discount info) that isn't known at cart time
- Line items need `xp.stripe` discount breakdown from the completed session
- Keeping them separate is cleaner than patching the cart order post-payment

**Status:** Resolved. Cart orders are now deleted after session creation. No orphans.

---

## ADR-8: Cancel & Refund Orchestration

**Decision:** Cancellation is a single API call that orchestrates both Stripe (refund) and OC (cancel) together.

**Context:** OC has no integration events or message senders configured for MVP. Status changes in one system do not automatically propagate to the other. Changing OC order status to "Canceled" does not affect Stripe, and vice versa.

**Implementation:**
- `POST /api/orders/cancel` accepts an OC order ID
- Looks up the linked Stripe session from `order.xp.stripeSessionId`
- If order is paid: issues a Stripe refund via `stripe.refunds.create()`
- If order is unpaid: expires the Checkout Session
- Cancels the order in OC via `Orders.Cancel()`
- Records refund metadata in OC order `xp` (`stripeRefundId`, `stripeRefundStatus`, `stripeRefundAmountCents`, `canceledAt`)

**Operational rules:**
| Timing | Action |
|--------|--------|
| Before checkout completes | Expire session, create new one |
| After payment, before or after fulfillment | Refund + cancel OC order |
| Completed Checkout Session | Cannot be "amended" — only refund |

**Status:** Implemented. Order confirmation page has a "Cancel & Refund" button that calls this endpoint.
