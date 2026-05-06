import type { NextApiRequest, NextApiResponse } from "next";
import { resolveOcPromotion } from "@/lib/ordercloud-promotions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    return res.status(400).json({ valid: false, error: "No code provided" });
  }

  const promo = await resolveOcPromotion(code);
  if (promo) {
    return res.status(200).json({
      valid: true,
      code: promo.code,
      description: promo.description,
      percentOff: promo.percentOff,
    });
  }

  return res.status(200).json({ valid: false, error: "Invalid promotion code" });
}
