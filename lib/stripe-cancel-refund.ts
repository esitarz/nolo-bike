import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

type ExpireResult =
  | { action: "none"; reason: string }
  | { action: "expired"; sessionId: string };

type RefundResult = {
  action: "refunded";
  refundId: string;
  status: string | null;
  amount: number;
};

export type CancelResult = ExpireResult | RefundResult;

/**
 * Expire a Checkout Session that has not been completed yet.
 * Use when the cart changes or the customer abandons checkout.
 * Only works while session.status === "open".
 */
export async function expireCheckoutSession(sessionId: string): Promise<ExpireResult> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.status !== "open") {
    return { action: "none", reason: `Session status is "${session.status}"` };
  }
  await stripe.checkout.sessions.expire(sessionId);
  return { action: "expired", sessionId };
}

/**
 * Issue a full or partial refund for a completed Checkout Session.
 * Use post-payment when OC fulfillment should be reversed.
 *
 * @param sessionId - The completed Checkout Session ID
 * @param amountCents - Optional partial refund amount in cents. Omit for full refund.
 * @param reason - Optional Stripe refund reason
 */
export async function refundCheckoutSession(
  sessionId: string,
  amountCents?: number,
  reason?: Stripe.RefundCreateParams.Reason,
): Promise<RefundResult> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const paymentIntentId = session.payment_intent;

  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    throw new Error(
      `Session ${sessionId} has no payment_intent — cannot refund`,
    );
  }

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    ...(amountCents !== undefined && { amount: amountCents }),
    ...(reason && { reason }),
  };

  const refund = await stripe.refunds.create(refundParams);
  return {
    action: "refunded",
    refundId: refund.id,
    status: refund.status ?? "pending",
    amount: refund.amount,
  };
}
