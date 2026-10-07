import { db } from "@/db";
import { logSistema } from "@/db/schema";
import type { AuthError } from "@supabase/supabase-js";

export type OrigenEventoSistema =
  | "alta_registro"
  | "recuperacion_contrasena"
  | "invitacion_personal";

export interface EventoSistemaInput {
  tipo: string; // ej. "FALLO_ENVIO_CORREO_AUTH"
  origen: OrigenEventoSistema;
  servicio?: string; // default "supabase_auth_smtp"
  email?: string | null;
  error?: AuthError | Error | any;
  ip?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Extrae estrictamente la porción del dominio de un correo electrónico.
 * Retorna null si el correo no tiene formato válido o falta el dominio.
 * Garantiza que NUNCA se preserve la parte local (nombre de usuario) ni el correo completo.
 */
export function extraerDominioEmail(email?: string | null): string | null {
  if (!email || typeof email !== "string") return null;
  const partes = email.trim().toLowerCase().split("@");
  if (partes.length !== 2 || !partes[1]) return null;
  return partes[1].slice(0, 100);
}

/**
 * Criterio de clasificación de errores de Supabase Auth para registro de fallos de servicio.
 *
 * REGLAS DE CLASIFICACIÓN (Usa error.status y error.code de AuthError):
 * - NO registra límites de frecuencia: status === 429, code === "over_email_send_rate_limit", code === "over_request_rate_limit".
 * - NO registra correos inexistentes ni validaciones de usuario: code === "user_not_found", "email_not_found", "validation_failed", etc.
 * - SÍ registra fallos de servicio/transporte de correo:
 *     * status >= 500 y status < 600 (errores internos de backend o servidor SMTP)
 *     * code === "email_provider_disabled" o "unexpected_failure"
 */
export function esFalloServicioCorreo(error: any): boolean {
  if (!error) return false;

  const status = typeof error.status === "number" ? error.status : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;

  // 1. Excluir rate limits (429 y códigos de frecuencia)
  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return false;
  }

  // 2. Excluir errores de entidad/cliente y correos no encontrados
  if (
    code === "user_not_found" ||
    code === "email_not_found" ||
    code === "validation_failed" ||
    code === "invalid_credentials" ||
    code === "bad_jwt" ||
    (status !== undefined && status >= 400 && status < 500)
  ) {
    return false;
  }

  // 3. Status 5xx: fallos reales del servidor o servicio de envío
  if (status !== undefined && status >= 500 && status < 600) {
    return true;
  }

  // 4. Códigos específicos de fallo de proveedor o servicio de correo
  if (
    code === "email_provider_disabled" ||
    code === "unexpected_failure"
  ) {
    return true;
  }

  return false;
}

/**
 * Asienta de forma segura y resiliente un evento de infraestructura o fallo de autenticación en log_sistema.
 *
 * Características de seguridad y resiliencia:
 * - Nunca lanza excepción ni interrumpe el flujo principal.
 * - Espera con await dentro de try/catch (no fire-and-forget para no ser cancelado en Vercel Serverless).
 * - Protegido por un timeout estricto de 2000 ms.
 * - Si falla el INSERT, emite console.error con tag LOG_SISTEMA_ERROR sin datos sensibles.
 */
export async function registrarEventoSistema(input: EventoSistemaInput): Promise<void> {
  try {
    const error = input.error;
    if (!esFalloServicioCorreo(error)) {
      return;
    }

    const emailDominio = extraerDominioEmail(input.email);
    const estadoHttp = typeof error?.status === "number" ? error.status : null;
    const codigoError = typeof error?.code === "string" ? error.code.slice(0, 100) : null;
    const mensajeCrudo = error?.message ? String(error.message) : (error ? String(error) : null);
    const mensajeError = mensajeCrudo ? mensajeCrudo.slice(0, 200) : null;

    // Timeout de 2 segundos para no demorar la respuesta de la Server Action
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout al registrar evento en log_sistema")), 2000)
    );

    const insertPromise = db.insert(logSistema).values({
      tipo: input.tipo,
      origen: input.origen,
      servicio: input.servicio || "supabase_auth_smtp",
      email_dominio: emailDominio,
      estado_http: estadoHttp,
      codigo_error: codigoError,
      mensaje_error: mensajeError,
      ip_origen: input.ip ? input.ip.slice(0, 45) : null,
      metadata: input.metadata || null,
    });

    await Promise.race([insertPromise, timeoutPromise]);
  } catch (err: any) {
    console.error("[LOG_SISTEMA_ERROR]", {
      tag: "LOG_SISTEMA_ERROR",
      tipo: input.tipo,
      origen: input.origen,
      name: err?.name || "Error",
      message: err?.message || String(err),
    });
  }
}

