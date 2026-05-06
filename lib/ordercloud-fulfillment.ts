import { Orders, LineItems, Payments } from "ordercloud-javascript-sdk";
import type Stripe from "stripe";
import { getOcToken } from "./ordercloud";

interface FulfillmentResult {
  orderId: string;
  paymentId: string;
}

/**
 * Creates an order in OrderCloud from a completed Stripe Checkout Session,
 * then records the Stripe payment against it.
 */
export async function fulfillOrder(
  session: Stripe.Checkout.Session,
): Promise<FulfillmentResult> {
  await getOcToken();

  // Idempotency: check if we already created this order
  let existingOrders;
  try {
    existingOrders = await Orders.List("Outgoing", {
      filters: { "xp.stripeSessionId": session.id },
    });
  } catch (err: unknown) {
    const ocErr = err as { status?: number; errors?: unknown };
    console.error("[oc-fulfillment] Orders.List failed:", JSON.stringify(ocErr.errors ?? err));
    throw err;
  }

  if (existingOrders.Items && existingOrders.Items.length > 0) {
    const existing = existingOrders.Items[0]!;
    console.log("[oc-fulfillment] Order already exists:", existing.ID);
    return { orderId: existing.ID!, paymentId: "already-recorded" };
  }

  // 1. Create the order
  let order;
  try {
    order = await Orders.Create("Outgoing", {
      ID: `stripe-${session.id.slice(-8)}`,
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
        promoCode: session.metadata?.promoCode || null,
      },
    });
    console.log("[oc-fulfillment] Order created:", order.ID);
  } catch (err: unknown) {
    const ocErr = err as { status?: number; errors?: unknown; message?: string };
    console.error("[oc-fulfillment] Orders.Create failed:", JSON.stringify(ocErr.errors ?? ocErr.message ?? err));
    throw err;
  }

  // 2. Add line items
  if (session.line_items?.data) {
    for (const item of session.line_items.data) {
      // Resolve the OC Product ID: prefer metadata from product_data, fall back to Stripe product ID
      const stripeProduct = item.price?.product;
      let productId = "unknown-product";
      if (typeof stripeProduct === "object" && stripeProduct !== null && "metadata" in stripeProduct) {
        const meta = (stripeProduct as { metadata?: Record<string, string> }).metadata;
        productId = meta?.ocProductId || (stripeProduct as { id?: string }).id || productId;
      } else if (typeof stripeProduct === "string") {
        productId = stripeProduct;
      }

      try {
        await LineItems.Create("Outgoing", order.ID!, {
          ProductID: productId,
          Quantity: item.quantity || 1,
          UnitPrice:
            (item.amount_total || 0) / (item.quantity || 1) / 100,
          xp: {
            stripePriceId: item.price?.id,
            description: item.description,
          },
        });
      } catch (err: unknown) {
        // Product may not exist in OC — log and continue
        const ocErr = err as { errors?: Array<{ Message?: string }> };
        const msg = ocErr.errors?.[0]?.Message ?? "unknown error";
        console.warn("[oc-fulfillment] Line item skipped:", productId, msg);
      }
    }
  }

  // 3. Submit the order
  try {
    await Orders.Submit("Outgoing", order.ID!);
  } catch (err: unknown) {
    const ocErr = err as { errors?: Array<{ Message?: string }> };
    const msg = ocErr.errors?.[0]?.Message ?? "unknown error";
    console.warn("[oc-fulfillment] Order submit failed:", msg);
  }

  // 4. Record payment
  const payment = await Payments.Create("Outgoing", order.ID!, {
    Type: "CreditCard",
    Accepted: true,
    Amount: (session.amount_total || 0) / 100,
    xp: {
      stripePaymentIntentId: session.payment_intent,
      stripeSessionId: session.id,
      method: "stripe_hosted_checkout",
    },
  });

  return { orderId: order.ID!, paymentId: payment.ID! };
}
