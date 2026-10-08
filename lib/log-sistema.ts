import { db } from "@/db";
import { logSistema } from "@/db/schema";
import { AuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

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
 * Sanitiza cualquier texto antes de ser persistido en base de datos.
 * Elimina:
 * 1. URLs completas (incluyendo query parameters con tokens/hashes).
 * 2. Direcciones de correo electrónico.
 * 3. Tokens JWT (formato ey...).
 * 4. Secuencias largas alfanuméricas continuas (>= 20 caracteres) tipo hash/token.
 */
export function sanitizarTextoSeguro(texto?: string | null): string | null {
  if (!texto || typeof texto !== "string") return null;
  return texto
    // 1. Eliminar URLs (http://, https://, ftp://)
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL_ELIMINADA]")
    .replace(/ftp:\/\/[^\s"'<>]+/gi, "[URL_ELIMINADA]")
    // 2. Eliminar direcciones de correo electrónico
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, "[CORREO_ELIMINADO]")
    // 3. Eliminar tokens JWT (eyJ...)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[TOKEN_ELIMINADO]")
    // 4. Eliminar secuencias alfanuméricas largas (hashes MD5/SHA, tokens >= 20 caracteres)
    .replace(/\b[a-zA-Z0-9_]{20,}\b/g, "[TOKEN_ELIMINADO]")
    .trim();
}

/**
 * Sanitiza recursivamente cualquier estructura de datos en metadata para eliminar
 * correos, URLs y tokens en todas las propiedades de texto.
 */
export function sanitizarMetadata(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    return sanitizarTextoSeguro(data);
  }
  if (Array.isArray(data)) {
    return data.map(sanitizarMetadata);
  }
  if (typeof data === "object") {
    const sanitizado: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      sanitizado[key] = sanitizarMetadata(value);
    }
    return sanitizado;
  }
  return data;
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
 * TABLA DE CRITERIOS:
 * - IGNORAR (false):
 *     * Límites de frecuencia: status === 429, code === "over_email_send_rate_limit" o "over_request_rate_limit"
 *     * Errores de cliente HTTP 4xx (400-499)
 *     * Errores de entidad/validación de usuario: code === "user_not_found", "email_not_found",
 *       "validation_failed", "invalid_credentials", "bad_jwt", "signup_disabled", etc.
 * - CONTAR COMO FALLO DE SERVICIO (true):
 *     * Status HTTP 5xx (500-599): fallos del servidor Supabase o backend downstream SMTP
 *     * Códigos de servicio: code === "email_provider_disabled" o "unexpected_failure"
 *     * Errores de red o timeout hacia Supabase:
 *         - Instancia de AuthRetryableFetchError o error.name === "AuthRetryableFetchError"
 *         - status === 0 (fallo de fetch/red sin código HTTP)
 *         - status === undefined / null (sin status, tras descartar códigos de cliente y rate limits)
 */
export function esFalloServicioCorreo(error: any): boolean {
  if (!error) return false;

  const status = typeof error.status === "number" ? error.status : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;
  const name = typeof error.name === "string" ? error.name : "";

  // 1. Excluir rate limits (429 y códigos de frecuencia)
  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return false;
  }

  // 2. Excluir errores de entidad/cliente y validaciones conocidas
  const codigosClienteIgnorados = [
    "user_not_found",
    "email_not_found",
    "validation_failed",
    "invalid_credentials",
    "bad_jwt",
    "signup_disabled",
    "user_already_exists",
    "weak_password",
    "same_password",
  ];
  if (code && codigosClienteIgnorados.includes(code)) {
    return false;
  }

  // 3. Excluir errores HTTP 4xx (errores imputables al cliente)
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }

  // 4. Fallos reales del servidor HTTP 5xx (backend o SMTP downstream)
  if (status !== undefined && status >= 500 && status < 600) {
    return true;
  }

  // 5. Códigos específicos de fallo de servicio de Supabase Auth
  if (
    code === "email_provider_disabled" ||
    code === "unexpected_failure"
  ) {
    return true;
  }

  // 6. Errores de red, timeout o fetch hacia Supabase (AuthRetryableFetchError, status 0 o sin status)
  if (
    name === "AuthRetryableFetchError" ||
    (error instanceof AuthRetryableFetchError) ||
    status === 0 ||
    status === undefined
  ) {
    return true;
  }

  return false;
}

/**
 * Asienta de forma segura y resiliente un evento de infraestructura o fallo de autenticación en log_sistema.
 *
 * Características de seguridad y resiliencia:
 * - Sanitiza mensaje_error y metadata (eliminando correos, URLs y tokens/hashes).
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
    const mensajeSanitizado = mensajeCrudo ? sanitizarTextoSeguro(mensajeCrudo) : null;
    const mensajeError = mensajeSanitizado ? mensajeSanitizado.slice(0, 200) : null;
    const metadataSanitizada = input.metadata ? sanitizarMetadata(input.metadata) : null;

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
      metadata: metadataSanitizada,
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
