"use server";

import { headers } from "next/headers";
import { checkRateLimitRecuperacion } from "@/lib/rate-limiter";
import { validarTurnstileToken } from "@/lib/turnstile";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { registrarEventoSistema } from "@/lib/log-sistema";

const MENSAJE_GENERICO_RECUPERACION =
  "Si ese correo tiene una cuenta, te enviaremos un enlace para restablecer tu contraseña";

export interface SolicitarRecuperacionInput {
  email: string;
  turnstileToken?: string;
}

export interface SolicitarRecuperacionResult {
  ok?: boolean;
  mensaje?: string;
  error?: string;
}

export interface ActualizarPasswordResult {
  ok: boolean;
  mensaje?: string;
  error?: string;
}

function sanitizarEmailParaLog(email?: string): string {
  if (!email) return "sin-email";
  const partes = email.trim().toLowerCase().split("@");
  if (partes.length !== 2) return "***";
  const user = partes[0];
  const dom = partes[1];
  const ofuscado =
    user.length > 2 ? `${user.substring(0, 2)}***` : `${user[0] || ""}***`;
  return `${ofuscado}@${dom}`;
}

/**
 * Solicita el restablecimiento de contraseña para un correo electrónico.
 * Aplica Rate Limiting (5/hora por IP) y validación de Turnstile.
 * Para prevenir enumeración de usuarios, SIEMPRE devuelve el mismo mensaje genérico
 * exista o no la cuenta, e incluso ante excepciones internas.
 */
export async function solicitarRecuperacionAction(
  input: SolicitarRecuperacionInput
): Promise<SolicitarRecuperacionResult> {
  const cleanEmail = (input?.email || "").trim().toLowerCase();

  // 1. Obtener IP del cliente para rate limiting
  let ip = "127.0.0.1";
  try {
    const h = await headers();
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "127.0.0.1";
  } catch {
    // Contexto sin headers de request (ej. tests unitarios)
  }

  // 2. Rate limiting por IP: máximo 5 solicitudes por hora
  const rateCheck = await checkRateLimitRecuperacion(ip);
  if (!rateCheck.success) {
    return {
      error:
        "Demasiadas solicitudes de recuperación de contraseña. Por favor intenta más tarde.",
    };
  }

  // 3. Validación de Captcha Turnstile
  const turnstileCheck = await validarTurnstileToken(input?.turnstileToken, ip);
  if (!turnstileCheck.success) {
    return {
      error:
        turnstileCheck.error ||
        "Verificación de seguridad fallida. Por favor completa el captcha.",
    };
  }

  // 4. Validación básica de formato de correo
  if (!cleanEmail || !cleanEmail.includes("@") || cleanEmail.length < 5) {
    return {
      error: "Por favor ingresa un correo electrónico válido.",
    };
  }

  // 5. Envío del correo de recuperación vía Supabase Auth
  try {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://restautom.vercel.app";
    const redirectTo = `${appUrl.replace(/\/$/, "")}/restablecer-contrasena`;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });

    if (error) {
      await registrarEventoSistema({
        tipo: "FALLO_ENVIO_CORREO_AUTH",
        origen: "recuperacion_contrasena",
        email: cleanEmail,
        ip,
        error,
      });

      console.error("[RECUPERACION_CONTRASENA_ERROR]", {
        tag: "RECUPERACION_ERROR",
        paso: "RESET_PASSWORD_FOR_EMAIL",
        errorName: error.name || "AuthApiError",
        errorMessage: error.message,
        email: sanitizarEmailParaLog(cleanEmail),
      });
    }
  } catch (err: any) {
    await registrarEventoSistema({
      tipo: "FALLO_ENVIO_CORREO_AUTH",
      origen: "recuperacion_contrasena",
      email: cleanEmail,
      ip,
      error: err,
    });

    console.error("[RECUPERACION_CONTRASENA_ERROR]", {
      tag: "RECUPERACION_ERROR",
      paso: "RESET_PASSWORD_FOR_EMAIL_EXCEPTION",
      errorName: err?.name || "Error",
      errorMessage: err?.message || String(err),
      email: sanitizarEmailParaLog(cleanEmail),
    });
  }

  // SIEMPRE devolver el mismo mensaje genérico sin revelar si la cuenta existe o si hubo fallos
  return {
    ok: true,
    mensaje: MENSAJE_GENERICO_RECUPERACION,
  };
}

/**
 * Actualiza la contraseña durante el flujo de recuperación.
 * Exige mínimo 8 caracteres y cierra la sesión de recuperación al finalizar.
 */
export async function actualizarPasswordRecuperacionAction(
  nuevaPassword: string
): Promise<ActualizarPasswordResult> {
  if (!nuevaPassword || nuevaPassword.length < 8) {
    return {
      ok: false,
      error: "La contraseña debe tener al menos 8 caracteres.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      password: nuevaPassword,
    });

    if (error) {
      return {
        ok: false,
        error:
          error.message ||
          "No fue posible restablecer la contraseña. El enlace puede haber expirado.",
      };
    }

    // Cerrar la sesión de recuperación para que el usuario inicie sesión limpiamente
    await supabase.auth.signOut();

    return {
      ok: true,
      mensaje: "Contraseña actualizada exitosamente.",
    };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.message ||
        "Ocurrió un error inesperado al actualizar la contraseña.",
    };
  }
}

