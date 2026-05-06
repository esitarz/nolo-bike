import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { fulfillOrder } from "@/lib/ordercloud-fulfillment";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// Must disable body parsing so Stripe can verify the raw body signature.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[webhook] Signature verification failed:", message);
    return res.status(400).json({ error: `Webhook error: ${message}` });
  }

  console.log("[webhook] Received event:", event.id, event.type);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Expand line_items and their products (to get metadata with OC product IDs)
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price.product"],
      });

      console.log("[webhook] Payment completed:", {
        sessionId: fullSession.id,
        paymentIntent: fullSession.payment_intent,
        amountTotal: fullSession.amount_total,
      });

      // Fulfill in OrderCloud
      try {
        const result = await fulfillOrder(fullSession);
        console.log("[webhook] OC fulfillment success:", result);
      } catch (err) {
        // Don't fail the webhook — log for manual reconciliation
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[webhook] OC fulfillment FAILED:", message);
        console.error(
          "[webhook] Session needs manual fulfillment:",
          fullSession.id,
        );
      }

      break;
    }
    default:
      console.log("[webhook] Unhandled event type:", event.type);
  }

  return res.status(200).json({ received: true });
}
