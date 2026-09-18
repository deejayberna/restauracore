import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { PropinasView, type TurnoOpcion } from "@/components/caja/PropinasView";
import { obtenerReportePropinasTurnoAction } from "@/lib/pagos-actions";
import { db } from "@/db";
import { turnos, usuarios } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function PropinasPage({
  searchParams,
}: {
  searchParams: Promise<{ turno_id?: string }>;
}) {
  const { user, currentBranchId } = await getProtectedLayoutData();

  if (!["cajero", "gerente", "dueno"].includes(user.rol)) {
    redirect("/home");
  }

  const { turno_id: paramTurnoId } = await searchParams;

  // Obtener turnos recientes
  const turnosRecientes = await db
    .select({
      id: turnos.id,
      estado: turnos.estado,
      fecha_inicio: turnos.fecha_inicio,
      fecha_cierre: turnos.fecha_cierre,
      responsable_nombre: usuarios.nombre,
    })
    .from(turnos)
    .leftJoin(usuarios, eq(usuarios.id, turnos.responsable_id))
    .where(eq(turnos.restaurante_id, currentBranchId))
    .orderBy(desc(turnos.fecha_inicio))
    .limit(15);

  const turnoId = paramTurnoId || turnosRecientes[0]?.id;

  let reporte = null;
  if (turnoId) {
    const res = await obtenerReportePropinasTurnoAction(turnoId);
    if (res.ok && res.reporte) {
      reporte = res.reporte;
    }
  }

  return (
    <PropinasView
      reporteInicial={reporte}
      turnosDisponibles={turnosRecientes}
      turnoSeleccionadoId={turnoId || ""}
    />
  );
}
