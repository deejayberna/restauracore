import { redirect } from "next/navigation";
import {
  validarSuperAdmin,
  obtenerMetricasGlobalesAction,
  obtenerRestaurantesSuperAdminAction,
  obtenerTodosTicketsAction,
} from "@/lib/superadmin-actions";
import { SuperAdminClient } from "@/components/superadmin/SuperAdminClient";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  let superAdmin;
  try {
    superAdmin = await validarSuperAdmin();
  } catch (err) {
    redirect("/login?error=unauthorized");
  }

  const [metricas, restaurantes, tickets] = await Promise.all([
    obtenerMetricasGlobalesAction(),
    obtenerRestaurantesSuperAdminAction(),
    obtenerTodosTicketsAction(),
  ]);

  return (
    <SuperAdminClient
      adminEmail={superAdmin.email}
      metricas={metricas}
      restaurantesIniciales={restaurantes as any}
      ticketsIniciales={tickets as any}
    />
  );
}

