import { Orders, LineItems, Payments } from "ordercloud-javascript-sdk";
import type Stripe from "stripe";
import { getOcToken } from "./ordercloud";

export interface FulfillmentResult {
  orderId: string;
  paymentId: string;
  resumed: boolean;
}

/**
 * Resolve the OC Product ID from a Stripe line item's expanded product.
 */
function resolveProductId(item: Stripe.LineItem): string {
  const stripeProduct = item.price?.product;
  if (
    typeof stripeProduct === "object" &&
    stripeProduct !== null &&
    "metadata" in stripeProduct
  ) {
    const meta = (stripeProduct as { metadata?: Record<string, string> })
      .metadata;
    return (
      meta?.ocProductId ||
      (stripeProduct as { id?: string }).id ||
      "unknown-product"
    );
  }
  if (typeof stripeProduct === "string") return stripeProduct;
  return "unknown-product";
}

/**
 * Build Stripe discount metadata from a completed Checkout Session.
 * Returns null when no Stripe-native discount was applied.
 */
function extractStripeDiscount(session: Stripe.Checkout.Session) {
  const discount = (session as { total_details?: { amount_discount?: number } })
    .total_details?.amount_discount;
  if (!discount) return null;

  // Stripe exposes applied promo codes on the session under discounts (v2025+)
  const discounts = (
    session as { discounts?: Array<{ promotion_code?: string; coupon?: string }> }
  ).discounts;

  return {
    stripeDiscountAmountCents: discount,
    stripePromotionCode: discounts?.[0]?.promotion_code ?? null,
    stripeCouponId: discounts?.[0]?.coupon ?? null,
  };
}

/**
 * Resumable, idempotent fulfillment.
 *
 * Each step checks whether it already completed so a webhook retry
 * (or manual replay) picks up where a previous attempt left off
 * instead of silently skipping incomplete work.
 *
 * Steps:
 *   1. Find-or-create OC order  (keyed on xp.stripeSessionId)
 *   2. Ensure line items exist
 *   3. Submit order              (skip if status != Unsubmitted)
 *   4. Ensure payment recorded   (skip if payment already exists)
 */
export async function fulfillOrder(
  session: Stripe.Checkout.Session,
): Promise<FulfillmentResult> {
  await getOcToken();

  let resumed = false;
  const expectedOrderId = `stripe-${session.id.slice(-8)}`;

  // ── Step 1: Find or create the order ──────────────────────────
  let existingOrders;
  try {
    existingOrders = await Orders.List("Outgoing", {
      filters: { "xp.stripeSessionId": session.id },
    });
  } catch (err: unknown) {
    const ocErr = err as { status?: number; errors?: unknown };
    console.error(
      "[oc-fulfillment] Orders.List failed:",
      JSON.stringify(ocErr.errors ?? err),
    );
    throw err;
  }

  let order = existingOrders.Items?.[0];
  const discountMeta = extractStripeDiscount(session);

  if (order) {
    resumed = true;
    console.log("[oc-fulfillment] Resuming existing order:", order.ID);
  } else {
    try {
      order = await Orders.Create("Outgoing", {
        ID: expectedOrderId,
        BillingAddress: {
          FirstName:
            session.customer_details?.name?.split(" ")[0] || "Guest",
          LastName:
            session.customer_details?.name?.split(" ").slice(1).join(" ") ||
            "Shopper",
          Street1: session.customer_details?.address?.line1 || "N/A",
          City: session.customer_details?.address?.city || "N/A",
          State: session.customer_details?.address?.state || "N/A",
          Zip: session.customer_details?.address?.postal_code || "00000",
          Country: session.customer_details?.address?.country || "US",
        },
        xp: {
          stripeSessionId: session.id,
          stripePaymentIntent: session.payment_intent,
          promoSource: discountMeta ? "stripe" : null,
          ...(discountMeta ?? {}),
        },
      });
      console.log("[oc-fulfillment] Order created:", order.ID);
    } catch (err: unknown) {
      const ocErr = err as {
        status?: number;
        errors?: unknown;
        message?: string;
      };
      console.error(
        "[oc-fulfillment] Orders.Create failed:",
        JSON.stringify(ocErr.errors ?? ocErr.message ?? err),
      );
      throw err;
    }
  }

  const orderId = order.ID!;

  // ── Step 2: Ensure line items exist ───────────────────────────
  const existingLineItems = await LineItems.List("Outgoing", orderId);
  const existingProductIds = new Set(
    (existingLineItems.Items ?? []).map((li) => li.ProductID),
  );

  if (session.line_items?.data) {
    for (const item of session.line_items.data) {
      const productId = resolveProductId(item);
      if (existingProductIds.has(productId)) continue; // already added

      try {
        // Stripe exposes per-line-item discount details:
        //   amount_subtotal = gross (before discount)
        //   amount_discount = discount applied to this line
        //   amount_total    = net (what was charged)
        const grossCents = item.amount_subtotal ?? item.amount_total ?? 0;
        const discountCents = item.amount_discount ?? 0;
        const netCents = item.amount_total ?? 0;

        await LineItems.Create("Outgoing", orderId, {
          ProductID: productId,
          Quantity: item.quantity || 1,
          // UnitPrice intentionally omitted — OC PriceSchedule is authoritative.
          xp: {
            stripePriceId: item.price?.id,
            description: item.description,
            stripe: {
              grossCents,
              discountCents,
              netCents,
              // Only tag the promo on items that actually received a discount
              ...(discountCents > 0 && discountMeta
                ? {
                    promoCode: discountMeta.stripePromotionCode,
                    couponId: discountMeta.stripeCouponId,
                  }
                : {}),
            },
          },
        });
      } catch (err: unknown) {
        const ocErr = err as { errors?: Array<{ Message?: string }> };
        const msg = ocErr.errors?.[0]?.Message ?? "unknown error";
        console.warn(
          "[oc-fulfillment] Line item skipped:",
          productId,
          msg,
        );
      }
    }
  }

  // ── Step 3: Submit order (only if still Unsubmitted) ──────────
  if (order.Status === "Unsubmitted") {
    try {
      await Orders.Submit("Outgoing", orderId);
      console.log("[oc-fulfillment] Order submitted:", orderId);
    } catch (err: unknown) {
      const ocErr = err as { errors?: Array<{ Message?: string }> };
      const msg = ocErr.errors?.[0]?.Message ?? "unknown error";
      console.error("[oc-fulfillment] Order submit failed:", msg);
      throw err;
    }
  }

  // ── Step 4: Ensure payment recorded ───────────────────────────
  const existingPayments = await Payments.List("Outgoing", orderId);
  const alreadyPaid = (existingPayments.Items ?? []).some(
    (p) => p.xp?.stripeSessionId === session.id,
  );

  if (alreadyPaid) {
    console.log("[oc-fulfillment] Payment already recorded for:", orderId);
    return {
      orderId,
      paymentId: existingPayments.Items![0]!.ID!,
      resumed: true,
    };
  }

  const payment = await Payments.Create("Outgoing", orderId, {
    Type: "CreditCard",
    Accepted: true,
    Amount: (session.amount_total || 0) / 100,
    xp: {
      stripePaymentIntentId: session.payment_intent,
      stripeSessionId: session.id,
      method: "stripe_hosted_checkout",
    },
  });

  return { orderId, paymentId: payment.ID!, resumed };
}
