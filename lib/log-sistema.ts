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
 * 1. URLs completas (incluyendo query parameters).
 * 2. Direcciones de correo electrónico.
 * 3. Tokens JWT (formato ey...).
 * 4. Tokens con prefijos conocidos (sk_, pk_, tok_, sec_, key_).
 * 5. Hashes hexadecimales (MD5, SHA1, SHA256 de 20+ caracteres).
 * 6. Secuencias alfanuméricas continuas que combinan letras Y números (>= 20 caracteres).
 *
 * PRESERVA:
 * - Códigos legibles en snake_case (ej. email_provider_disabled, unexpected_failure).
 * - Textos de error de servidores SMTP (ej. 535 Username and Password not accepted).
 * - Identificadores UUID estándar con guiones (ej. IDs de restaurante).
 */
export function sanitizarTextoSeguro(texto?: string | null): string | null {
  if (!texto || typeof texto !== "string") return null;
  return texto
    // 1. Eliminar URLs (http://, https://, ftp://) con sus parámetros
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL_ELIMINADA]")
    .replace(/ftp:\/\/[^\s"'<>]+/gi, "[URL_ELIMINADA]")
    // 2. Eliminar direcciones de correo electrónico
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, "[CORREO_ELIMINADO]")
    // 3. Eliminar tokens JWT (eyJ...)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[TOKEN_ELIMINADO]")
    // 4. Tokens con prefijos conocidos (sk_, pk_, tok_, sec_, etc.)
    .replace(/\b(?:sk_|pk_|tok_|sec_|key_)[a-zA-Z0-9_-]{16,}\b/gi, "[TOKEN_ELIMINADO]")
    // 5. Hashes hexadecimales continuos (MD5, SHA1, SHA256 de 20+ caracteres)
    .replace(/\b[a-fA-F0-9]{20,}\b/g, "[TOKEN_ELIMINADO]")
    // 6. Secuencias alfanuméricas continuas que combinan letras Y dígitos (>= 20 caracteres)
    // Se excluyen identificadores legibles en snake_case (que solo tienen letras y guiones bajos)
    .replace(/\b(?=[a-zA-Z0-9_]*[0-9])(?=[a-zA-Z0-9_]*[a-zA-Z])[a-zA-Z0-9_]{20,}\b/g, "[TOKEN_ELIMINADO]")
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
 * Determina si el error corresponde a errores descartables de cliente o límites de frecuencia.
 * Estos NUNCA generan ningún registro en log_sistema.
 */
export function esErrorClienteODescartable(error: any): boolean {
  if (!error) return true;
  const status = typeof error.status === "number" ? error.status : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;

  // 1. Límites de frecuencia (429 y códigos de rate limit)
  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return true;
  }

  // 2. Errores de validación de entidad / credenciales / usuario
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
    return true;
  }

  // 3. Códigos de respuesta HTTP 4xx (errores del cliente)
  if (status !== undefined && status >= 400 && status < 500) {
    return true;
  }

  return false;
}

/**
 * Detecta si un error corresponde a un error de red o timeout conocido hacia Supabase.
 */
export function esErrorRedConocido(error: any): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError" || (error instanceof AuthRetryableFetchError)) {
    return true;
  }
  if (error.status === 0) {
    return true;
  }
  const mensaje = String(error.message || error || "").toLowerCase();
  const codigo = String(error.code || "").toLowerCase();

  return (
    mensaje.includes("fetch failed") ||
    mensaje.includes("timeout") ||
    mensaje.includes("etimedout") ||
    mensaje.includes("econnreset") ||
    mensaje.includes("enotfound") ||
    mensaje.includes("econnrefused") ||
    codigo === "etimedout" ||
    codigo === "econnreset" ||
    codigo === "enotfound" ||
    codigo === "econnrefused"
  );
}

/**
 * Criterio de clasificación de errores para contabilizar fallos reales del servicio de correo.
 *
 * RETORNA TRUE (Cuenta para el semáforo):
 * - HTTP 5xx (servidor / SMTP downstream)
 * - Códigos de servicio: "email_provider_disabled" o "unexpected_failure"
 * - Errores de red conocidos: AuthRetryableFetchError, status 0, "fetch failed", timeouts, ECONNRESET, ENOTFOUND
 *
 * RETORNA FALSE:
 * - Límites de frecuencia (429, rate limits)
 * - Errores de cliente (4xx, validación de usuario)
 * - Excepciones internas del código que no son de red (éstas se registran como EXCEPCION_INTERNA sin contar para el semáforo)
 */
export function esFalloServicioCorreo(error: any): boolean {
  if (!error) return false;
  if (esErrorClienteODescartable(error)) return false;

  const status = typeof error.status === "number" ? error.status : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;

  // 1. Status 5xx (fallo en backend o transporte SMTP downstream)
  if (status !== undefined && status >= 500 && status < 600) {
    return true;
  }

  // 2. Códigos específicos de servicio de autenticación
  if (code === "email_provider_disabled" || code === "unexpected_failure") {
    return true;
  }

  // 3. Errores de red o timeout conocidos hacia Supabase
  if (esErrorRedConocido(error)) {
    return true;
  }

  return false;
}

/**
 * Evalúa si un registro persistido en log_sistema cuenta para el semáforo de salud de correo (últimas 24h).
 * Descarta registros marcados con 'EXCEPCION_INTERNA'.
 */
export function cuentaParaSemaforo(registro: { codigo_error?: string | null }): boolean {
  return registro.codigo_error !== "EXCEPCION_INTERNA";
}

/**
 * Asienta de forma segura y resiliente un evento de infraestructura o fallo de autenticación en log_sistema.
 *
 * Reglas de persistencia:
 * - Errores de cliente / 429 / validaciones: NUNCA se guardan.
 * - Fallos reales de servicio (5xx, red conocida): se guardan con su código o código de red (CUENTAN para el semáforo).
 * - Cualquier otra excepción interna: se guarda con codigo_error 'EXCEPCION_INTERNA' (NO cuenta para el semáforo).
 * - Sanitiza mensaje_error y metadata (eliminando correos, URLs y tokens/hashes).
 * - Protegido por timeout estricto de 2000 ms.
 */
export async function registrarEventoSistema(input: EventoSistemaInput): Promise<void> {
  try {
    const error = input.error;

    // Descartar errores de cliente, 429 y validación
    if (esErrorClienteODescartable(error)) {
      return;
    }

    const esFalloServicio = esFalloServicioCorreo(error);
    const esExcepcionInterna = !esFalloServicio;

    const emailDominio = extraerDominioEmail(input.email);
    const estadoHttp = typeof error?.status === "number" ? error.status : null;

    let codigoError = typeof error?.code === "string" ? error.code.slice(0, 100) : null;
    if (esExcepcionInterna) {
      codigoError = "EXCEPCION_INTERNA";
    }

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
