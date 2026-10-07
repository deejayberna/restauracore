"use server";

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes, restaurantes, logAuditoria } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { validateOrThrow, z } from "@/lib/validation";
import { cookies, headers } from "next/headers";
import { checkRateLimitLogin, checkRateLimitCambioPassword } from "@/lib/rate-limiter";
import { isSuperAdminEmail } from "@/lib/superadmin-utils";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export async function loginAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error?: string; redirectUrl?: string }> {
  let data;
  try {
    data = validateOrThrow(loginSchema, {
      email: formData.get("email"),
      password: formData.get("password"),
    });
  } catch (err: any) {
    return { error: err?.message || "Datos de acceso inválidos." };
  }

  // Rate limiting contra fuerza bruta por IP
  let ip = "127.0.0.1";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  } catch {
    // Fallback para tests
  }

  const rateCheck = await checkRateLimitLogin(ip);
  if (!rateCheck.success) {
    return { error: "Demasiados intentos de acceso. Por favor intenta más tarde." };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const { error } = await supabase.auth.signInWithPassword(data);

    if (error) {
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        return { error: "Correo o contraseña incorrectos. Verifica tus datos e intenta nuevamente." };
      }
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return { error: "El correo aún no ha sido confirmado. Revisa tu bandeja de entrada." };
      }
      return { error: error.message };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "No se pudo obtener el usuario" };

    // ── Super-Admin: bypass completo ──
    // Verificamos ambas fuentes de email (Supabase y formulario) para
    // robustez. Un super admin no necesita registro en `usuarios` ni
    // vínculos en `usuario_restaurantes`.
    if (isSuperAdminEmail(user.email) || isSuperAdminEmail(data.email)) {
      return { redirectUrl: "/superadmin" };
    }


    // Buscar vínculos activos del usuario en usuario_restaurantes
    let usuario = await db.query.usuarios.findFirst({
      where: eq(usuarios.auth_id, user.id),
    });

    if (!usuario && user.email) {
      try {
        const [nuevo] = await db
          .insert(usuarios)
          .values({
            auth_id: user.id,
            email: user.email,
            nombre: user.user_metadata?.nombre || user.email.split("@")[0],
            activo: true,
          })
          .onConflictDoUpdate({
            target: usuarios.auth_id,
            set: { email: user.email, activo: true },
          })
          .returning();
        usuario = nuevo;
      } catch {
        usuario = await db.query.usuarios.findFirst({
          where: eq(usuarios.auth_id, user.id),
        });
      }
    }

    if (!usuario) return { error: "Usuario no registrado en el sistema" };

    const vinculos = await db
      .select({
        restaurante_id: usuarioRestaurantes.restaurante_id,
        rol: usuarioRestaurantes.rol,
        nombre: restaurantes.nombre,
      })
      .from(usuarioRestaurantes)
      .innerJoin(restaurantes, eq(restaurantes.id, usuarioRestaurantes.restaurante_id))
      .where(
        and(
          eq(usuarioRestaurantes.usuario_id, usuario.id),
          eq(usuarioRestaurantes.activo, true)
        )
      );

    if (vinculos.length === 0) {
      return { error: "Tu usuario no tiene restaurantes asignados aún. Contacta a soporte o al administrador." };
    }

    const cookieStore = await cookies();

    if (vinculos.length === 1) {
      // Un solo restaurante — guardar directamente y redirigir al dashboard
      cookieStore.set("restaurante_activo", vinculos[0].restaurante_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      return { redirectUrl: "/dashboard" };
    }

    // Más de un restaurante — redirigir al selector
    return { redirectUrl: "/seleccionar-restaurante" };
  } catch (err: any) {
    // Re-lanzar errores internos de Next.js (NEXT_REDIRECT, NEXT_NOT_FOUND)
    // para que el framework los maneje correctamente.
    if (err?.digest?.startsWith?.("NEXT_REDIRECT") || err?.digest?.startsWith?.("NEXT_NOT_FOUND")) {
      throw err;
    }
    console.error("[LOGIN ERROR]:", err);
    return { error: "Ocurrió un error inesperado al iniciar sesión. Intenta de nuevo." };
  }
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("restaurante_activo");
  redirect("/login");
}

export async function getUsuarioActual() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  return usuario ?? null;
}

export async function cambiarPasswordAction(
  passwordActualOrInput: string | { passwordActual: string; nuevaPassword: string },
  nuevaPasswordArg?: string
): Promise<{ ok: boolean; mensaje?: string; error?: string }> {
  try {
    let passwordActual = "";
    let nuevaPassword = "";

    if (typeof passwordActualOrInput === "object" && passwordActualOrInput !== null) {
      passwordActual = passwordActualOrInput.passwordActual || "";
      nuevaPassword = passwordActualOrInput.nuevaPassword || "";
    } else if (typeof passwordActualOrInput === "string") {
      if (nuevaPasswordArg !== undefined) {
        passwordActual = passwordActualOrInput;
        nuevaPassword = nuevaPasswordArg;
      } else {
        nuevaPassword = passwordActualOrInput;
      }
    }

    // 1. Exigir sesión activa
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return {
        ok: false,
        error: "Debes tener una sesión activa para cambiar tu contraseña.",
      };
    }

    // 2. Límite de intentos: 5 por 15 minutos por usuario
    const rateCheck = await checkRateLimitCambioPassword(user.id);
    if (!rateCheck.success) {
      return {
        ok: false,
        error: "Demasiados intentos para cambiar la contraseña. Por favor intenta en 15 minutos.",
      };
    }

    // 3. Validar entradas
    if (!passwordActual) {
      return {
        ok: false,
        error: "Debes ingresar tu contraseña actual.",
      };
    }

    if (!nuevaPassword || nuevaPassword.length < 8) {
      return {
        ok: false,
        error: "La nueva contraseña debe tener al menos 8 caracteres.",
      };
    }

    if (nuevaPassword === passwordActual) {
      return {
        ok: false,
        error: "La nueva contraseña debe ser distinta de la actual.",
      };
    }

    // 4. Verificar contraseña actual con cliente aparte que NO modifique cookies ni sesión
    const tempSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { error: signInError } = await tempSupabase.auth.signInWithPassword({
      email: user.email,
      password: passwordActual,
    });

    if (signInError) {
      return {
        ok: false,
        error: "La contraseña actual no es correcta",
      };
    }

    // 5. Actualizar sobre la sesión normal
    const { error: updateError } = await supabase.auth.updateUser({
      password: nuevaPassword,
    });

    if (updateError) {
      return {
        ok: false,
        error: updateError.message || "No fue posible actualizar la contraseña.",
      };
    }

    // 6. Cerrar las demás sesiones del usuario (scope "others")
    try {
      await supabase.auth.signOut({ scope: "others" });
    } catch {
      // Ignorar si el backend de Supabase en este entorno no soporta el flag de scope
    }

    // 7. Registrar evento CAMBIO_PASSWORD en log_auditoria (sin valores sensibles ni contraseñas)
    try {
      let ip: string | null = null;
      try {
        const h = await headers();
        ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
      } catch {}

      const cookieStore = await cookies();
      let restauranteId = cookieStore.get("restaurante_activo")?.value;

      const usuarioDb = await db.query.usuarios.findFirst({
        where: eq(usuarios.auth_id, user.id),
      });

      if (usuarioDb) {
        if (!restauranteId) {
          const vinculo = await db.query.usuarioRestaurantes.findFirst({
            where: eq(usuarioRestaurantes.usuario_id, usuarioDb.id),
          });
          restauranteId = vinculo?.restaurante_id;
        }

        if (restauranteId) {
          await db.insert(logAuditoria).values({
            restaurante_id: restauranteId,
            usuario_id: usuarioDb.id,
            accion: "CAMBIO_PASSWORD",
            tabla_afectada: "auth.users",
            registro_id: user.id,
            valores_anteriores: null,
            valores_nuevos: null,
            ip_origen: ip,
          });
        }
      }
    } catch (auditErr: any) {
      console.error("[CAMBIO_PASSWORD_AUDIT_ERROR]", {
        tag: "AUDITORIA_ERROR",
        paso: "REGISTRO_LOG_AUDITORIA",
        errorName: auditErr?.name || "Error",
        errorMessage: auditErr?.message || String(auditErr),
      });
    }

    return {
      ok: true,
      mensaje: "Contraseña actualizada exitosamente.",
    };
  } catch (err: any) {
    console.error("[CAMBIO_PASSWORD_ERROR]", {
      tag: "CAMBIO_PASSWORD_EXCEPTION",
      paso: "PROCESAR_CAMBIO_PASSWORD",
      errorName: err?.name || "Error",
      errorMessage: err?.message || String(err),
    });
    return {
      ok: false,
      error: "Ocurrió un error inesperado al procesar el cambio de contraseña. Por favor intenta más tarde.",
    };
  }
}

