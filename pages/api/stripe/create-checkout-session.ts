import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { Me } from "ordercloud-javascript-sdk";
import { resolveOcPromotion } from "@/lib/ordercloud-promotions";
import { getOcToken } from "@/lib/ordercloud";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

interface CartItemPayload {
  id: string;
  quantity: number;
}

// -----------------------------------------------------------------
// Server-side checkout session creation:
// 1. Client sends only product IDs + quantities (no prices)
// 2. Server fetches authoritative product data from OrderCloud
// 3. Promo codes validated against OC Promotions API
// 4. Stripe receives server-validated prices only
// -----------------------------------------------------------------

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
      items?: CartItemPayload[];
      promoCode?: string;
    };

    // Authenticate with OC to fetch product data
    await getOcToken();

    // Resolve cart items — fetch authoritative prices from OC
    const cartItems = items && items.length > 0
      ? items
      : [{ id: "space-horse-tiagra", quantity: 1 }];

    const resolvedItems = await Promise.all(
      cartItems.map(async (item) => {
        const product = await Me.GetProduct(item.id);
        // Price comes from the product's default price schedule (in OC, prices are in dollars)
        const priceSchedule = product.PriceSchedule;
        const priceInCents = Math.round(
          (priceSchedule?.PriceBreaks?.[0]?.Price ?? 0) * 100
        );
        return {
          id: product.ID!,
          name: product.Name!,
          price: priceInCents,
          quantity: item.quantity,
        };
      })
    );

    // Resolve the promo via OrderCloud Promotions API
    const promotion = promoCode ? await resolveOcPromotion(promoCode) : null;

    // Build Stripe line items with server-validated prices
    const line_items: Stripe.Checkout.SessionCreateParams["line_items"] =
      resolvedItems.map((item) => {
        const unitAmount = promotion
          ? Math.round(item.price * (1 - promotion.percentOff / 100))
          : item.price;

        return {
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: item.name,
              metadata: {
                ocProductId: item.id,
              },
              ...(promotion && {
                description: `${promotion.percentOff}% off applied (${promotion.description})`,
              }),
            },
          },
          quantity: item.quantity,
        };
      });

    // Build session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      metadata: {
        orderId: "demo-order-001",
        ...(promotion && {
          promoCode: promotion.code,
          promoDescription: promotion.description,
          promoPercentOff: String(promotion.percentOff),
        }),
      },
    };

    // Path B: If promo was resolved server-side, Stripe just sees final
    // prices. No Stripe coupon or promo codes involved.
    // Path A: If no promo entered in our cart, let the customer enter a
    // Stripe-native code on the hosted checkout page.
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
