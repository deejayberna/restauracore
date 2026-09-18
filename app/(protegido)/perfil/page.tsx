import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { PerfilView } from "@/components/perfil/PerfilView";

export default async function PerfilPage() {
  const { user, currentBranchId, branches } = await getProtectedLayoutData();

  return (
    <PerfilView
      user={user}
      currentBranchId={currentBranchId}
      branches={branches}
    />
  );
}

