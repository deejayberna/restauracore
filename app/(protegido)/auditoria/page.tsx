import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { AuditoriaView } from "@/components/auditoria/AuditoriaView";
import { consultarAuditoriaAction, type FiltrosAuditoria } from "@/lib/auditoria-actions";
import { redirect } from "next/navigation";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    tipo?: "todos" | "anomalias" | "seguridad" | "caja" | "personal";
    desde?: string;
    hasta?: string;
  }>;
}) {
  const { user } = await getProtectedLayoutData();

  if (user.rol !== "dueno") {
    redirect("/home");
  }

  const params = await searchParams;
  const page = params.page ? parseInt(params.page, 10) : 1;

  const res = await consultarAuditoriaAction({
    page,
    pageSize: 20,
    tipo: params.tipo,
    desde: params.desde,
    hasta: params.hasta,
  });

  return (
    <AuditoriaView
      filas={res.filas}
      total={res.total}
      page={res.page}
      pageSize={res.pageSize}
      totalPages={res.totalPages}
      tipoActual={params.tipo}
      desdeActual={params.desde}
      hastaActual={params.hasta}
    />
  );
}

