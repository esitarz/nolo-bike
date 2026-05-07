# Guiding Questions

Living document of questions raised during the Stripe + OrderCloud integration work. Updated as answers are confirmed.

*Last updated: May 7, 2026*

---

## Integration Events & Order Lifecycle

### Q: Do we need OC Integration Events?

**Status:** Answered — No.

Integration Events expect synchronous payment processing (OC calls your endpoint, you charge, respond). Hosted Checkout is async (redirect → customer pays → webhook). These models are incompatible. See [ADR-3](./architecture-decisions.md#adr-3-no-oc-integration-events-incompatible-with-hosted-checkout).

---

### Q: Do we need an OC MessageSender?

**Status:** Open.

OC MessageSenders fire notifications (emails, webhooks) on order events like `OrderSubmitted`, `OrderApproved`, `ShipmentCreated`. Questions to resolve:

- Do we want OC to send order confirmation emails, or does Stripe handle that? (Stripe sends receipt emails by default with Hosted Checkout.)
- If OC is the system of record for orders, should it also own transactional emails?
- Would a MessageSender be useful for notifying downstream systems (warehouse, ERP) when an order is submitted?

**Current state:** Not implemented. Stripe sends payment receipts. No OC notifications configured.

---

### Q: Is there anything we need to do when the order is submitted in OC?

**Status:** Answered (for PoC).

Currently, `Orders.Submit()` is called in the webhook fulfillment handler and moves the order to `Open` status. Nothing further is triggered because:
- No approval rules are configured (order goes straight to Open, not AwaitingApproval)
- No MessageSenders are assigned
- No Integration Events are listening

**Production considerations:**
- Approval rules (e.g., orders over $X need manager approval)
- MessageSender for order confirmation
- Downstream fulfillment triggers (inventory reservation, shipping label generation)

---

## Payment & Stripe

### Q: Should we capture the Payment Intent?

**Status:** Answered — No action needed.

Stripe Hosted Checkout **automatically captures** payments by default. The PaymentIntent is created, confirmed, and captured during the hosted flow. You don't interact with the PaymentIntent API at all. The webhook delivers the confirmed result.

If you needed auth-then-capture (e.g., charge only when shipped), you'd set `payment_intent_data.capture_method: "manual"` on the session — but that's not our use case.

---

### Q: What do we need to give OC to note that the order is paid?

**Status:** Answered.

Two API calls:
1. `Orders.Submit("Outgoing", orderId)` — moves status from Unsubmitted → Open
2. `Payments.Create("Outgoing", orderId, { Type: "CreditCard", Accepted: true, Amount: total })` — records payment

`Accepted: true` is the key flag that tells OC "money was collected." When total payments with `Accepted: true` cover the order total, OC considers it fully paid.

No separate "mark as paid" API exists — it's the combination of these two calls.

---

### Q: What are we sending to OC?

**Status:** Answered.

From the webhook, the fulfillment handler sends:

| Data | Source | OC field |
| ---- | ------ | -------- |
| Customer name + address | `session.customer_details` | `Order.BillingAddress` |
| Stripe Session ID | `session.id` | `Order.xp.stripeSessionId` |
| PaymentIntent ID | `session.payment_intent` | `Order.xp.stripePaymentIntent` |
| Promo source | `"stripe"` or null | `Order.xp.promoSource` |
| Discount amount (cents) | `total_details.amount_discount` | `Order.xp.stripeDiscountAmountCents` |
| Stripe promotion code ID | `session.discounts` | `Order.xp.stripePromotionCode` |
| Product IDs | Stripe product metadata | `LineItem.ProductID` |
| Gross amount (cents) | `item.amount_subtotal` | `LineItem.xp.stripe.grossCents` |
| Discount (cents) | `item.amount_discount` | `LineItem.xp.stripe.discountCents` |
| Net charged (cents) | `item.amount_total` | `LineItem.xp.stripe.netCents` |
| Promo code (if discounted) | `session.discounts` | `LineItem.xp.stripe.promoCode` |
| Quantity | `item.quantity` | `LineItem.Quantity` |
| Total paid | `session.amount_total` | `Payment.Amount` |

**Note:** `LineItem.UnitPrice` is **not overridden** — it stays at PriceSchedule pricing. The `OverrideUnitPrice` role is no longer used. The delta between `Order.Subtotal` (gross) and `Payment.Amount` (net) is the discount, fully explained by `xp` metadata.

---

## Auth & API Client Configuration

### Q: Could we use the same context user for both (cart creation and fulfillment)?

**Status:** Answered — Yes, and we currently do.

Both the checkout endpoint (`create-checkout-session`) and the webhook fulfillment handler (`ordercloud-fulfillment.ts`) call `getOcToken()` which uses the same Client Credentials grant with the same `DefaultContextUser` (`buyer01_user`).

This means:
- Cart orders (pre-payment) are created under `buyer01_user`
- Fulfillment orders (post-payment) are also created under `buyer01_user`
- Same scopes, same buyer context

**Production consideration:** You might want different API Clients for different concerns (e.g., a "storefront" client with fewer permissions vs. a "fulfillment" client with admin-level access). For the PoC, one client is fine.

---

### Q: Is the M2M API Client something we want on tenant annotations as well?

**Status:** Open.

Context: In a multi-tenant platform (like Sitecore's infrastructure), "tenant annotations" are metadata stored at the tenant level so that platform services can discover configuration (API Client IDs, endpoints, feature flags) without hardcoding.

Questions to resolve:
- Will other platform services (Content SDK, Envoy/Proxy, AI orchestration) need to discover this API Client?
- Is the payment integration a shared service or per-tenant configured?
- Should the Stripe keys also live in tenant annotations, or only OC credentials?
- Who provisions the API Client — the platform (automated) or the merchant (manual)?

**Current state:** API Client ID is in `.env.local` / Vercel env vars. Not annotated anywhere discoverable by other services.

**Recommendation:** If other workstreams need to call OC on behalf of the same tenant, storing the M2M API Client ID (not the secret) in tenant annotations makes sense for discoverability. The secret should remain in a secrets manager.

---

## Resolved (Previously Open)

### ~~Q: How does Stripe-native promo attribution flow back to OC?~~

**Status:** Answered — Resolved.

The webhook expands `total_details.breakdown` and `discounts` on the completed session. Discount details are stored at two levels:
- **Order xp:** `promoSource`, `stripeDiscountAmountCents`, `stripePromotionCode`, `stripeCouponId`
- **Line item xp.stripe:** `grossCents`, `discountCents`, `netCents`, `promoCode`, `couponId`

Promo attribution is only set on line items where `discountCents > 0`. No inference needed.

---

### ~~Q: Should we unify the cart order and fulfillment order?~~

**Status:** Answered — Resolved differently.

Instead of unifying them, the cart order is now **deleted** after the Stripe session is created. It only existed to read PriceSchedule pricing. The fulfillment order is the sole OC order, with a deterministic ID: `stripe-{last 8 of session ID}`.

---

### ~~Q: Do we have a plan for handling retries?~~

**Status:** Answered — Resolved.

Fulfillment is resumable and idempotent. Each step (order creation, line items, submit, payment) checks prior completion before executing. The webhook returns 500 on OC failure, triggering Stripe's automatic retry (exponential backoff, up to 3 days).

---

### ~~Q: Can we amend or cancel a completed Checkout Session?~~

**Status:** Answered — Resolved.

A completed Checkout Session cannot be amended. The paths are:
- **Before completion:** Expire the session, create a new one
- **After completion:** Issue a refund (full or partial)

`POST /api/orders/cancel` orchestrates both Stripe (refund) and OC (cancel) in a single call. Refund metadata is stored in OC order `xp`.

---

## Still Open

### Q: Who owns transactional emails — Stripe or OC?

Stripe sends payment receipts by default with Hosted Checkout. Should OC also send order confirmation via MessageSenders? Or do we disable Stripe receipts and let OC own all communications?

---

### Q: How does this integrate with the Content SDK workstream?

The product catalog is now fetched from OC via `Me.ListProducts()`. Content SDK would presumably provide richer product display data (images, descriptions, structured content). How does that connect to OC's catalog for pricing?

---

### Q: How does buyer auth integrate?

Depends on the Auth & Envoy/Proxy workstream. Currently all orders use a single `DefaultContextUser`. Registered users may need `customer_email` or customer ID pre-populated on the Stripe session.
