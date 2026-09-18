"use server";

import { db } from "@/db";
import { asignacionesMesa, logAuditoria, mesas, usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";

async function obtenerUsuarioYRolActivo() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError("Sesión no iniciada");
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) {
    throw new UnauthorizedError("Usuario no registrado en el sistema");
  }

  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) {
    throw new UnauthorizedError("No hay un restaurante activo seleccionado");
  }

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) {
    throw new UnauthorizedError("No tienes un vínculo activo con este restaurante");
  }

  return { usuario, vinculo, restaurante_id };
}

/**
 * Regenera el token QR de una mesa.
 * Invalida de forma inmediata el QR anterior.
 * Exclusivo para 'gerente' o 'dueno'.
 */
export async function regenerarTokenMesaAction(mesaId: string) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo gerentes o dueños pueden regenerar tokens QR de mesas");
  }

  const mesaExistente = await db.query.mesas.findFirst({
    where: and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)),
  });

  if (!mesaExistente) {
    throw new Error("Mesa no encontrada en el restaurante activo");
  }

  const nuevoToken = crypto.randomUUID();

  const [mesaActualizada] = await db
    .update(mesas)
    .set({
      qr_token: nuevoToken,
    })
    .where(and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)))
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "REGENERACION_QR_MESA",
    tabla_afectada: "mesas",
    registro_id: mesaId,
    valores_anteriores: {
      qr_token: mesaExistente.qr_token,
      numero: mesaExistente.numero,
    },
    valores_nuevos: {
      qr_token: nuevoToken,
      numero: mesaExistente.numero,
      regenerado_por: {
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        rol: vinculo.rol,
      },
      timestamp: new Date().toISOString(),
    },
  });

  return {
    ok: true,
    mesa_id: mesaId,
    numero: mesaActualizada.numero,
    nuevo_token: nuevoToken,
  };
}

/**
 * Asigna un mesero a una mesa para organización del turno.
 * La asignación es informativa y de apoyo operativo.
 */
export async function asignarMeseroMesaAction(input: {
  mesa_id: string;
  mesero_id?: string;
  usuario_id?: string;
  turno_id?: string | null;
  fecha?: string;
}) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo gerentes o dueños pueden asignar mesas a meseros");
  }

  const meseroId = input.mesero_id ?? input.usuario_id;
  if (!meseroId) throw new Error("El mesero asignado es obligatorio.");

  const fechaHoy = input.fecha ?? new Date().toISOString().slice(0, 10);

  // Eliminar asignación previa para esa mesa y fecha
  await db
    .delete(asignacionesMesa)
    .where(
      and(
        eq(asignacionesMesa.restaurante_id, restaurante_id),
        eq(asignacionesMesa.mesa_id, input.mesa_id),
        eq(asignacionesMesa.fecha, fechaHoy)
      )
    );

  // Crear nueva asignación
  const [nuevaAsignacion] = await db
    .insert(asignacionesMesa)
    .values({
      restaurante_id,
      mesa_id: input.mesa_id,
      mesero_id: meseroId,
      turno_id: input.turno_id ?? null,
      fecha: fechaHoy,
    })
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "ASIGNACION_MESERO_MESA",
    tabla_afectada: "asignaciones_mesa",
    registro_id: nuevaAsignacion.id,
    valores_anteriores: null,
    valores_nuevos: {
      mesa_id: input.mesa_id,
      mesero_id: meseroId,
      turno_id: input.turno_id ?? null,
      fecha: fechaHoy,
      asignado_por: usuario.id,
    },
  });

  return {
    ok: true,
    asignacion_id: nuevaAsignacion.id,
  };
}

