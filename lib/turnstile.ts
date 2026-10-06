export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
}

function esClaveDummy(key: string | undefined | null): boolean {
  if (!key) return false;
  const trimmed = key.trim().toLowerCase();
  return (
    trimmed.startsWith("1x") ||
    trimmed.startsWith("2x") ||
    trimmed.startsWith("3x")
  );
}

/**
 * Valida un token de Cloudflare Turnstile contra la API oficial.
 *
 * REGLA DE SEGURIDAD ESTRICTA:
 * - En producción (NODE_ENV === 'production'): TURNSTILE_SECRET_KEY y NEXT_PUBLIC_TURNSTILE_SITE_KEY
 *   son obligatorias y no pueden ser claves de prueba (dummy) de Cloudflare (prefijos 1x, 2x, 3x).
 *   Si falta o es una clave dummy, el registro falla ruidosamente en logs y se rechaza la verificación.
 * - En desarrollo y pruebas (NODE_ENV !== 'production' o VITEST / SKIP_CAPTCHA_IN_TESTS): se permite omitir si no está
 *   configurada la variable o usar claves de prueba, para no bloquear pruebas automatizadas ni entornos locales sin internet.
 */
export async function validarTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const isProduction = process.env.NODE_ENV === "production";
  const isVercelProd = process.env.VERCEL_ENV === "production";

  // En producción real de Vercel (VERCEL_ENV === "production"), SKIP_CAPTCHA_IN_TESTS
  // debe ignorarse completamente y registrar un error en logs sin imprimir valores.
  let skipCaptcha = Boolean(process.env.SKIP_CAPTCHA_IN_TESTS);
  if (isVercelProd && skipCaptcha) {
    console.error(
      "[Turnstile] ERROR DE SEGURIDAD: SKIP_CAPTCHA_IN_TESTS está activo pero se ignora en producción real de Vercel (VERCEL_ENV === 'production'). Forzando verificación."
    );
    skipCaptcha = false;
  }

  // En producción real de Vercel nunca se omite la verificación por entorno de prueba
  const isTest = !isVercelProd && (process.env.VITEST !== undefined || skipCaptcha);

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

  // 1b. Guard contra claves dummy/de prueba de Cloudflare en producción:
  if (esClaveDummy(secretKey) || esClaveDummy(siteKey)) {
    if (isProduction && !isTest) {
      console.error(
        "[Turnstile] ERROR CRÍTICO DE SEGURIDAD: Se detectaron claves dummy/de prueba de Cloudflare en entorno de producción. Bloqueando registro para evitar abusos."
      );
      return {
        success: false,
        error: "El servicio de verificación de seguridad no está disponible temporalmente.",
      };
    }
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

