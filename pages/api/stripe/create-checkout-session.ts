import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

interface CartItemPayload {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

// -----------------------------------------------------------------
// Path B: Server-side promo resolution (simulates OrderCloud promos)
// In production, this would call the OC Promotions API to validate
// eligibility and return the discount. Here we hardcode a registry.
// -----------------------------------------------------------------
interface Promotion {
  code: string;
  description: string;
  percentOff: number;
}

const OC_PROMOTIONS: Record<string, Promotion> = {
  OC20OFF: {
    code: "OC20OFF",
    description: "OrderCloud Discount",
    percentOff: 20,
  },
};

function resolvePromotion(code: string): Promotion | null {
  return OC_PROMOTIONS[code.toUpperCase()] ?? null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const { items, promoCode } = req.body as {
      items?: CartItemPayload[];
      promoCode?: string;
    };

    // Resolve the promo server-side (simulates OC promo evaluation)
    const promotion = promoCode ? resolvePromotion(promoCode) : null;

    // Build line items — apply discount to unit_amount if promo resolved
    const baseItems = items && items.length > 0
      ? items
      : [
          {
            id: "space-horse-tiagra",
            name: "Space Horse Tiagra",
            price: 189900,
            quantity: 1,
          },
        ];

    const line_items: Stripe.Checkout.SessionCreateParams["line_items"] =
      baseItems.map((item) => {
        const unitAmount = promotion
          ? Math.round(item.price * (1 - promotion.percentOff / 100))
          : item.price;

        return {
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: item.name,
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
    console.error("[create-checkout-session]", message);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
