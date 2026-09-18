"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes, restaurantes, logAuditoria } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { UnauthorizedError } from "@/lib/errors";

export async function getVinculosUsuario() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) redirect("/login");

  return db
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
}

export async function seleccionarRestauranteAction(formData: FormData) {
  const restaurante_id = formData.get("restaurante_id") as string;
  if (!restaurante_id) return;

  // Verificar que el usuario realmente tiene vínculo con ese restaurante
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) redirect("/login");

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) throw new UnauthorizedError("Sin acceso a ese restaurante");

  const cookieStore = await cookies();
  cookieStore.set("restaurante_activo", restaurante_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  redirect("/dashboard");
}

export async function obtenerConfiguracionRestauranteAction(targetRestauranteId?: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError("Sesión no iniciada");

  const cookieStore = await cookies();
  const restId = targetRestauranteId || cookieStore.get("restaurante_activo")?.value;
  if (!restId) throw new UnauthorizedError("No hay sucursal seleccionada");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });
  if (!usuario) throw new UnauthorizedError("Usuario no encontrado");

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restId),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) throw new UnauthorizedError("Sin acceso a esta sucursal");

  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restId),
  });

  if (!rest) throw new Error("Restaurante no encontrado");

  return {
    restaurante: {
      id: rest.id,
      nombre: rest.nombre,
      direccion: rest.direccion || "",
      timezone: rest.timezone,
      plan: rest.plan,
      estadoSuscripcion: rest.estado_suscripcion,
      fechaFinTrial: rest.fecha_fin_trial ? rest.fecha_fin_trial.toISOString() : null,
      umbralFotoMerma: rest.umbral_foto_merma ? Number(rest.umbral_foto_merma) : 200,
      emailAlertas: rest.email_alertas || "",
      telegramChatId: rest.telegram_chat_id || "",
      tieneStripe: !!rest.stripe_customer_id,
    },
    rol: vinculo.rol,
  };
}

export async function actualizarConfiguracionRestauranteAction(
  restauranteId: string,
  datos: {
    nombre: string;
    direccion?: string;
    timezone: string;
    umbralFotoMerma: number;
    emailAlertas?: string;
    telegramChatId?: string;
  }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError("Sesión no iniciada");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });
  if (!usuario) throw new UnauthorizedError("Usuario no encontrado");

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restauranteId),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo || (vinculo.rol !== "dueno" && vinculo.rol !== "gerente")) {
    throw new UnauthorizedError("Se requiere rol de Dueño o Gerente para editar la configuración.");
  }

  await db
    .update(restaurantes)
    .set({
      nombre: datos.nombre.trim(),
      direccion: datos.direccion?.trim() || null,
      timezone: datos.timezone.trim(),
      umbral_foto_merma: datos.umbralFotoMerma.toString(),
      email_alertas: datos.emailAlertas?.trim().toLowerCase() || null,
      telegram_chat_id: datos.telegramChatId?.trim() || null,
    })
    .where(eq(restaurantes.id, restauranteId));

  // Registrar en auditoría
  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuario.id,
    accion: "CONFIGURACION_RESTAURANTE_ACTUALIZADA",
    valores_nuevos: {
      nombre: datos.nombre.trim(),
      direccion: datos.direccion?.trim(),
      timezone: datos.timezone.trim(),
      umbral_foto_merma: datos.umbralFotoMerma,
      email_alertas: datos.emailAlertas?.trim().toLowerCase() || null,
      telegram_chat_id: datos.telegramChatId?.trim() || null,
    },
  });

  return { exito: true };
}

