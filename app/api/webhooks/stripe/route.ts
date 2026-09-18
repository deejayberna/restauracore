import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { db } from "@/db";
import { stripeEventosProcesados, restaurantes, logAuditoria, usuarioRestaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { activarRestaurantePorSesion } from "@/lib/registro-actions";
import type { Plan } from "@/lib/planes";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Error: Header stripe-signature requerido.", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[StripeWebhook] STRIPE_WEBHOOK_SECRET no está configurada.");
    return new NextResponse("Error de configuración del servidor.", { status: 500 });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.warn(`[StripeWebhook] Firma inválida rechazada: ${err.message}`);
    return new NextResponse(`Firma de webhook inválida: ${err.message}`, { status: 400 });
  }

  // 1. Verificación estricta de Idempotencia
  const eventoExistente = await db.query.stripeEventosProcesados.findFirst({
    where: eq(stripeEventosProcesados.id, event.id),
  });

  if (eventoExistente) {
    return NextResponse.json({ received: true, yaProcesado: true }, { status: 200 });
  }

  // 2. Procesar el evento según su tipo
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const targetRestId = session.metadata?.restaurante_id || session.client_reference_id;

        let restExistente = null;
        if (targetRestId) {
          restExistente = await db.query.restaurantes.findFirst({
            where: eq(restaurantes.id, targetRestId),
          });
        }

        if (restExistente) {
          const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
          const planContratado = (session.metadata?.plan as Plan) || restExistente.plan;

          await db
            .update(restaurantes)
            .set({
              plan: planContratado,
              stripe_customer_id: customerId || restExistente.stripe_customer_id,
              stripe_subscription_id: subId || restExistente.stripe_subscription_id,
              estado_suscripcion: "activa",
              fecha_fin_trial: null,
            })
            .where(eq(restaurantes.id, restExistente.id));

          // Log de auditoría
          const vinculo = await db.query.usuarioRestaurantes.findFirst({
            where: and(
              eq(usuarioRestaurantes.restaurante_id, restExistente.id),
              eq(usuarioRestaurantes.rol, "dueno")
            ),
          });

          await db.insert(logAuditoria).values({
            restaurante_id: restExistente.id,
            usuario_id: vinculo?.usuario_id || null,
            accion: "MEMBRESIA_ACTIVADA_STRIPE",
            valores_nuevos: {
              plan: planContratado,
              stripe_customer_id: customerId,
              stripe_subscription_id: subId,
              session_id: session.id,
            },
          });
        } else {
          await activarRestaurantePorSesion(session.id);
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (customerId) {
          const rest = await db.query.restaurantes.findFirst({
            where: eq(restaurantes.stripe_customer_id, customerId),
          });
          if (rest) {
            const vinculo = await db.query.usuarioRestaurantes.findFirst({
              where: and(
                eq(usuarioRestaurantes.restaurante_id, rest.id),
                eq(usuarioRestaurantes.rol, "dueno")
              ),
            });
            if (vinculo) {
              await db.insert(logAuditoria).values({
                restaurante_id: rest.id,
                usuario_id: vinculo.usuario_id,
                accion: "AVISO_FIN_TRIAL_SUSCRIPCION",
                valores_nuevos: { subscription_id: sub.id, fecha_aviso: new Date().toISOString() },
              });
            }
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await db
            .update(restaurantes)
            .set({ estado_suscripcion: "activa" })
            .where(eq(restaurantes.stripe_customer_id, customerId));
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const rest = await db.query.restaurantes.findFirst({
            where: eq(restaurantes.stripe_customer_id, customerId),
          });
          if (rest) {
            await db
              .update(restaurantes)
              .set({ estado_suscripcion: "pago_fallido" })
              .where(eq(restaurantes.id, rest.id));

            const vinculo = await db.query.usuarioRestaurantes.findFirst({
              where: and(
                eq(usuarioRestaurantes.restaurante_id, rest.id),
                eq(usuarioRestaurantes.rol, "dueno")
              ),
            });

            if (vinculo) {
              await db.insert(logAuditoria).values({
                restaurante_id: rest.id,
                usuario_id: vinculo.usuario_id,
                accion: "FALLO_PAGO_SUSCRIPCION",
                valores_nuevos: {
                  invoice_id: invoice.id,
                  monto: invoice.amount_due,
                  intento: invoice.attempt_count,
                },
              });
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (customerId) {
          await db
            .update(restaurantes)
            .set({ estado_suscripcion: "cancelada" })
            .where(eq(restaurantes.stripe_customer_id, customerId));
        }
        break;
      }

      default:
        // Otros eventos de Stripe se registran como recibidos sin acción especial
        break;
    }

    // 3. Asentar en stripe_eventos_procesados para idempotencia
    await db.insert(stripeEventosProcesados).values({
      id: event.id,
      tipo: event.type,
    }).onConflictDoNothing();

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error(`[StripeWebhook] Error procesando evento ${event.type}:`, err);
    return new NextResponse(`Error interno procesando webhook: ${err.message}`, { status: 500 });
  }
}

