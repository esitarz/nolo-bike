import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { Me, Orders, LineItems } from "ordercloud-javascript-sdk";
import { resolveOcPromotion } from "@/lib/ordercloud-promotions";
import { getOcToken } from "@/lib/ordercloud";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// -----------------------------------------------------------------
// Server-side checkout session creation:
// 1. Authenticate with OC (Client Credentials + DefaultContextUser)
// 2. Decode the JWT to extract the current order ID (cart)
// 3. Fetch line items from that OC order — authoritative pricing
// 4. Optionally apply OC promotions
// 5. Create Stripe Checkout Session from OC line items
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
    const { items, promoCode } = req.body as {
      items?: { id: string; quantity: number }[];
      promoCode?: string;
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

    // 4. Resolve the promo via OrderCloud Promotions API
    const promotion = promoCode ? await resolveOcPromotion(promoCode) : null;

    // 5. Build Stripe line items from OC order line items
    const line_items: Stripe.Checkout.SessionCreateParams["line_items"] =
      lineItems.Items.map((li) => {
        // UnitPrice is the authoritative price from OC (in dollars)
        const priceInCents = Math.round((li.UnitPrice ?? 0) * 100);
        const unitAmount = promotion
          ? Math.round(priceInCents * (1 - promotion.percentOff / 100))
          : priceInCents;

        return {
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: li.Product?.Name ?? li.ProductID ?? "Product",
              metadata: {
                ocProductId: li.ProductID ?? "",
                ocLineItemId: li.ID ?? "",
              },
              ...(promotion && {
                description: `${promotion.percentOff}% off applied (${promotion.description})`,
              }),
            },
          },
          quantity: li.Quantity ?? 1,
        };
      });

    // 6. Build session params — include OC order ID in metadata
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      metadata: {
        ocOrderId: orderId,
        ...(promotion && {
          promoCode: promotion.code,
          promoDescription: promotion.description,
          promoPercentOff: String(promotion.percentOff),
        }),
      },
    };

    // If no promo entered in our cart, allow Stripe-native promo codes
    if (!promotion) {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

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
