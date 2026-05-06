# Current State

What's working, what's known-broken, and what's next.

*Last updated: May 6, 2026*

---

## What's Working (Validated End-to-End)

| Feature | How it was tested |
|---------|-------------------|
| OC Client Credentials auth + token caching | Curl + dev server |
| OC order creation with PriceSchedule pricing | `curl POST /api/stripe/create-checkout-session` |
| Stripe Checkout Session creation from OC line items | Returns valid `session.url` |
| Redirect to Stripe Hosted Checkout | Browser flow |
| Webhook signature verification | Stripe CLI forwarding to localhost |
| `checkout.session.completed` handling | Test payment with 4242 card |
| OC fulfillment (order + line items + submit + payment) | Verified order `stripe-B7kUK5Ms` in OC |
| Idempotency (duplicate webhook protection) | Re-sent webhook, got "already exists" |
| OC Promotion validation (code "OC451" → 45.1% off) | Cart UI + server-side resolution |
| Server-side price validation (OC is pricing authority) | Client sends no prices |

---

## Known Gaps

### 1. Dual-Order Problem

**Impact:** Two OC orders created per transaction.

**Details:**
- **Cart order** (created at checkout time for pricing): left Unsubmitted, orphaned
- **Fulfillment order** (created in webhook): has Stripe-charged amounts, gets Submitted

**Fix:** The fulfillment handler should submit the existing cart order (ID stored in `session.metadata.ocOrderId`) instead of creating a new one.

**Priority:** Medium — functional but creates data clutter in OC.

---

### 2. Stripe-Native Promo Codes Don't Flow Back to OC

**Impact:** When a customer uses a Stripe promo code on the hosted page (Path A), OC doesn't record which promo was used.

**Details:**
- The discounted amount is reflected in `item.amount_total` (fulfillment uses the correct charged price)
- But there's no explicit promo record in OC's order metadata
- `session.total_details.breakdown.discounts` contains the Stripe coupon info but isn't currently read

**Fix:** In the webhook, read `total_details.breakdown.discounts`, store in `order.xp.stripePromoCode` and/or apply an OC promotion to the order.

**Priority:** Low for PoC — prices are correct, just missing promo attribution.

---

### 3. No Real Buyer Authentication

**Impact:** All orders created under a single buyer user (`buyer01_user`).

**Details:**
- The M2M token uses `DefaultContextUser` — every checkout is from the same buyer identity
- No session-based buyer auth (anonymous or registered)

**Fix:** Depends on the Auth & Envoy/Proxy workstream. Production would pass real buyer tokens or route by buyer ID.

**Priority:** Out of scope for PoC — expected limitation.

---

### 4. Product Catalog is Hardcoded in UI

**Impact:** The landing page shows one product with hardcoded name/price/image.

**Details:**
- The *checkout pricing* is authoritative (comes from OC)
- But the *display* on the landing page is static — `$1,899.00`, `Space Horse Tiagra`
- If the OC PriceSchedule price changed, the display wouldn't update

**Fix:** Fetch product data from OC on page load (SSR or client-side).

**Priority:** Low for PoC — display vs. billing price mismatch is acceptable for demo.

---

## Deployment Status

| Environment | URL | Status |
|-------------|-----|--------|
| Local dev | `http://localhost:3000` | Working |
| Vercel | `https://nolo-bike.vercel.app` | Deployed (verify env vars) |

**Vercel checklist:**
- [ ] All env vars set (see Integration Guide)
- [ ] `NEXT_PUBLIC_APP_URL` = `https://nolo-bike.vercel.app`
- [ ] `STRIPE_WEBHOOK_SECRET` = Dashboard webhook secret (not CLI)
- [ ] Stripe Dashboard webhook endpoint: `https://nolo-bike.vercel.app/api/stripe/webhook` for `checkout.session.completed`
- [ ] Push latest commits (`git push`)

---

## Git History (Recent)

```
3ee8132 chore(deps): update package lock
32d8e27 docs(landing): update flow diagram and Q&A for OC order-driven checkout
0c77cc4 feat(checkout): server creates OC order and reads line items for authoritative pricing
b7f354e chore(ui): add favicon and update promo code reference to OC451
abbb47d feat(checkout): fetch product prices from OC server-side
...earlier: fulfillment, promotions, webhook, initial PoC
```

---

## Open Questions (Not Yet Decided)

| Question | Context |
|----------|---------|
| Generic commerce vs OC-specific namespace? | Affects Content SDK integration. Current code is OC-specific. |
| How does buyer auth integrate? | Depends on Auth & Envoy/Proxy workstream |
| Multiple currencies / international shipping? | Stripe supports it; out of scope for MVP |
| What happens when webhook fails repeatedly? | Stripe retries 3 days; need alerting/reconciliation strategy for production |

---

## Demo Instructions

1. Open the app (localhost or Vercel)
2. Click "Add to Cart" on the Space Horse Tiagra
3. Open cart → optionally enter promo code `OC451`
4. Click "Checkout with Stripe"
5. On Stripe's page, use test card `4242 4242 4242 4242`, any future expiry, any CVC
6. Complete payment → redirected to success page
7. (Behind the scenes: webhook fires → OC order created + submitted + payment recorded)
