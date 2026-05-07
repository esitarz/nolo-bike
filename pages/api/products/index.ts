import type { NextApiRequest, NextApiResponse } from "next";
import { Me } from "ordercloud-javascript-sdk";
import { getOcToken } from "@/lib/ordercloud";

export interface OcProduct {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  image: string | null;
  images: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await getOcToken();

    const products = await Me.ListProducts({
      catalogID: "all-city",
      pageSize: 100,
    });

    const mapped: OcProduct[] = (products.Items ?? []).map((p) => {
      // PriceSchedule may be embedded or need a separate call.
      // Me.ListProducts includes PriceSchedule when the catalog is configured.
      const priceBreak = p.PriceSchedule?.PriceBreaks?.[0];
      const priceInCents = Math.round((priceBreak?.Price ?? 0) * 100);

      const xp = p.xp as Record<string, any> | undefined;
      const images = (xp?.images ?? []) as string[];

      return {
        id: p.ID!,
        name: p.Name ?? p.ID!,
        description: p.Description ?? "",
        priceInCents,
        image: (xp?.image ?? null) as string | null,
        images,
      };
    });

    return res.status(200).json({ products: mapped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[products] Error:", message);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
}
