import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY no está configurada en las variables de entorno.");
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia" as any,
    appInfo: {
      name: "RestauraCore SaaS",
      version: "1.0.0",
    },
  });

  return stripeClient;
}

export const STRIPE_PRICES = {
  basico: process.env.STRIPE_PRICE_BASICO || "price_mock_basico",
  pro: process.env.STRIPE_PRICE_PRO || "price_mock_pro",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "price_mock_enterprise",
};

