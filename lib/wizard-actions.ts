"use server";

import { db } from "@/db";
import {
  restaurantes,
  categoriasMenu,
  platillos,
  mesas,
  usuarios,
  usuarioRestaurantes,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cookies } from "next/headers";
import * as crypto from "crypto";

export type Rol = "mesero" | "cajero" | "chef" | "gerente" | "dueno";

async function getRestauranteActivoId(): Promise<string> {
  const cookieStore = await cookies();
  const restId = cookieStore.get("restaurante_activo")?.value;
  if (!restId) throw new Error("No hay restaurante activo seleccionado en la sesión.");
  return restId;
}

export async function obtenerDatosWizardAction() {
  const restId = await getRestauranteActivoId();

  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restId),
  });

  if (!rest) throw new Error("Restaurante no encontrado");

  const [primerCategoria] = await db
    .select()
    .from(categoriasMenu)
    .where(eq(categoriasMenu.restaurante_id, restId))
    .limit(1);

  const [primerMesa] = await db
    .select()
    .from(mesas)
    .where(eq(mesas.restaurante_id, restId))
    .limit(1);

  // Consultar email del dueño vinculado
  const [dueno] = await db
    .select({ email: usuarios.email })
    .from(usuarioRestaurantes)
    .innerJoin(usuarios, eq(usuarios.id, usuarioRestaurantes.usuario_id))
    .where(
      and(
        eq(usuarioRestaurantes.restaurante_id, restId),
        eq(usuarioRestaurantes.rol, "dueno"),
        eq(usuarioRestaurantes.activo, true)
      )
    )
    .limit(1);

  return {
    restaurante: {
      id: rest.id,
      nombre: rest.nombre,
      direccion: rest.direccion || "",
      timezone: rest.timezone,
      plan: rest.plan,
      emailAlertas: rest.email_alertas || dueno?.email || "",
    },
    tieneMenu: !!primerCategoria,
    mesaInicial: primerMesa
      ? { id: primerMesa.id, numero: primerMesa.numero, qrToken: primerMesa.qr_token }
      : null,
  };
}

export async function guardarPaso1Action(
  nombre: string,
  direccion: string,
  timezone: string,
  emailAlertas?: string
) {
  const restId = await getRestauranteActivoId();
  await db
    .update(restaurantes)
    .set({
      nombre: nombre.trim(),
      direccion: direccion.trim() || null,
      timezone: timezone.trim(),
      email_alertas: emailAlertas?.trim().toLowerCase() || null,
    })
    .where(eq(restaurantes.id, restId));

  return { exito: true };
}

export async function guardarPaso2MenuAction(
  categoriaNombre?: string,
  platilloNombre?: string,
  precio?: number
) {
  const restId = await getRestauranteActivoId();

  if (!categoriaNombre?.trim() || !platilloNombre?.trim() || !precio) {
    return { exito: true, omitido: true };
  }

  // Insertar categoría
  const [cat] = await db
    .insert(categoriasMenu)
    .values({
      restaurante_id: restId,
      nombre: categoriaNombre.trim(),
      orden: 1,
    })
    .returning();

  // Insertar platillo
  await db.insert(platillos).values({
    restaurante_id: restId,
    categoria_id: cat.id,
    nombre: platilloNombre.trim(),
    precio: precio.toFixed(2),
    disponible: true,
  });

  return { exito: true, omitido: false };
}

export async function guardarPaso3MesaAction() {
  const restId = await getRestauranteActivoId();

  // Si ya tiene mesa 1, retornarla
  const [existente] = await db
    .select()
    .from(mesas)
    .where(and(eq(mesas.restaurante_id, restId), eq(mesas.numero, 1)))
    .limit(1);

  if (existente) {
    return {
      exito: true,
      mesa: { id: existente.id, numero: existente.numero, qrToken: existente.qr_token },
    };
  }

  const qrToken = `mesa_1_${crypto.randomBytes(8).toString("hex")}`;
  const [mesa] = await db
    .insert(mesas)
    .values({
      restaurante_id: restId,
      numero: 1,
      qr_token: qrToken,
    })
    .returning();

  return {
    exito: true,
    mesa: { id: mesa.id, numero: mesa.numero, qrToken: mesa.qr_token },
  };
}

export async function guardarPaso4InvitarAction(
  email?: string,
  nombre?: string,
  rol?: Rol
) {
  const restId = await getRestauranteActivoId();

  if (!email?.trim() || !nombre?.trim() || !rol) {
    return { exito: true, omitido: true };
  }

  // Crear usuario con invitación pendiente (patrón Fase 10)
  const authIdPlaceholder = `pending_invite_${crypto.randomUUID()}`;

  let [user] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(usuarios)
      .values({
        auth_id: authIdPlaceholder,
        nombre: nombre.trim(),
        email: email.toLowerCase().trim(),
        activo: true,
      })
      .returning();
  } else {
    [user] = await db
      .update(usuarios)
      .set({ nombre: nombre.trim() })
      .where(eq(usuarios.id, user.id))
      .returning();
  }

  await db.insert(usuarioRestaurantes).values({
    usuario_id: user.id,
    restaurante_id: restId,
    rol: rol,
    activo: true,
    invitacion_pendiente: true,
  });

  return { exito: true, omitido: false };
}

