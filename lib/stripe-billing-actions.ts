"use server";

import { db } from "@/db";
import { restaurantes, logAuditoria } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";

export async function crearPortalClienteStripeAction(restauranteId: string) {
  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restauranteId),
  });

  if (!rest || !rest.stripe_customer_id) {
    return { error: "No se encontró un identificador de cliente de Stripe para este restaurante." };
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: rest.stripe_customer_id,
      return_url: `${appUrl}/restaurante/configuracion`,
    });

    return { url: session.url };
  } catch (err: any) {
    console.error("[StripeCustomerPortal] Error generando portal:", err);
    return { error: "No se pudo abrir el portal de facturación de Stripe. Intenta más tarde." };
  }
}

export async function obtenerFacturasStripeAction(restauranteId: string) {
  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restauranteId),
  });

  if (!rest || !rest.stripe_customer_id) {
    return { facturas: [] };
  }

  const stripe = getStripeClient();

  try {
    const invoices = await stripe.invoices.list({
      customer: rest.stripe_customer_id,
      limit: 10,
    });

    const facturas = invoices.data.map((inv) => ({
      id: inv.id,
      numero: inv.number,
      fecha: new Date(inv.created * 1000).toISOString(),
      monto: inv.amount_paid ? (inv.amount_paid / 100).toFixed(2) : (inv.total / 100).toFixed(2),
      moneda: inv.currency.toUpperCase(),
      estado: inv.status,
      pdfUrl: inv.invoice_pdf,
      reciboUrl: inv.hosted_invoice_url,
    }));

    return { facturas };
  } catch (err) {
    console.error("[StripeInvoices] Error consultando facturas:", err);
    return { facturas: [] };
  }
}

