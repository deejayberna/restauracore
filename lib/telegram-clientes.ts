import { db } from "@/db";
import {
  clientesTelegram,
  vinculacionesTelegramPendientes,
  restaurantes,
  ordenes,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

export interface GenerarLinkInput {
  ordenId: string;
  restauranteId: string;
}

export interface ProcesarStartInput {
  chatId: string;
  nombre?: string;
  username?: string;
  startPayload: string;
}

export interface EnviarMensajeRecuperacionInput {
  restauranteId: string;
  clienteId: string;
  mensaje: string;
}

/**
 * Helper para llamar a la API de Telegram Bot
 */
async function callTelegramApi(endpoint: string, payload: Record<string, any>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN no está configurado.");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error(`[Telegram] Error llamando a ${endpoint}:`, err);
    return false;
  }
}

/**
 * 1. Generar deep-link de vinculación temporal para una orden
 */
export async function generarLinkVinculacionTelegram({
  ordenId,
  restauranteId,
}: GenerarLinkInput) {
  const randomHex = crypto.randomBytes(8).toString("hex");
  const codigo = `v_${randomHex}`;
  const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  await db.insert(vinculacionesTelegramPendientes).values({
    codigo,
    restaurante_id: restauranteId,
    orden_id: ordenId,
    expira_en: expiraEn,
  });

  const botUsername =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    process.env.TELEGRAM_BOT_USERNAME ||
    "RestauraninverBot";

  const link = `https://t.me/${botUsername}?start=${codigo}`;

  return { link, codigo };
}

/**
 * 2. Procesar el evento /start enviado al bot de Telegram
 */
export async function procesarStartTelegram({
  chatId,
  nombre,
  username,
  startPayload,
}: ProcesarStartInput) {
  if (!startPayload) {
    return { ok: false, error: "Falta el payload de inicio" };
  }

  const pendiente = await db.query.vinculacionesTelegramPendientes.findFirst({
    where: eq(vinculacionesTelegramPendientes.codigo, startPayload),
  });

  if (!pendiente) {
    return { ok: false, error: "Código de vinculación inválido o expirado" };
  }

  // Eliminar el código pendiente para que sea de un solo uso
  await db
    .delete(vinculacionesTelegramPendientes)
    .where(eq(vinculacionesTelegramPendientes.codigo, startPayload));

  // Obtener restaurante
  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, pendiente.restaurante_id),
  });

  const nombreRest = rest?.nombre || "nuestro restaurante";

  // Verificar si ya existe cliente con este chatId en este restaurante
  const clienteExistente = await db.query.clientesTelegram.findFirst({
    where: and(
      eq(clientesTelegram.restaurante_id, pendiente.restaurante_id),
      eq(clientesTelegram.chat_id_telegram, chatId)
    ),
  });

  const nombreFinal = nombre || (username ? `@${username}` : "Comensal");

  if (clienteExistente) {
    await db
      .update(clientesTelegram)
      .set({
        total_visitas: sql`${clientesTelegram.total_visitas} + 1`,
        ultima_visita_en: new Date(),
        nombre_telegram: nombreFinal,
        orden_id_origen: pendiente.orden_id,
        activo: true,
      })
      .where(eq(clientesTelegram.id, clienteExistente.id));
  } else {
    await db.insert(clientesTelegram).values({
      restaurante_id: pendiente.restaurante_id,
      chat_id_telegram: chatId,
      nombre_telegram: nombreFinal,
      codigo_vinculacion: startPayload,
      orden_id_origen: pendiente.orden_id,
      total_visitas: 1,
      ultima_visita_en: new Date(),
      activo: true,
    });
  }

  // Enviar mensaje de bienvenida neutral sin falsas promesas
  const textoBienvenida = `¡Hola ${nombreFinal}! 👋\n\nGracias por visitarnos en *${nombreRest}*. Te mantendremos al tanto del estado de tus pedidos y te compartiremos beneficios y promociones cuando estén disponibles.`;

  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: textoBienvenida,
    parse_mode: "Markdown",
  });

  return { ok: true, restauranteNombre: nombreRest };
}

/**
 * 3. Obtener listado de clientes de Telegram para un restaurante con métricas de inactividad
 */
export async function obtenerClientesTelegram(
  restauranteId: string,
  diasInactividad: number = 21
) {
  const lista = await db.query.clientesTelegram.findMany({
    where: eq(clientesTelegram.restaurante_id, restauranteId),
    orderBy: (c, { desc }) => [desc(c.ultima_visita_en)],
  });

  const umbralMs = diasInactividad * 24 * 60 * 60 * 1000;
  const ahora = Date.now();

  let inactivosCount = 0;

  const clientes = lista.map((c) => {
    const msDesdeVisita = ahora - new Date(c.ultima_visita_en).getTime();
    const esInactivo = msDesdeVisita >= umbralMs;
    if (esInactivo) inactivosCount++;

    return {
      id: c.id,
      chatId: c.chat_id_telegram,
      nombre: c.nombre_telegram || "Comensal",
      totalVisitas: c.total_visitas,
      ultimaVisita: c.ultima_visita_en,
      ultimoMensajeRecuperacion: c.ultimo_mensaje_recuperacion_en,
      activo: c.activo,
      esInactivo,
    };
  });

  return {
    clientes,
    total: clientes.length,
    inactivos: inactivosCount,
    diasInactividad,
  };
}

/**
 * 4. Enviar mensaje de recuperación individual con control antispam de 7 días
 */
export async function enviarMensajeRecuperacion({
  restauranteId,
  clienteId,
  mensaje,
}: EnviarMensajeRecuperacionInput) {
  const cliente = await db.query.clientesTelegram.findFirst({
    where: eq(clientesTelegram.id, clienteId),
  });

  if (!cliente || cliente.restaurante_id !== restauranteId) {
    return { ok: false, error: "El cliente no pertenece a este restaurante" };
  }

  // Protección antispam: 1 mensaje cada 7 días
  if (cliente.ultimo_mensaje_recuperacion_en) {
    const sieteDiasMs = 7 * 24 * 60 * 60 * 1000;
    const tiempoDesdeUltimo = Date.now() - new Date(cliente.ultimo_mensaje_recuperacion_en).getTime();
    if (tiempoDesdeUltimo < sieteDiasMs) {
      return {
        ok: false,
        error: "Por protección antispam se permite 1 cada 7 días para este comensal.",
      };
    }
  }

  const exito = await callTelegramApi("sendMessage", {
    chat_id: cliente.chat_id_telegram,
    text: mensaje,
  });

  if (!exito) {
    return { ok: false, error: "No se pudo entregar el mensaje por Telegram." };
  }

  await db
    .update(clientesTelegram)
    .set({
      ultimo_mensaje_recuperacion_en: new Date(),
    })
    .where(eq(clientesTelegram.id, clienteId));

  return { ok: true };
}

/**
 * 5. Notificación transaccional: Pedido Listo
 */
export async function notificarPedidoListoTelegram(ordenId: string) {
  const cliente = await db.query.clientesTelegram.findFirst({
    where: eq(clientesTelegram.orden_id_origen, ordenId),
  });

  if (!cliente) return false;

  return callTelegramApi("sendMessage", {
    chat_id: cliente.chat_id_telegram,
    text: "¡Tu pedido está listo para ser servido! 🍽️ Disfruta de tus alimentos.",
  });
}

/**
 * 6. Notificación transaccional: Pedido Cancelado
 */
export async function notificarPedidoCanceladoTelegram(ordenId: string) {
  const cliente = await db.query.clientesTelegram.findFirst({
    where: eq(clientesTelegram.orden_id_origen, ordenId),
  });

  if (!cliente) return false;

  return callTelegramApi("sendMessage", {
    chat_id: cliente.chat_id_telegram,
    text: "Tu pedido ha sido cancelado. Si tienes dudas, consulta con el mesero.",
  });
}

