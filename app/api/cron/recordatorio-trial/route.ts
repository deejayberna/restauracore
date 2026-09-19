import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  restaurantes,
  recordatoriosTrialEnviados,
  logAuditoria,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { enviarNotificacionRecordatorioTrial } from "@/lib/notificaciones";
import { obtenerDestinatariosRestaurante } from "@/lib/notificaciones-destinatarios";

export async function GET(request: NextRequest) {
  // 1. SEGURIDAD: Validación estricta del header de autorización de Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forzarEnvio = searchParams.get("force") === "true";

  const ahora = new Date();

  // 2. Obtener todos los restaurantes actualmente en periodo 'trial'
  const restaurantesEnTrial = await db.query.restaurantes.findMany({
    where: eq(restaurantes.estado_suscripcion, "trial"),
  });

  const resultados: {
    restaurante_id: string;
    nombre: string;
    diasRestantes?: number;
    procesado: boolean;
    omitido_por_horario?: boolean;
    omitido_por_duplicado?: boolean;
    error?: string;
  }[] = [];

  for (const rest of restaurantesEnTrial) {
    if (!rest.fecha_fin_trial) continue;

    const tz = rest.timezone ?? "America/Mexico_City";
    const fechaFin = new Date(rest.fecha_fin_trial);
    const diffMs = fechaFin.getTime() - ahora.getTime();
    const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Solo se notifica a 2 días o 1 día de distancia (o forzado para pruebas)
    if ((diasRestantes !== 2 && diasRestantes !== 1) && !forzarEnvio) {
      continue;
    }

    // Si ya expiró (<= 0), el Paywall se encarga; no enviar recordatorio
    if (diasRestantes <= 0) {
      continue;
    }

    // Formato YYYY-MM-DD local
    const fechaLocal = ahora.toLocaleDateString("en-CA", { timeZone: tz });

    // 3. IDEMPOTENCIA ATÓMICA: Registrar en recordatorios_trial_enviados antes de notificar
    // UNIQUE(restaurante_id, dias_restantes) previene envíos repetidos en base de datos
    try {
      await db.insert(recordatoriosTrialEnviados).values({
        restaurante_id: rest.id,
        dias_restantes: diasRestantes,
        fecha: fechaLocal,
        enviado_en: new Date(),
      });
    } catch (dbErr: any) {
      // Código PostgreSQL 23505 = unique_violation
      if (dbErr?.code === "23505" || dbErr?.cause?.code === "23505") {
        resultados.push({
          restaurante_id: rest.id,
          nombre: rest.nombre,
          diasRestantes,
          procesado: false,
          omitido_por_duplicado: true,
        });
        continue;
      }

      console.error(`[Cron Recordatorio Trial] Error de idempotencia para ${rest.nombre}:`, dbErr);
      resultados.push({
        restaurante_id: rest.id,
        nombre: rest.nombre,
        diasRestantes,
        procesado: false,
        error: "Error de base de datos al validar duplicidad",
      });
      continue;
    }

    // 4. Obtener destinatarios configurados (Telegram + Emails de dueños / email_alertas)
    const destinatarios = await obtenerDestinatariosRestaurante(rest.id);

    // 5. Envío multicanal con mecanismo anti-silencio
    try {
      await enviarNotificacionRecordatorioTrial({
        restaurante: rest.nombre,
        diasRestantes,
        destinatario_email: destinatarios.emails,
        chat_id: destinatarios.chat_id,
      });

      resultados.push({
        restaurante_id: rest.id,
        nombre: rest.nombre,
        diasRestantes,
        procesado: true,
      });
    } catch (envioErr: any) {
      console.error(`[Cron Recordatorio Trial] Fallo al enviar aviso para ${rest.nombre}:`, envioErr);

      // ANTI-SILENCIO: Asentar en log_auditoria
      let auditUserId: string | undefined;
      const vinculado = await db.query.usuarioRestaurantes.findFirst({
        where: eq(usuarioRestaurantes.restaurante_id, rest.id),
      });
      if (vinculado) {
        auditUserId = vinculado.usuario_id;
      } else {
        const primerUsuario = await db.query.usuarios.findFirst();
        if (primerUsuario) auditUserId = primerUsuario.id;
      }

      if (auditUserId) {
        await db
          .insert(logAuditoria)
          .values({
            restaurante_id: rest.id,
            usuario_id: auditUserId,
            accion: "FALLO_ENVIO_RECORDATORIO_TRIAL",
            valores_nuevos: {
              dias_restantes: diasRestantes,
              error: envioErr?.message || String(envioErr),
              fecha: fechaLocal,
            },
          })
          .catch((auditErr) => {
            console.error("[Cron Recordatorio Trial] Error crítico grabando auditoría anti-silencio:", auditErr);
          });
      }

      resultados.push({
        restaurante_id: rest.id,
        nombre: rest.nombre,
        diasRestantes,
        procesado: false,
        error: envioErr?.message || "Fallo en el canal de envío",
      });
    }
  }

  return NextResponse.json(
    {
      ejecutado_en: ahora.toISOString(),
      total_procesados: resultados.length,
      resultados,
    },
    { status: 200 }
  );
}

