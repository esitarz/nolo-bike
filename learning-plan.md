# Your Stripe Learning Plan

## Objective
You are going to learn Stripe by shipping a real, end-to-end checkout flow in this repo.

Your target outcome is simple:
- Customer can start checkout.
- Stripe Hosted Checkout collects payment.
- Your app confirms payment through a webhook.
- You can trace one test order from cart to paid state.

## Is this repo a good jumping-off point?
Short answer: yes, but only as a lightweight starter.

What is good:
- It is a small Next.js + TypeScript app, so you can add API routes quickly.
- It has almost no complexity, which is ideal for focused learning.

What is missing:
- No Stripe SDK dependency yet.
- No checkout/cart domain model yet.
- No webhook endpoint yet.

Verdict:
- Good for learning Stripe integration mechanics.
- Not production-ready commerce scaffolding yet.

## 10-Day Straight Shot

## Days 1-2: Stripe fundamentals in code
Goal: understand Hosted Checkout and prove a successful redirect.

Tasks:
1. Install Stripe SDK (`stripe`) in this project.
2. Add a server route to create a Checkout Session.
3. Add a button in UI that calls your route and redirects to `session.url`.
4. Use Stripe test card `4242 4242 4242 4242` to complete payment.

Success criteria:
- You can start from your app and complete a Stripe test payment.

## Days 3-4: Webhooks and trust
Goal: trust payment completion via server-to-server events, not browser redirects.

Tasks:
1. Add webhook route to receive Stripe events.
2. Verify webhook signatures using `STRIPE_WEBHOOK_SECRET`.
3. Handle `checkout.session.completed` (minimum required event).
4. Log event id and session id; ignore duplicates by event id.

Success criteria:
- You can run Stripe CLI locally and observe webhook handling:
  - `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Your app records a single completion per event id.

## Days 5-6: Data mapping
Goal: map your app data to Stripe cleanly.

Tasks:
1. Create a tiny internal order model (even in-memory for now).
2. Put your internal order id in Stripe session metadata.
3. On webhook completion, mark the order as paid.
4. Store Stripe references (`checkout_session_id`, `payment_intent`).

Success criteria:
- You can answer: "Which internal order did this Stripe payment complete?"

## Days 7-8: Failure paths and safety
Goal: make the flow reliable.

Tasks:
1. Handle cancel flow (`cancel_url`) clearly in UI.
2. Add basic server-side validation for line items and amount.
3. Add idempotency guard for webhook processing.
4. Add concise error logging for failed session creation and webhook failures.

Success criteria:
- Failures do not create inconsistent paid states.

## Days 9-10: Document + test like an engineer
Goal: make your learning transferable.

Tasks:
1. Write a short runbook: env vars, local webhook steps, test cards.
2. Add a test checklist:
   - successful payment
   - canceled checkout
   - duplicate webhook delivery
3. Capture known limitations and next iteration ideas.

Success criteria:
- A teammate could run your flow locally in under 20 minutes.

## Stripe Accuracy Notes (Important)
Use these as non-negotiables while building:
- Create Checkout Sessions on the server only (never expose secret key).
- Treat webhook events as source of truth for completion.
- Verify webhook signatures with the raw request body.
- Expect duplicate webhook deliveries and process idempotently.
- Keep publishable key in client env var and secret key in server env var.

## Minimum Environment Variables
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` (for success/cancel URLs)

## Current Repo Gap Checklist
You still need to add:
- Stripe dependency in `package.json`
- `pages/api/stripe/create-checkout-session.ts`
- `pages/api/stripe/webhook.ts`
- A checkout button in UI (for example on home page)
- A tiny paid-order persistence approach (file, memory, or DB)

## If you want to move faster
Build in this order only:
1. Session creation route
2. Redirect button
3. Webhook verification
4. Metadata mapping
5. Cleanup and docs

That sequence gives you the fastest useful feedback loop while teaching the right Stripe habits.