import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { obtenerMenuAdminAction } from "@/lib/menu-actions";
import { MenuAdminClient } from "@/components/menu/MenuAdminClient";
import { UtensilsCrossed } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Administración del Menú — RestauraCore",
  description: "Gestión de categorías, platillos, recetas y costos de inventario.",
};

export default async function AdministrarMenuPage() {
  const { user } = await getProtectedLayoutData();

  if (!["gerente", "dueno"].includes(user.rol)) {
    redirect("/home");
  }

  const { categorias, platillos, ingredientes } = await obtenerMenuAdminAction();

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-600/30">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Administración de Menú
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Configura categorías, platillos para venta en código QR y recetas con descuento de inventario.
            </p>
          </div>
        </div>
      </div>

      {/* Componente Interactivo */}
      <MenuAdminClient
        initialCategorias={categorias}
        initialPlatillos={platillos}
        initialIngredientes={ingredientes}
      />
    </div>
  );
}

