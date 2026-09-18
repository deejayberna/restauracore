import { db } from "@/db";
import { restaurantes, usuarioRestaurantes, usuarios, logAuditoria } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface DestinatariosRestaurante {
  chat_id?: string;
  emails: string[];
  restaurante_nombre: string;
}

/**
 * Notifica al canal administrativo global (fallback del sistema) cuando un restaurante
 * no tiene configurado ningún medio de recepción para sus alertas operativas.
 */
export async function notificarAdminFallbackRestauranteSinDestinatarios(
  restauranteId: string,
  restauranteNombre: string
): Promise<void> {
  const adminChatId = process.env.TELEGRAM_CHAT_ID_GERENTE;
  const adminEmail = process.env.GERENTE_EMAIL;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  const textoTelegram =
    `🚨 *ALERTA DE SEGURIDAD DEL SISTEMA / INFRAESTRUCTURA*\n\n` +
    `El restaurante *"${restauranteNombre}"* (ID: \`${restauranteId}\`) generó un evento que requiere notificación, ` +
    `pero *NO TIENE DESTINATARIOS CONFIGURADOS* (sin telegram_chat_id, sin email_alertas y sin usuarios con rol 'dueno' activos).\n\n` +
    `⚠️ Sus alertas operativas no se están entregando a nadie. Por favor contacta al titular del negocio.`;

  // 1. Notificar por Telegram al admin
  if (telegramBotToken && adminChatId) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: textoTelegram,
          parse_mode: "Markdown",
        }),
      });
    } catch (e) {
      console.error("[AdminFallback] Error enviando Telegram a admin:", e);
    }
  }

  // 2. Notificar por Email al admin
  if (resendApiKey && resendFromEmail && adminEmail) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: adminEmail,
          subject: `🚨 [Seguridad Sistema] Restaurante sin destinatarios de alertas: ${restauranteNombre}`,
          html: `
            <h2>🚨 Alerta de Infraestructura: Restaurante sin Destinatarios de Alertas</h2>
            <p>El restaurante <strong>${restauranteNombre}</strong> (ID: <code>${restauranteId}</code>) generó un evento que requiere notificación operativa, pero <strong>no tiene ningún destinatario configurado</strong> (sin telegram_chat_id, sin email_alertas y sin dueños activos con email).</p>
            <p style="color: #dc2626;"><strong>Acción requerida:</strong> Contactar al titular del restaurante para configurar sus canales de notificación.</p>
          `,
        }),
      });
    } catch (e) {
      console.error("[AdminFallback] Error enviando Email a admin:", e);
    }
  }
}

/**
 * Resuelve los destinatarios legítimos de un restaurante específico:
 * - chat_id: telegram_chat_id configurado en restaurantes
 * - emails: Array con email_alertas (si existe) + emails de TODOS los usuarios activos con rol 'dueno'
 * Si no hay destinatarios:
 * - Asienta 'RESTAURANTE_SIN_DESTINATARIO_ALERTAS' en log_auditoria
 * - Dispara aviso al canal administrativo global (fallback)
 */
export async function obtenerDestinatariosRestaurante(
  restauranteId: string,
  usuarioId?: string
): Promise<DestinatariosRestaurante> {
  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restauranteId),
  });

  const restauranteNombre = rest?.nombre ?? "Restaurante Desconocido";

  // 1. Obtener telegram_chat_id si está configurado
  const chatId = rest?.telegram_chat_id?.trim() ? rest.telegram_chat_id.trim() : undefined;

  // 2. Obtener lista deduplicada de emails
  const emailsSet = new Set<string>();

  if (rest?.email_alertas?.trim()) {
    emailsSet.add(rest.email_alertas.trim().toLowerCase());
  }

  // Consultar a TODOS los dueños activos vinculados
  const duenos = await db
    .select({ email: usuarios.email })
    .from(usuarioRestaurantes)
    .innerJoin(usuarios, eq(usuarios.id, usuarioRestaurantes.usuario_id))
    .where(
      and(
        eq(usuarioRestaurantes.restaurante_id, restauranteId),
        eq(usuarioRestaurantes.rol, "dueno"),
        eq(usuarioRestaurantes.activo, true)
      )
    );

  for (const d of duenos) {
    if (d.email?.trim()) {
      emailsSet.add(d.email.trim().toLowerCase());
    }
  }

  const emails = Array.from(emailsSet);

  // 3. Si NINGÚN destinatario está configurado
  if (!chatId && emails.length === 0) {
    try {
      let auditUserId = usuarioId;
      if (!auditUserId) {
        const vinculado = await db.query.usuarioRestaurantes.findFirst({
          where: eq(usuarioRestaurantes.restaurante_id, restauranteId),
        });
        if (vinculado) {
          auditUserId = vinculado.usuario_id;
        } else {
          const primerUsuario = await db.query.usuarios.findFirst();
          if (primerUsuario) auditUserId = primerUsuario.id;
        }
      }

      if (auditUserId) {
        await db.insert(logAuditoria).values({
          restaurante_id: restauranteId,
          usuario_id: auditUserId,
          accion: "RESTAURANTE_SIN_DESTINATARIO_ALERTAS",
          tabla_afectada: "restaurantes",
          registro_id: restauranteId,
          valores_nuevos: {
            alerta: "Sin destinatarios configurados",
            restaurante_nombre: restauranteNombre,
          },
        });
      }
    } catch (auditErr) {
      console.error("[obtenerDestinatariosRestaurante] Error registrando en log_auditoria:", auditErr);
    }

    await notificarAdminFallbackRestauranteSinDestinatarios(restauranteId, restauranteNombre);
  }

  return {
    chat_id: chatId,
    emails,
    restaurante_nombre: restauranteNombre,
  };
}
