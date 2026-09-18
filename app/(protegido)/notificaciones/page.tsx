import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { NotificacionesView } from "@/components/notificaciones/NotificacionesView";
import { obtenerResumenNotificacionesAction } from "@/lib/notificaciones-queries";
import { redirect } from "next/navigation";

export default async function NotificacionesPage() {
  const { user } = await getProtectedLayoutData();

  if (!["gerente", "dueno"].includes(user.rol)) {
    redirect("/home");
  }

  const data = await obtenerResumenNotificacionesAction();

  return <NotificacionesView data={data} />;
}

