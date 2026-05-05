import type { NextApiRequest, NextApiResponse } from "next";

// Same promo registry as create-checkout-session — in production this
// would be an OrderCloud API call to validate promo eligibility.
const OC_PROMOTIONS: Record<string, { code: string; description: string; percentOff: number }> = {
  OC20OFF: {
    code: "OC20OFF",
    description: "OrderCloud Loyalty Discount",
    percentOff: 20,
  },
  PARTNER15: {
    code: "PARTNER15",
    description: "Partner Program Discount",
    percentOff: 15,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    return res.status(400).json({ valid: false, error: "No code provided" });
  }

  const promo = OC_PROMOTIONS[code.toUpperCase()];
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
