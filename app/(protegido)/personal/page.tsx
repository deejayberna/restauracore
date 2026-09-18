import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { listarPersonalRestauranteAction } from "@/lib/personal-actions";
import { PersonalView } from "@/components/personal/PersonalView";
import { db } from "@/db";
import { mesas, asignacionesMesa } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function PersonalPage() {
  const { user, currentBranchId } = await getProtectedLayoutData();

  if (!["gerente", "dueno"].includes(user.rol)) {
    redirect("/home");
  }

  const empleados = await listarPersonalRestauranteAction();

  const fechaHoy = new Date().toISOString().slice(0, 10);

  // Obtener mesas y asignaciones del día
  const listaMesas = await db
    .select({
      id: mesas.id,
      numero: mesas.numero,
    })
    .from(mesas)
    .where(eq(mesas.restaurante_id, currentBranchId))
    .orderBy(mesas.numero);

  const asignacionesHoy = await db
    .select({
      mesa_id: asignacionesMesa.mesa_id,
      mesero_id: asignacionesMesa.mesero_id,
    })
    .from(asignacionesMesa)
    .where(
      and(
        eq(asignacionesMesa.restaurante_id, currentBranchId),
        eq(asignacionesMesa.fecha, fechaHoy)
      )
    );

  const mapaAsignaciones = new Map<string, string>();
  asignacionesHoy.forEach((a) => {
    mapaAsignaciones.set(a.mesa_id, a.mesero_id);
  });

  const mesasConAsignacion = listaMesas.map((m) => ({
    id: m.id,
    numero: m.numero,
    meseroAsignadoId: mapaAsignaciones.get(m.id) || null,
  }));

  return (
    <PersonalView
      currentUserRole={user.rol}
      empleados={empleados}
      mesas={mesasConAsignacion}
    />
  );
}

