import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { AppShellWrapper } from "@/components/layout/AppShellWrapper";

export default async function ProtegidoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getProtectedLayoutData();

  return (
    <AppShellWrapper
      user={data.user}
      currentBranchId={data.currentBranchId}
      branches={data.branches}
      notificationCounts={data.notificationCounts}
    >
      {children}
    </AppShellWrapper>
  );
}

