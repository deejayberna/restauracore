import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { CancelacionesView, type SolicitudCancelacionUI } from "@/components/cancelaciones/CancelacionesView";
import { db } from "@/db";
import {
  solicitudesCancelacionItem,
  ordenes,
  ordenItems,
  platillos,
  mesas,
  usuarios,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";

export default async function CancelacionesPage() {
  const { user, currentBranchId } = await getProtectedLayoutData();

  if (!["gerente", "dueno"].includes(user.rol)) {
    redirect("/home");
  }

  const solicitanteUsuario = alias(usuarios, "solicitante");
  const aprobadorUsuario = alias(usuarios, "aprobador");

  // Solicitudes pendientes
  const filasPendientes = await db
    .select({
      id: solicitudesCancelacionItem.id,
      orden_id: solicitudesCancelacionItem.orden_id,
      orden_item_id: solicitudesCancelacionItem.orden_item_id,
      motivo: solicitudesCancelacionItem.motivo,
      estado_item: solicitudesCancelacionItem.estado_item_al_solicitar,
      estado: solicitudesCancelacionItem.estado,
      creado_en: solicitudesCancelacionItem.creado_en,
      solicitante_nombre: solicitanteUsuario.nombre,
      platillo_nombre: platillos.nombre,
      cantidad: ordenItems.cantidad,
      precio_unitario: ordenItems.precio_unitario_congelado,
      mesa_numero: mesas.numero,
    })
    .from(solicitudesCancelacionItem)
    .innerJoin(solicitanteUsuario, eq(solicitanteUsuario.id, solicitudesCancelacionItem.solicitado_por))
    .innerJoin(ordenItems, eq(ordenItems.id, solicitudesCancelacionItem.orden_item_id))
    .innerJoin(platillos, eq(platillos.id, ordenItems.platillo_id))
    .innerJoin(ordenes, eq(ordenes.id, solicitudesCancelacionItem.orden_id))
    .innerJoin(mesas, eq(mesas.id, ordenes.mesa_id))
    .where(
      and(
        eq(solicitudesCancelacionItem.restaurante_id, currentBranchId),
        eq(solicitudesCancelacionItem.estado, "pendiente")
      )
    )
    .orderBy(desc(solicitudesCancelacionItem.creado_en));

  // Historial resuelto
  const filasHistorial = await db
    .select({
      id: solicitudesCancelacionItem.id,
      orden_id: solicitudesCancelacionItem.orden_id,
      orden_item_id: solicitudesCancelacionItem.orden_item_id,
      motivo: solicitudesCancelacionItem.motivo,
      estado_item: solicitudesCancelacionItem.estado_item_al_solicitar,
      estado: solicitudesCancelacionItem.estado,
      motivo_resolucion: solicitudesCancelacionItem.motivo_resolucion,
      creado_en: solicitudesCancelacionItem.creado_en,
      resuelto_en: solicitudesCancelacionItem.resuelto_en,
      solicitante_nombre: solicitanteUsuario.nombre,
      aprobado_por_nombre: aprobadorUsuario.nombre,
      platillo_nombre: platillos.nombre,
      cantidad: ordenItems.cantidad,
      precio_unitario: ordenItems.precio_unitario_congelado,
      mesa_numero: mesas.numero,
    })
    .from(solicitudesCancelacionItem)
    .innerJoin(solicitanteUsuario, eq(solicitanteUsuario.id, solicitudesCancelacionItem.solicitado_por))
    .leftJoin(aprobadorUsuario, eq(aprobadorUsuario.id, solicitudesCancelacionItem.aprobado_por))
    .innerJoin(ordenItems, eq(ordenItems.id, solicitudesCancelacionItem.orden_item_id))
    .innerJoin(platillos, eq(platillos.id, ordenItems.platillo_id))
    .innerJoin(ordenes, eq(ordenes.id, solicitudesCancelacionItem.orden_id))
    .innerJoin(mesas, eq(mesas.id, ordenes.mesa_id))
    .where(
      and(
        eq(solicitudesCancelacionItem.restaurante_id, currentBranchId),
        sql`${solicitudesCancelacionItem.estado} IN ('aprobada', 'rechazada')`
      )
    )
    .orderBy(desc(solicitudesCancelacionItem.resuelto_en))
    .limit(50);

  const formatItem = (item: any): SolicitudCancelacionUI => ({
    id: item.id,
    orden_id: item.orden_id,
    orden_item_id: item.orden_item_id,
    mesa_numero: item.mesa_numero,
    platillo_nombre: item.platillo_nombre,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    total_congelado: Number((item.cantidad * Number(item.precio_unitario)).toFixed(2)),
    solicitante_nombre: item.solicitante_nombre,
    estado_item: item.estado_item,
    motivo: item.motivo,
    estado: item.estado,
    motivo_resolucion: item.motivo_resolucion,
    aprobado_por_nombre: item.aprobado_por_nombre,
    creado_en: item.creado_en,
    resuelto_en: item.resuelto_en,
  });

  return (
    <CancelacionesView
      solicitudesPendientes={filasPendientes.map(formatItem)}
      solicitudesHistorial={filasHistorial.map(formatItem)}
    />
  );
}

