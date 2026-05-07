# Current State

What's working, what's known-broken, and what's next.

*Last updated: May 7, 2026*

---

## What's Working (Validated End-to-End)

| Feature | How it was tested |
| ------- | ----------------- |
| OC Client Credentials auth + token caching | Curl + dev server |
| OC order creation with PriceSchedule pricing | `POST /api/stripe/create-checkout-session` |
| Cart order cleanup (deleted after session creation) | No orphan Unsubmitted orders in OC |
| Stripe Checkout Session creation from OC line items | Returns valid `session.url` |
| `allow_promotion_codes: true` on every session | Stripe-native promo codes work on hosted page |
| Redirect to Stripe Hosted Checkout | Browser flow |
| Webhook signature verification | Stripe CLI forwarding to localhost |
| `checkout.session.completed` handling | Test payment with 4242 card |
| Resumable, idempotent OC fulfillment | Webhook retry picks up where previous attempt failed |
| Webhook returns 500 on OC failure (triggers Stripe retry) | Verified in dev logs |
| OC fulfillment (order + line items + submit + payment) | Verified orders `stripe-*` in OC |
| PriceSchedule pricing preserved (no OverrideUnitPrice) | OC Subtotal matches PriceSchedule, not Stripe net |
| Stripe discount metadata in OC order xp | `promoSource`, `stripeDiscountAmountCents`, `stripePromotionCode` |
| Per-line-item discount breakdown in OC line item xp | `xp.stripe.grossCents`, `discountCents`, `netCents`, `promoCode` |
| Promo attribution only on discounted line items | Non-discounted items have no `promoCode` in xp |
| Real OC products on landing page | `GET /api/products` → `Me.ListProducts()` |
| Server-side price validation (OC is pricing authority) | Client sends no prices |
| Order confirmation page with session details | Shows customer, items, discount breakdown, OC order ID |
| Cancel & refund (Stripe + OC in one call) | `POST /api/orders/cancel` → refund + OC cancel |
| Cancel button on order confirmation page | Verified: OC status → Canceled, Stripe → refunded |
| Refund metadata in OC order xp | `stripeRefundId`, `stripeRefundStatus`, `stripeRefundAmountCents`, `canceledAt` |

---

## Resolved Gaps (Previously Open)

### ~~Dual-Order Problem~~
**Resolution:** Cart orders (used for pricing) are now deleted after the Stripe session is created. The fulfillment order is the only OC order. Its ID is deterministic: `stripe-{last 8 of session ID}`.

### ~~Stripe-Native Promo Codes Don't Flow Back to OC~~
**Resolution:** The webhook expands `total_details.breakdown` and `discounts` on the session. Discount metadata is stored in both order-level `xp` and per-line-item `xp.stripe`. Promo attribution is only set on items where `discountCents > 0`.

### ~~Product Catalog is Hardcoded in UI~~
**Resolution:** Landing page fetches products from `GET /api/products`, which calls `Me.ListProducts()` from OrderCloud. No hardcoded product data.

### ~~No Retry/Resumable Fulfillment~~
**Resolution:** Each fulfillment step checks prior completion before executing. Webhook returns 500 on failure so Stripe retries with exponential backoff for up to 3 days.

### ~~No Cancel/Refund Path~~
**Resolution:** `POST /api/orders/cancel` orchestrates Stripe refund + OC order cancellation in a single call. Order confirmation page has a cancel button.

### ~~OverrideUnitPrice Dependency~~
**Resolution:** Removed. OC line items keep PriceSchedule pricing (gross). The delta between `Order.Subtotal` and `Payment.Amount` is the discount, fully documented in `xp`.

---

## Remaining Known Gaps

### No Real Buyer Authentication

**Impact:** All orders created under a single buyer user (`buyer01_user`).

**Details:**
- The M2M token uses `DefaultContextUser` — every checkout is from the same buyer identity
- No session-based buyer auth (anonymous or registered)

**Fix:** Depends on the Auth & Envoy/Proxy workstream.

**Priority:** Out of scope for PoC.

---

## Deployment Status

| Environment | URL | Status |
| ----------- | --- | ------ |
| Local dev   | `http://localhost:3000` | Working |
| Vercel      | `https://nolo-bike.vercel.app` | Deployed (verify env vars) |

**Vercel checklist:**
- [ ] All env vars set (see Integration Guide)
- [ ] `NEXT_PUBLIC_APP_URL` = `https://nolo-bike.vercel.app`
- [ ] `STRIPE_WEBHOOK_SECRET` = Dashboard webhook secret (not CLI)
- [ ] Stripe Dashboard webhook endpoint: `https://nolo-bike.vercel.app/api/stripe/webhook` for `checkout.session.completed`

---

## Open Questions (Not Yet Decided)

| Question | Context |
| -------- | ------- |
| Generic commerce vs OC-specific namespace? | Affects Content SDK integration. Current code is OC-specific. |
| How does buyer auth integrate? | Depends on Auth & Envoy/Proxy workstream |
| Multiple currencies / international shipping? | Stripe supports it; out of scope for MVP |
| Who owns transactional emails — Stripe or OC? | Stripe sends receipts by default. OC MessageSenders not configured. |

---

## Demo Instructions

1. Open the app (localhost or Vercel)
2. Products load from OrderCloud automatically
3. Click "Add to Cart" on a product
4. Click "Checkout with Stripe"
5. On Stripe's page, optionally enter a Stripe promo code
6. Use test card `4242 4242 4242 4242`, any future expiry, any CVC
7. Complete payment → redirected to order confirmation page with session details
8. (Behind the scenes: webhook fires → OC order created + submitted + payment recorded)
9. Optionally click "Cancel & Refund" to refund Stripe and cancel the OC order
