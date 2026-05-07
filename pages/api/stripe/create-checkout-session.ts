import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { Me, Orders, LineItems } from "ordercloud-javascript-sdk";
import { getOcToken } from "@/lib/ordercloud";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// -----------------------------------------------------------------
// Server-side checkout session creation:
// 1. Authenticate with OC (Client Credentials + DefaultContextUser)
// 2. Decode the JWT to extract the current order ID (cart)
// 3. Fetch line items from that OC order — authoritative pricing
// 4. Create Stripe Checkout Session from OC line items
//    Stripe-native promo codes enabled via allow_promotion_codes
// -----------------------------------------------------------------

/**
 * Decode the payload of a JWT without verification.
 * We trust this token because we just obtained it from OC Auth.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error("Invalid JWT format");
  const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
  return JSON.parse(payload);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[create-checkout-session] STRIPE_SECRET_KEY not set");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const { items } = req.body as {
      items?: { id: string; quantity: number }[];
    };

    if (!items || items.length === 0) {
      return res.status(400).json({
        error: "Cart is empty",
        details: "Add items to your cart before checking out.",
      });
    }

    // 1. Authenticate with OC
    const accessToken = await getOcToken();

    // 2. Decode the JWT to look for an existing order ID (anonymous buyer cart)
    const claims = decodeJwtPayload(accessToken);
    let orderId = claims.orderid as string | undefined;

    // If no orderid in JWT, check for an existing unsubmitted order
    if (!orderId) {
      const orders = await Me.ListOrders({
        sortBy: ["!DateCreated"],
        filters: { Status: "Unsubmitted" },
        pageSize: 1,
      });
      orderId = orders.Items?.[0]?.ID;
    }

    // 3. Create a new OC order if none exists, then add line items
    //    OC applies PriceSchedule pricing — this is the authoritative source.
    if (!orderId) {
      const order = await Orders.Create("Outgoing", {});
      orderId = order.ID!;
    } else {
      // Clear existing line items so the OC order matches the client cart
      const existing = await LineItems.List("Outgoing", orderId);
      await Promise.all(
        (existing.Items ?? []).map((li) =>
          LineItems.Delete("Outgoing", orderId!, li.ID!)
        )
      );
    }

    // Add line items — OC sets UnitPrice from the product's PriceSchedule
    await Promise.all(
      items.map((item) =>
        LineItems.Create("Outgoing", orderId!, {
          ProductID: item.id,
          Quantity: item.quantity,
        })
      )
    );

    // 4. Read back line items — UnitPrice is now OC-authoritative
    const lineItems = await LineItems.List("Outgoing", orderId);

    if (!lineItems.Items || lineItems.Items.length === 0) {
      return res.status(400).json({
        error: "Failed to create order line items",
        details: "OrderCloud did not return any line items.",
      });
    }

    // 5. Build Stripe line items from OC order line items
    const line_items: Stripe.Checkout.SessionCreateParams["line_items"] =
      lineItems.Items.map((li) => {
        const priceInCents = Math.round((li.UnitPrice ?? 0) * 100);

        return {
          price_data: {
            currency: "usd",
            unit_amount: priceInCents,
            product_data: {
              name: li.Product?.Name ?? li.ProductID ?? "Product",
              metadata: {
                ocProductId: li.ProductID ?? "",
                ocLineItemId: li.ID ?? "",
              },
            },
          },
          quantity: li.Quantity ?? 1,
        };
      });

    // 6. Build session params — always enable Stripe-native promo codes
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items,
      allow_promotion_codes: true,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      metadata: {},
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Clean up the temporary OC cart order — it was only used for pricing.
    // The fulfillment webhook creates the real order.
    try {
      await Orders.Delete("Outgoing", orderId);
    } catch {
      // Non-critical — orphan order is harmless, just noisy
      console.warn("[create-checkout-session] Failed to delete cart order:", orderId);
    }

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[create-checkout-session] Error:", message);
    console.error("[create-checkout-session] Stack:", err);
    return res.status(500).json({ 
      error: "Failed to create checkout session",
      details: message,
    });
  }
}
