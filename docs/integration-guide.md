# Integration Guide

How the Stripe Hosted Checkout + OrderCloud integration works, end to end.

---

## System Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌────────────────┐
│   Browser   │────▶│  Next.js API      │────▶│  OrderCloud     │     │    Stripe      │
│  (Minicart) │     │  (our server)     │────▶│  (pricing/cart) │     │  (payments)    │
│             │◀────│                   │◀────│                 │     │                │
└─────────────┘     └──────────────────┘     └─────────────────┘     └────────────────┘
                           │                                                │
                           │◀───────────────── webhook ─────────────────────│
                           │                                                
                           ▼                                                
                    ┌──────────────────┐                                    
                    │  OC Fulfillment  │                                    
                    │  (order + payment)│                                    
                    └──────────────────┘                                    
```

---

## OrderCloud Authentication

**File:** `lib/ordercloud.ts`

**Grant type:** Client Credentials (M2M, server-to-server)

**Key details:**
- API Client: `BF28718C-D373-4109-AFA0-B77F08ECFD0D`
- `IsAnonBuyer = false`
- `DefaultContextUser = buyer01_user` (gives the token a buyer context for `Me.*` calls)
- Region: QA US West (`https://qauswest-production.octestregion.com/`)
- SDK auto-appends `/v1` — the env var must NOT include it

**Scopes requested:**
| Scope | Used for |
|-------|----------|
| `Shopper` | Product/catalog access |
| `MeAdmin` | Me.ListOrders, Me.ListPromotions |
| `OrderAdmin` | Orders.Create, Orders.Submit |
| `OrderReader` | Orders.List (idempotency check) |
| `OverrideUnitPrice` | Set UnitPrice on line items (bypass PriceSchedule) |

**Token caching:** Tokens are cached in-memory with 30s buffer before expiry. `getOcToken()` is safe to call on every request.

**Security profile:** "buyerCommerce" assigned to `buyer01_user` with all the above roles.

---

## Checkout Flow (Creating a Stripe Session)

**File:** `pages/api/stripe/create-checkout-session.ts`

**Endpoint:** `POST /api/stripe/create-checkout-session`

**Request body:**
```json
{
  "items": [{ "id": "space-horse-tiagra", "quantity": 1 }],
  "promoCode": "OC451"  // optional
}
```

**Steps:**

1. **Authenticate with OC** — `getOcToken()` gets/caches a Client Credentials token
2. **Decode JWT** — extract `orderid` claim (present for anonymous buyer carts)
3. **Find or create OC order:**
   - If JWT has `orderid`: reuse it
   - Else: query `Me.ListOrders({ Status: "Unsubmitted" })` for existing cart
   - Else: `Orders.Create("Outgoing", {})` to create new
4. **Sync line items** — clear existing items, create new ones from request. OC applies PriceSchedule pricing automatically.
5. **Read back line items** — `LineItems.List("Outgoing", orderId)` returns `UnitPrice` set by OC
6. **Resolve promo** (if provided) — calls `resolveOcPromotion(code)` which queries `Me.ListPromotions`
7. **Build Stripe line items** — map OC line items to Stripe `price_data` with `unit_amount` in cents
8. **Create Stripe Checkout Session** — returns `session.url` for client redirect

**Response:**
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/..."
}
```

---

## Promo Code Validation

**File:** `lib/ordercloud-promotions.ts`

**Function:** `resolveOcPromotion(code)`

**How it works:**
1. Authenticates with OC
2. Calls `Me.ListPromotions({ filters: { Code: code } })`
3. Checks the promotion is `Active`
4. Parses `ValueExpression` for the discount multiplier (e.g., `"item.LineTotal * 0.451"` → 45.1% off)
5. Returns `{ code, description, percentOff }` or `null`

**OC Promotion setup (current):**
- ID: `OC451`
- EligibleExpression: `item.LineTotal > 0`
- ValueExpression: `item.LineTotal * 0.451`

**Dual-path behavior:**
- If promo resolved → discount applied to `unit_amount`, `allow_promotion_codes` NOT set
- If no promo → `allow_promotion_codes: true` lets customer use Stripe-native codes

---

## Webhook Handling (Payment Confirmation)

**File:** `pages/api/stripe/webhook.ts`

**Endpoint:** `POST /api/stripe/webhook`

**Key configuration:**
```typescript
export const config = { api: { bodyParser: false } };
```
Raw body parsing is required for Stripe signature verification.

**Steps:**
1. Read raw body from request stream
2. Verify signature with `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`
3. On `checkout.session.completed`:
   - Retrieve full session with `expand: ["line_items.data.price.product"]`
   - Call `fulfillOrder(fullSession)`
4. Return 200 (even if fulfillment fails — log for manual reconciliation)

**Important:** The webhook secret for local dev (Stripe CLI: `whsec_...`) differs from production (Stripe Dashboard webhook endpoint). Vercel deployment needs the Dashboard webhook secret.

---

## OrderCloud Fulfillment (Post-Payment)

**File:** `lib/ordercloud-fulfillment.ts`

**Function:** `fulfillOrder(session)`

**Steps:**
1. **Idempotency check** — `Orders.List({ filters: { "xp.stripeSessionId": session.id } })`. If found, return early.
2. **Create OC order** — ID format: `stripe-{last 8 chars of session.id}`, includes billing address from Stripe's `customer_details`, xp metadata (stripeSessionId, stripePaymentIntent, promoCode)
3. **Add line items** — for each Stripe line item:
   - Extract `ocProductId` from expanded product metadata
   - Set `UnitPrice` = `amount_total / quantity / 100` (what Stripe actually charged, in dollars)
   - Uses `OverrideUnitPrice` scope to bypass PriceSchedule
4. **Submit order** — `Orders.Submit("Outgoing", orderId)` moves status to Open
5. **Record payment** — `Payments.Create` with `Accepted: true` and the full amount

**What OC receives:**
| Field | Value | Source |
|-------|-------|--------|
| `Order.BillingAddress` | Customer address | `session.customer_details` |
| `Order.xp.stripeSessionId` | Session ID | Idempotency key |
| `Order.xp.stripePaymentIntent` | PaymentIntent ID | Payment reference |
| `LineItem.ProductID` | OC product ID | Stripe product metadata |
| `LineItem.UnitPrice` | Charged price (dollars) | `item.amount_total / quantity` |
| `Payment.Amount` | Total charged (dollars) | `session.amount_total / 100` |
| `Payment.Accepted` | `true` | Marks order as paid |

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (client-side) | `pk_test_...` |
| `STRIPE_SECRET_KEY` | Stripe secret key (server-side only) | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | `whsec_...` |
| `NEXT_PUBLIC_APP_URL` | App base URL (for redirect URLs) | `http://localhost:3000` |
| `OC_API_URL` | OC API base (no `/v1` suffix) | `https://qauswest-production.octestregion.com/` |
| `OC_CLIENT_ID` | OC API Client ID | `BF28718C-...` |
| `OC_CLIENT_SECRET` | OC API Client Secret | `51Qn8it...` |
| `OC_BUYER_ID` | Buyer org ID | `buyer01` |
| `OC_BUYER_USER_ID` | Default context user | `buyer01_user` |

**Vercel-specific notes:**
- `NEXT_PUBLIC_APP_URL` must be `https://nolo-bike.vercel.app` (not localhost)
- `STRIPE_WEBHOOK_SECRET` must be the Dashboard webhook secret (not CLI secret)
- Create a webhook endpoint in Stripe Dashboard: `https://nolo-bike.vercel.app/api/stripe/webhook` → `checkout.session.completed`

---

## OC Entity Setup (Prerequisites)

| Entity | ID / Name | Notes |
|--------|-----------|-------|
| API Client | `BF28718C-D373-4109-AFA0-B77F08ECFD0D` | `IsAnonBuyer=false`, `DefaultContextUser=buyer01_user` |
| Buyer | `buyer01` | — |
| User | `buyer01_user` | Has security profile "buyerCommerce" |
| Security Profile | "buyerCommerce" | Roles: Shopper, MeAdmin, OrderAdmin, OrderReader, OverrideUnitPrice |
| Catalog | `buyer01` | `ViewAllProducts=true`, `Active=true`, assigned to buyer01 |
| Product | `space-horse-tiagra` | In catalog `buyer01`, has PriceSchedule with PriceBreak $1,899.00 |
| Promotion | `OC451` | `ValueExpression: "item.LineTotal * 0.451"`, Active=true |

---

## File Map

| File | Purpose |
|------|---------|
| `lib/ordercloud.ts` | OC SDK config + Client Credentials auth + token caching |
| `lib/ordercloud-fulfillment.ts` | Post-payment order creation, submission, payment recording |
| `lib/ordercloud-promotions.ts` | Promo code validation against OC Promotions API |
| `pages/api/stripe/create-checkout-session.ts` | Creates Stripe session from OC order data |
| `pages/api/stripe/webhook.ts` | Receives Stripe events, triggers fulfillment |
| `pages/api/stripe/validate-promo.ts` | Cart UI promo validation endpoint |
| `components/Minicart.tsx` | Cart drawer with promo input + checkout button |
| `context/cart.tsx` | Client-side cart state (React context) |
| `pages/checkout/success.tsx` | Post-payment success page |
| `pages/checkout/cancel.tsx` | Cancelled checkout page |
