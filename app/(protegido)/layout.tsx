import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { AppShellWrapper } from "@/components/layout/AppShellWrapper";
import { PantallaPaywallMembresia } from "@/components/membresia/PantallaPaywallMembresia";
import { TrialBanner } from "@/components/layout/TrialBanner";

export default async function ProtegidoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getProtectedLayoutData();

  // Si el periodo de prueba de 14 días venció o la membresía está inactiva
  if (data.membresia.bloqueado) {
    return (
      <PantallaPaywallMembresia
        restauranteId={data.restauranteActivo.id}
        nombreRestaurante={data.restauranteActivo.nombre}
        motivoBloqueo={data.membresia.motivoBloqueo}
        planActual={data.restauranteActivo.plan}
      />
    );
  }

  const trialBanner = data.membresia.debeMostrarRecordatorio ? (
    <TrialBanner
      diasRestantes={data.membresia.diasRestantesTrial ?? 2}
      fechaFinTrial={data.membresia.fechaFinTrial}
    />
  ) : null;

  return (
    <AppShellWrapper
      user={data.user}
      currentBranchId={data.currentBranchId}
      branches={data.branches}
      notificationCounts={data.notificationCounts}
      trialBanner={trialBanner}
    >
      {children}
    </AppShellWrapper>
  );
}
