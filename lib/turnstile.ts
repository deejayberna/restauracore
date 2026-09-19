export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
}

/**
 * Valida un token de Cloudflare Turnstile contra la API oficial.
 *
 * REGLA DE SEGURIDAD ESTRICTA:
 * - En producción (NODE_ENV === 'production'): TURNSTILE_SECRET_KEY es obligatoria.
 *   Si falta, el registro falla ruidosamente y queda registrado en logs.
 * - En desarrollo y pruebas (NODE_ENV !== 'production' o VITEST): se permite omitir si no está
 *   configurada la variable, para no bloquear pruebas automatizadas ni entornos locales sin internet.
 */
export async function validarTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.VITEST !== undefined || Boolean(process.env.SKIP_CAPTCHA_IN_TESTS);

  // 1. En entornos de prueba / dev sin secret configurado:
  if (!secretKey) {
    if (isProduction && !isTest) {
      console.error(
        "[Turnstile] ERROR CRÍTICO DE SEGURIDAD: TURNSTILE_SECRET_KEY no está configurada en entorno de producción. Bloqueando registro para evitar abusos."
      );
      return {
        success: false,
        error: "El servicio de verificación de seguridad no está disponible temporalmente.",
      };
    }

    console.warn(
      "[Turnstile] TURNSTILE_SECRET_KEY no configurada. Omitiendo validación por entorno no productivo / pruebas."
    );
    return { success: true };
  }

  // 2. Token no proporcionado
  if (!token) {
    if (isTest) {
      return { success: true };
    }
    return {
      success: false,
      error: "Por favor completa la verificación de seguridad (Captcha).",
    };
  }

  // 3. Validar con Cloudflare
  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) {
      console.error(`[Turnstile] Error de red con Cloudflare: status ${res.status}`);
      return {
        success: false,
        error: "Error al validar la verificación de seguridad con Cloudflare.",
      };
    }

    const data = await res.json();

    if (!data.success) {
      console.warn("[Turnstile] Verificación fallida de Cloudflare:", data["error-codes"]);
      return {
        success: false,
        error: "La verificación de seguridad ha fallado. Por favor intenta de nuevo.",
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Turnstile] Excepción al contactar con Cloudflare:", err);
    return {
      success: false,
      error: "Error de conexión al validar la verificación de seguridad.",
    };
  }
}

