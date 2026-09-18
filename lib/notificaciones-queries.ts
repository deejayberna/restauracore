"use server";

import { db } from "@/db";
import {
  solicitudesCancelacionItem,
  movimientosInventario,
  compras,
  ingredientes,
  usuarios,
  platillos,
  ordenItems,
  mesas,
  ordenes,
  usuarioRestaurantes,
} from "@/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";

async function obtenerSesionYRestaurante() {
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
 * Obtiene el resumen consolidado de notificaciones y conteos de alertas pendientes
 * para la campana de la barra de navegación y la bandeja central.
 */
export async function obtenerResumenNotificacionesAction() {
  const { vinculo, restaurante_id } = await obtenerSesionYRestaurante();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    return {
      totalAlertas: 0,
      cancelacionesPendientes: 0,
      mermasRevision: 0,
      incidenciasCompras: 0,
      stockBajo: 0,
      listaCancelaciones: [],
      listaMermas: [],
      listaIncidencias: [],
      listaStockBajo: [],
    };
  }

  // 1. Solicitudes de cancelación pendientes
  const listaCancelaciones = await db
    .select({
      id: solicitudesCancelacionItem.id,
      orden_id: solicitudesCancelacionItem.orden_id,
      orden_item_id: solicitudesCancelacionItem.orden_item_id,
      motivo: solicitudesCancelacionItem.motivo,
      estado_item: solicitudesCancelacionItem.estado_item_al_solicitar,
      creado_en: solicitudesCancelacionItem.creado_en,
      solicitante_nombre: usuarios.nombre,
      platillo_nombre: platillos.nombre,
      cantidad: ordenItems.cantidad,
      precio_unitario: ordenItems.precio_unitario_congelado,
      mesa_numero: mesas.numero,
    })
    .from(solicitudesCancelacionItem)
    .innerJoin(usuarios, eq(usuarios.id, solicitudesCancelacionItem.solicitado_por))
    .innerJoin(ordenItems, eq(ordenItems.id, solicitudesCancelacionItem.orden_item_id))
    .innerJoin(platillos, eq(platillos.id, ordenItems.platillo_id))
    .innerJoin(ordenes, eq(ordenes.id, solicitudesCancelacionItem.orden_id))
    .innerJoin(mesas, eq(mesas.id, ordenes.mesa_id))
    .where(
      and(
        eq(solicitudesCancelacionItem.restaurante_id, restaurante_id),
        eq(solicitudesCancelacionItem.estado, "pendiente")
      )
    )
    .orderBy(desc(solicitudesCancelacionItem.creado_en));

  // 2. Mermas pendientes de revisión fotográfica
  const listaMermas = await db
    .select({
      id: movimientosInventario.id,
      ingrediente_nombre: ingredientes.nombre,
      cantidad: movimientosInventario.cantidad,
      unidad_medida: ingredientes.unidad_medida,
      motivo: movimientosInventario.motivo,
      creado_en: movimientosInventario.creado_en,
      creado_por_nombre: usuarios.nombre,
    })
    .from(movimientosInventario)
    .innerJoin(ingredientes, eq(ingredientes.id, movimientosInventario.ingrediente_id))
    .innerJoin(usuarios, eq(usuarios.id, movimientosInventario.creado_por))
    .where(
      and(
        eq(ingredientes.restaurante_id, restaurante_id),
        eq(movimientosInventario.tipo, "merma"),
        eq(movimientosInventario.revision_pendiente, true)
      )
    )
    .orderBy(desc(movimientosInventario.creado_en))
    .limit(20);

  // 3. Incidencias de compras recibidas con faltantes
  const listaIncidencias = await db
    .select({
      id: compras.id,
      total_real: compras.total_real,
      total_estimado: compras.total_estimado,
      creado_en: compras.creado_en,
    })
    .from(compras)
    .where(
      and(eq(compras.restaurante_id, restaurante_id), eq(compras.estado, "incidencia"))
    )
    .orderBy(desc(compras.creado_en))
    .limit(20);

  // 4. Ingredientes bajo stock mínimo
  const listaStockBajo = await db
    .select({
      id: ingredientes.id,
      nombre: ingredientes.nombre,
      stock_actual: ingredientes.stock_actual,
      stock_minimo: ingredientes.stock_minimo,
      unidad_medida: ingredientes.unidad_medida,
    })
    .from(ingredientes)
    .where(
      and(
        eq(ingredientes.restaurante_id, restaurante_id),
        sql`CAST(${ingredientes.stock_actual} AS numeric) <= CAST(${ingredientes.stock_minimo} AS numeric)`
      )
    )
    .orderBy(ingredientes.stock_actual)
    .limit(20);

  const cancelacionesPendientes = listaCancelaciones.length;
  const mermasRevision = listaMermas.length;
  const incidenciasCompras = listaIncidencias.length;
  const stockBajo = listaStockBajo.length;
  const totalAlertas = cancelacionesPendientes + mermasRevision + incidenciasCompras + stockBajo;

  return {
    totalAlertas,
    cancelacionesPendientes,
    mermasRevision,
    incidenciasCompras,
    stockBajo,
    listaCancelaciones,
    listaMermas,
    listaIncidencias,
    listaStockBajo,
  };
}

/**
 * Marca una merma que requería revisión fotográfica/gerencial como revisada.
 * Exclusivo para 'gerente' o 'dueno'.
 */
export async function marcarMermaRevisadaAction(movimientoId: string) {
  const { usuario, vinculo, restaurante_id } = await obtenerSesionYRestaurante();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden marcar mermas como revisadas.");
  }

  await db
    .update(movimientosInventario)
    .set({ revision_pendiente: false })
    .where(eq(movimientosInventario.id, movimientoId));

  return { ok: true, mensaje: "Merma marcada como revisada." };
}

