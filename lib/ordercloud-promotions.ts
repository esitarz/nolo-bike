import { Me } from "ordercloud-javascript-sdk";
import { getOcToken } from "./ordercloud";

export interface ResolvedPromotion {
  code: string;
  description: string;
  percentOff: number;
}

/**
 * Validates a promo code against OrderCloud's Promotions API.
 * Returns the resolved promotion if valid, null otherwise.
 */
export async function resolveOcPromotion(
  code: string,
): Promise<ResolvedPromotion | null> {
  await getOcToken();

  try {
    const promotions = await Me.ListPromotions({
      filters: { Code: code },
    });

    const promo = promotions.Items?.[0];
    if (!promo || !promo.Active) {
      return null;
    }

    // Parse percent off from ValueExpression (e.g. "item.LineTotal * 0.451")
    const percentMatch = promo.ValueExpression?.match(
      /\*\s*([\d.]+)/,
    );
    const percentOff = percentMatch && percentMatch[1]
      ? parseFloat(percentMatch[1]) * 100
      : 0;

    if (percentOff <= 0) {
      console.warn(
        "[oc-promotions] Could not parse percentOff from ValueExpression:",
        promo.ValueExpression,
      );
      return null;
    }

    return {
      code: promo.Code!,
      description: promo.Description || promo.Name || "Promotion",
      percentOff,
    };
  } catch (err: unknown) {
    const ocErr = err as { errors?: Array<{ Message?: string }> };
    console.error(
      "[oc-promotions] Failed to resolve promo:",
      ocErr.errors?.[0]?.Message ?? err,
    );
    return null;
  }
}
