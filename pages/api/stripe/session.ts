import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * GET /api/stripe/session?session_id=cs_test_...
 *
 * Returns Stripe Checkout Session details for the confirmation page.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionId = req.query.session_id as string | undefined;
  if (!sessionId) {
    return res.status(400).json({ error: "session_id is required" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: [
        "line_items.data.price.product",
        "total_details.breakdown",
      ],
    });

    // The fulfillment order ID follows the pattern stripe-{last 8 of session ID}.
    // metadata.ocOrderId is the cart order (used for pricing), NOT the fulfillment order.
    const fulfillmentOrderId = `stripe-${session.id.slice(-8)}`;

    return res.status(200).json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email,
      customerName: session.customer_details?.name,
      amountSubtotal: session.amount_subtotal,
      amountTotal: session.amount_total,
      currency: session.currency,
      discountAmount: session.total_details?.amount_discount ?? 0,
      lineItems: (session.line_items?.data ?? []).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        amountSubtotal: item.amount_subtotal,
        amountDiscount: item.amount_discount,
        amountTotal: item.amount_total,
      })),
      ocOrderId: fulfillmentOrderId,
      metadata: session.metadata,
      createdAt: new Date((session.created ?? 0) * 1000).toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[session] Error:", message);
    return res.status(500).json({ error: "Failed to retrieve session" });
  }
}
