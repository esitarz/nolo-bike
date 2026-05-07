import type { NextApiRequest, NextApiResponse } from "next";
import { Orders } from "ordercloud-javascript-sdk";
import { getOcToken } from "@/lib/ordercloud";
import {
  refundCheckoutSession,
  expireCheckoutSession,
} from "@/lib/stripe-cancel-refund";

/**
 * POST /api/orders/cancel
 *
 * Orchestrates cancellation across both Stripe and OrderCloud:
 *   1. Refund (or expire) the Stripe session
 *   2. Cancel the OC order
 *   3. Record refund metadata in OC order xp
 *
 * Body: { ocOrderId: string, amountCents?: number }
 *   - ocOrderId: the OC order ID (e.g. "stripe-Cxi67QgN")
 *   - amountCents: optional partial refund amount. Omit for full refund.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ocOrderId, amountCents } = req.body as {
    ocOrderId?: string;
    amountCents?: number;
  };

  if (!ocOrderId) {
    return res.status(400).json({ error: "ocOrderId is required" });
  }

  try {
    await getOcToken();

    // 1. Fetch the OC order to get the Stripe session ID
    const order = await Orders.Get("Outgoing", ocOrderId);
    const stripeSessionId = order.xp?.stripeSessionId as string | undefined;

    if (!stripeSessionId) {
      return res.status(400).json({
        error: "Order has no linked Stripe session",
        ocOrderId,
      });
    }

    // 2. Already canceled? Don't double-process.
    if (order.Status === "Canceled") {
      return res.status(200).json({
        action: "already-canceled",
        ocOrderId,
      });
    }

    // 3. Refund or expire in Stripe
    let stripeResult;
    if (order.IsSubmitted) {
      // Order was paid — issue refund
      stripeResult = await refundCheckoutSession(
        stripeSessionId,
        amountCents,
        "requested_by_customer",
      );
    } else {
      // Order not yet paid — try to expire the checkout session
      stripeResult = await expireCheckoutSession(stripeSessionId);
    }

    // 4. Cancel in OC
    await Orders.Cancel("Outgoing", ocOrderId);

    // 5. Record refund metadata in OC order xp
    await Orders.Patch("Outgoing", ocOrderId, {
      xp: {
        canceledAt: new Date().toISOString(),
        stripeRefundId: stripeResult.action === "refunded"
          ? stripeResult.refundId
          : null,
        stripeRefundStatus: stripeResult.action === "refunded"
          ? stripeResult.status
          : null,
        stripeRefundAmountCents: stripeResult.action === "refunded"
          ? stripeResult.amount
          : null,
        cancelAction: stripeResult.action,
      },
    });

    return res.status(200).json({
      action: "canceled",
      ocOrderId,
      stripe: stripeResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cancel-order] Error:", message);
    return res.status(500).json({
      error: "Failed to cancel order",
      details: message,
    });
  }
}
