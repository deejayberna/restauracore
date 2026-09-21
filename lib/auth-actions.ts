"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes, restaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { validateOrThrow, z } from "@/lib/validation";
import { cookies, headers } from "next/headers";
import { checkRateLimitLogin } from "@/lib/rate-limiter";

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

  // Si el usuario es Super-Admin de RestauraCore, redirigir directamente al panel superadmin
  const rawSuperAdmins =
    process.env.SUPER_ADMIN_EMAILS ||
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ||
    "";
  const superAdminEmails = rawSuperAdmins
    .split(",")
    .map((e) => e.replace(/['"]/g, "").trim().toLowerCase())
    .filter(Boolean);

  if (user.email && superAdminEmails.includes(user.email.toLowerCase())) {
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
    if (user.email && superAdminEmails.includes(user.email.toLowerCase())) {
      return { redirectUrl: "/superadmin" };
    }
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

export async function cambiarPasswordAction(nuevaPassword: string) {
  if (!nuevaPassword || nuevaPassword.length < 6) {
    return { ok: false, error: "La contraseña debe contener al menos 6 caracteres." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password: nuevaPassword,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, mensaje: "Contraseña actualizada exitosamente." };
}

