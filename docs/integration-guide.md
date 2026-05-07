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
| ----- | -------- |
| `Shopper` | Product/catalog access |
| `MeAdmin` | Me.ListOrders |
| `OrderAdmin` | Orders.Create, Orders.Submit, Orders.Cancel |
| `OrderReader` | Orders.List (idempotency check) |

> **Meeting decision (May 7):** M2M integration user + security profile + API client is the agreed auth pattern. Integration events are not required — Stripe webhooks are sufficient for payment capture and OC order updates.

**Token caching:** Tokens are cached in-memory with 30s buffer before expiry. `getOcToken()` is safe to call on every request.

**Security profile:** "buyerCommerce" assigned to `buyer01_user` with all the above roles.

---

## Checkout Flow (Creating a Stripe Session)

**File:** `pages/api/stripe/create-checkout-session.ts`

**Endpoint:** `POST /api/stripe/create-checkout-session`

**Request body:**
```json
{
  "items": [{ "id": "space-horse-tiagra", "quantity": 1 }]
}
```

> No `promoCode` field — promo codes are entered on the Stripe Hosted Checkout page.

**Steps:**

1. **Authenticate with OC** — `getOcToken()` gets/caches a Client Credentials token
2. **Decode JWT** — extract `orderid` claim (present for anonymous buyer carts)
3. **Find or create OC order:**
   - If JWT has `orderid`: reuse it
   - Else: query `Me.ListOrders({ Status: "Unsubmitted" })` for existing cart
   - Else: `Orders.Create("Outgoing", {})` to create new
4. **Sync line items** — clear existing items, create new ones from request. OC applies PriceSchedule pricing automatically.
5. **Read back line items** — `LineItems.List("Outgoing", orderId)` returns `UnitPrice` set by OC
6. **Build Stripe line items** — map OC line items to Stripe `price_data` with `unit_amount` in cents
7. **Create Stripe Checkout Session** — `allow_promotion_codes: true` always set. Returns `session.url` for client redirect.
8. **Delete cart order** — `Orders.Delete("Outgoing", orderId)`. The cart order only existed for pricing; the fulfillment order is created later by the webhook.

**Response:**
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/..."
}
```

---

## Promo Code Handling

**Approach:** Stripe-native promotion codes only (no OC Promotions API).

> **Meeting decision (May 7):** Team evaluated two approaches — Stripe-native and OC-sourced promotions. Miranda noted that overriding unit prices in OC is not an accurate way to apply promotions; true promo application involves applying a promo code to the order. For MVP, Stripe-native promos are sufficient. More complex OC integration can be considered later.

**How it works:**
1. `allow_promotion_codes: true` is always set on the Checkout Session
2. Customer enters any Stripe promo code on the hosted checkout page
3. Stripe validates, applies discount, and collects the net amount
4. On `checkout.session.completed`, the webhook reads discount details from `session.total_details.amount_discount` and `session.discounts`
5. Discount metadata is persisted at two levels:
   - **Order xp:** `promoSource: "stripe"`, `stripeDiscountAmountCents`, `stripePromotionCode`, `stripeCouponId`
   - **Line item xp.stripe:** `grossCents`, `discountCents`, `netCents`, `promoCode` (only on discounted items), `couponId`
6. OC line items keep **PriceSchedule pricing** (gross price). `UnitPrice` is NOT overridden. The delta between `Order.Subtotal` and `Payment.Amount` is the discount, fully explained by `xp` metadata.

**Why not OC Promotions?**
- Reduces integration surface for MVP
- Stripe owns the full promo lifecycle (creation, validation, redemption, reporting)
- OC receives the financial outcome (gross price + discount metadata) for reconciliation
- Overriding OC unit prices to reflect Stripe discounts is not the correct OC pattern (per Miranda)

**Future consideration:** For tighter Sitecore integration and larger customers, OC Promotions could be layered in. This would require applying OC promo codes to the order before sending to Stripe and reconciling the two systems.

**Setup:** Create Coupons and Promotion Codes in the Stripe Dashboard. No server-side promo validation needed.

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
   - Retrieve full session with `expand: ["line_items.data.price.product", "total_details.breakdown", "discounts"]`
   - Call `fulfillOrder(fullSession)`
4. Return 200 on success; **return 500 on fulfillment failure** so Stripe retries

**Retry behavior:**
- Stripe retries failed webhook deliveries for up to 3 days with exponential backoff
- Returning non-2xx triggers a retry; returning 200 stops retries
- Fulfillment is resumable: each step checks prior completion before executing

**Important:** The webhook secret for local dev (Stripe CLI: `whsec_...`) differs from production (Stripe Dashboard webhook endpoint). Vercel deployment needs the Dashboard webhook secret.

---

## OrderCloud Fulfillment (Post-Payment)

**File:** `lib/ordercloud-fulfillment.ts`

**Function:** `fulfillOrder(session)`

**Resumable, idempotent design — each step checks prior completion:**

1. **Find-or-create OC order** — `Orders.List({ filters: { "xp.stripeSessionId": session.id } })`. If found, resume from current state rather than early-exit.
2. **Ensure line items exist** — checks existing line items by ProductID; only creates missing ones. Extracts `ocProductId` from expanded product metadata.
3. **Submit order** — only if `order.Status === "Unsubmitted"`. Throws on failure to trigger webhook retry.
4. **Ensure payment recorded** — checks existing payments by `xp.stripeSessionId`. Only creates if missing.

**Stripe discount metadata** is extracted from the session and stored in `xp`:
- `promoSource: "stripe"` (or null if no discount)
- `stripeDiscountAmountCents`
- `stripePromotionCode`
- `stripeCouponId`

**What OC receives:**
| Field | Value | Source |
|-------|-------|--------|
| `Order.BillingAddress` | Customer address | `session.customer_details` |
| `Order.xp.stripeSessionId` | Session ID | Idempotency key |
| `Order.xp.stripePaymentIntent` | PaymentIntent ID | Payment reference |
| `Order.xp.promoSource` | `"stripe"` or null | Discount attribution |
| `Order.xp.stripeDiscountAmountCents` | Discount in cents | `total_details.amount_discount` |
| `LineItem.ProductID` | OC product ID | Stripe product metadata |
| `LineItem.UnitPrice` | PriceSchedule price (gross) | OC PriceSchedule (not overridden) |
| `LineItem.xp.stripe.grossCents` | Pre-discount total for this line | `item.amount_subtotal` |
| `LineItem.xp.stripe.discountCents` | Discount applied to this line | `item.amount_discount` |
| `LineItem.xp.stripe.netCents` | Post-discount total (what was charged) | `item.amount_total` |
| `LineItem.xp.stripe.promoCode` | Stripe promotion code ID | `session.discounts` |
| `LineItem.xp.stripe.couponId` | Stripe coupon ID | `session.discounts` |
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
| ------ | --------- | ----- |
| API Client | `BF28718C-D373-4109-AFA0-B77F08ECFD0D` | `IsAnonBuyer=false`, `DefaultContextUser=buyer01_user` |
| Buyer | `buyer01` | — |
| User | `buyer01_user` | Has security profile "buyerCommerce" |
| Security Profile | "buyerCommerce" | Roles: Shopper, MeAdmin, OrderAdmin, OrderReader |
| Catalog | `buyer01` | `ViewAllProducts=true`, `Active=true`, assigned to buyer01 |
| Products | (dynamic) | Fetched via `Me.ListProducts()`. Each product needs a PriceSchedule with at least one PriceBreak. Optional `xp.image` for storefront display. |

> **Note:** `OverrideUnitPrice` has been removed from the security profile. OC line items retain PriceSchedule pricing. The OC Promotion `OC451` is no longer used — all promos are Stripe-native.

---

## Cancel & Refund

> **Meeting decision (May 7):** Miranda raised the need to plan for failures where Stripe payment succeeds but OC submission fails, and for refund/cancellation as part of MVP requirements. Robert agreed on creating concrete requirements for these scenarios. Both are now implemented.

### Stripe-Level Utilities

**File:** `lib/stripe-cancel-refund.ts`

- `expireCheckoutSession(sessionId)` — expires an open session. Only works when `session.status === "open"`.
- `refundCheckoutSession(sessionId, amountCents?, reason?)` — issues a full or partial refund against the PaymentIntent.

### Orchestrated Cancel Endpoint

**File:** `pages/api/orders/cancel.ts`

**Endpoint:** `POST /api/orders/cancel`

**Request body:**
```json
{ "orderId": "stripe-B7kUK5Ms" }
```

**Flow:**
1. Get OC order by ID
2. If already canceled → return early (idempotent)
3. Read `xp.stripeSessionId` from the order
4. Retrieve Stripe session
5. If session completed → refund via `refundCheckoutSession`
6. If session open → expire via `expireCheckoutSession`
7. `Orders.Cancel("Outgoing", orderId)` in OC
8. `Orders.Patch` with refund metadata in xp: `canceledAt`, `stripeRefundId`, `stripeRefundStatus`, `stripeRefundAmountCents`, `cancelAction`

### Order Confirmation Page

**File:** `pages/checkout/success.tsx`

Shows session details, customer info, OC order ID (fulfillment), line items with per-item discount breakdown, and a "Cancel & Refund" button. After cancellation, the page updates to show refund details.

### Operational Rules

| Timing | Action | API |
| ------ | ------ | --- |
| Before completion | Expire session, create new one | `stripe.checkout.sessions.expire()` |
| After completion, before fulfillment | Refund or proceed | `stripe.refunds.create()` |
| After fulfillment | Refund + OC cancel via `/api/orders/cancel` | Orchestrated endpoint |

---

## Product Listing

**File:** `pages/api/products/index.ts`

**Endpoint:** `GET /api/products`

Fetches products from OrderCloud's `Me.ListProducts()` endpoint. Returns `id`, `name`, `description`, `priceInCents` (from PriceSchedule PriceBreaks), and `image` (from `xp.image`).

The index page fetches from this endpoint on mount — no hardcoded product data.

---

## Integration Events

> **Meeting decision (May 7):** Integration events (calculate, validate) are not required for this workflow. Stripe webhooks handle payment capture and OC updates. Unless OC specifically requires integration events for actions like calculate/validate, they can be omitted. The API client setup must be precise — integration events for checkout are tied to the API client ID.

---

## File Map

| File | Purpose |
| ---- | ------- |
| `lib/ordercloud.ts` | OC SDK config + Client Credentials auth + token caching |
| `lib/ordercloud-fulfillment.ts` | Post-payment order creation, submission, payment recording (resumable) |
| `lib/stripe-cancel-refund.ts` | Expire open sessions or refund completed payments |
| `pages/api/stripe/create-checkout-session.ts` | Creates Stripe session from OC order data, deletes cart order |
| `pages/api/stripe/webhook.ts` | Receives Stripe events, triggers fulfillment (returns 500 on failure for retry) |
| `pages/api/stripe/session.ts` | Retrieves Stripe session details + computes fulfillment order ID |
| `pages/api/products/index.ts` | Lists products from OrderCloud for the storefront |
| `pages/api/orders/cancel.ts` | Orchestrates cancel across Stripe (refund) + OC (cancel) |
| `components/Minicart.tsx` | Cart drawer with checkout button |
| `context/cart.tsx` | Client-side cart state (React context) |
| `pages/checkout/success.tsx` | Order confirmation page with cancel/refund UI |
| `pages/checkout/cancel.tsx` | Cancelled/abandoned checkout page |

### Deleted Files

| File | Reason |
| ---- | ------ |
| `lib/ordercloud-promotions.ts` | OC promo resolution removed — Stripe-native promos only |
| `pages/api/stripe/validate-promo.ts` | Cart-side promo validation removed — promos entered on Stripe page |
