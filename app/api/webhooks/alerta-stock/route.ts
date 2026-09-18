import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ingredientes, restaurantes, usuarioRestaurantes, usuarios } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { enviarNotificacionAlerta } from "@/lib/notificaciones";
import { obtenerDestinatariosRestaurante } from "@/lib/notificaciones-destinatarios";
import { validateOrThrow, z } from "@/lib/validation";

// Supabase Database Webhook envía este payload al insertar en alertas_inventario
const webhookSchema = z.object({
  type: z.string(),
  record: z.object({
    id: z.string(),
    restaurante_id: z.string(),
    ingrediente_id: z.string(),
    nivel: z.enum(["bajo", "critico"]),
    atendida: z.boolean(),
  }),
});

export async function POST(request: NextRequest) {
  // Verificar secret del webhook para evitar llamadas no autorizadas
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { record } = validateOrThrow(webhookSchema, body);

  // Solo procesar inserts de alertas no atendidas
  if (record.atendida) return NextResponse.json({ ok: true });

  // Obtener datos del ingrediente y restaurante
  const [ing, rest, destinatarios] = await Promise.all([
    db.query.ingredientes.findFirst({ where: eq(ingredientes.id, record.ingrediente_id) }),
    db.query.restaurantes.findFirst({ where: eq(restaurantes.id, record.restaurante_id) }),
    obtenerDestinatariosRestaurante(record.restaurante_id),
  ]);

  if (!ing || !rest) return NextResponse.json({ ok: true });

  // Enviar notificación — si falla NO afecta la alerta ya guardada en BD
  try {
    await enviarNotificacionAlerta({
      ingrediente: ing.nombre,
      nivel: record.nivel,
      stock_actual: ing.stock_actual,
      stock_minimo: ing.stock_minimo,
      unidad: ing.unidad_medida,
      restaurante: destinatarios.restaurante_nombre || rest.nombre,
      destinatario_email: destinatarios.emails,
      chat_id: destinatarios.chat_id,
    });
  } catch (e) {
    // El fallo de notificación NO debe revertir la alerta
    console.error("[Webhook] Error al enviar notificación:", e);
  }

  return NextResponse.json({ ok: true });
}
