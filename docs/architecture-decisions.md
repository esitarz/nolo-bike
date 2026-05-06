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

## ADR-4: Dual-Path Promo Code Strategy

**Decision:** Support both OC-resolved promos and Stripe-native promo codes.

**Context:** Two promo sources exist:
- **OC Promotions API** — promotions defined in OrderCloud (e.g., "OC451" = 45.1% off)
- **Stripe Coupons** — promotions defined in Stripe Dashboard

**Implementation:**
- **Path A (Stripe-native):** If the customer doesn't enter a promo in our cart UI, `allow_promotion_codes: true` is set on the session. Customer can enter a Stripe promo code on the hosted checkout page.
- **Path B (OC-resolved):** If the customer enters a promo in our cart UI, server validates it against `Me.ListPromotions`, applies the discount to `unit_amount` before creating the session. No Stripe promo codes allowed (price already reflects discount).

**Trade-off / Known gap:**
- Path A: Stripe-native promos are **not currently recorded back to OC**. The fulfillment order gets the discounted `amount_total` as the price, but there's no explicit promo record in OC.
- Path B: OC promo is recorded in `session.metadata.promoCode` and flows back to OC order's `xp.promoCode`.

---

## ADR-5: Webhook-Driven Fulfillment (not redirect-driven)

**Decision:** Order fulfillment is triggered exclusively by the `checkout.session.completed` webhook, never by the success redirect.

**Rationale:**
- The success redirect is not a guarantee of payment (customer could close the tab, network issues, etc.)
- Stripe retries failed webhooks for up to 3 days
- Webhook includes the full session data (payment status, amounts, line items)

**Implementation:** The webhook handler calls `fulfillOrder(session)` which:
1. Checks idempotency (has this session already been fulfilled?)
2. Creates OC order with billing address + Stripe metadata
3. Adds line items with `UnitPrice` from Stripe's charged amount
4. Submits the order (`Orders.Submit`)
5. Records payment (`Payments.Create` with `Accepted: true`)

---

## ADR-6: Client Credentials Auth with DefaultContextUser

**Decision:** Use OC Client Credentials grant with a DefaultContextUser configured on the API Client.

**Context:** For server-to-server (M2M) communication with OC, two patterns exist:
1. Client Credentials **with** DefaultContextUser — token has buyer user context, `Me.*` endpoints work
2. Client Credentials **without** DefaultContextUser — token is admin-only, must use admin endpoints with explicit buyer IDs

**Rationale for keeping DefaultContextUser (PoC):**
- Simpler code — can use `Me.ListOrders`, `Me.ListPromotions`, `Me.GetProduct`
- All orders created under one buyer user (`buyer01_user`)
- Appropriate for a PoC where we don't yet have real buyer authentication

**Production consideration:** A production system would likely use admin endpoints or pass-through buyer tokens instead, with explicit buyer routing. The DefaultContextUser pattern is a PoC convenience.

---

## ADR-7: Separate Cart Order vs Fulfillment Order (Known Gap)

**Decision (current):** The pre-checkout OC order (cart) and the post-payment OC order (fulfillment) are separate orders.

**Context:**
- At checkout time: server creates/reuses an OC order to read authoritative pricing
- After payment: webhook creates a **new** OC order with the Stripe-charged amounts

**Why this is a gap:**
- Two OC orders exist for one transaction
- The cart order is left in "Unsubmitted" state (orphaned)

**Future fix:** The `ocOrderId` is stored in `session.metadata`. The fulfillment handler should submit the *existing* cart order instead of creating a new one. This would unify the flow into a single OC order lifecycle.

**Status:** Known gap, documented for future iteration.
