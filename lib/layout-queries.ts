import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes, restaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { obtenerResumenNotificacionesAction } from "@/lib/notificaciones-queries";
import { evaluarEstadoMembresia, type Plan } from "@/lib/planes";

export async function getProtectedLayoutData() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, authUser.id),
  });

  if (!usuario) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const restaurante_activo_id = cookieStore.get("restaurante_activo")?.value;

  // Obtener todas las sucursales asignadas activas del usuario con estado de membresía
  const vinculos = await db
    .select({
      restaurante_id: usuarioRestaurantes.restaurante_id,
      rol: usuarioRestaurantes.rol,
      nombre: restaurantes.nombre,
      plan: restaurantes.plan,
      estado_suscripcion: restaurantes.estado_suscripcion,
      fecha_fin_trial: restaurantes.fecha_fin_trial,
    })
    .from(usuarioRestaurantes)
    .innerJoin(restaurantes, eq(restaurantes.id, usuarioRestaurantes.restaurante_id))
    .where(
      and(
        eq(usuarioRestaurantes.usuario_id, usuario.id),
        eq(usuarioRestaurantes.activo, true)
      )
    );

  if (vinculos.length === 0) {
    redirect("/login?error=sin-sucursal");
  }

  let vinculoActivo = vinculos.find((v) => v.restaurante_id === restaurante_activo_id);

  if (!vinculoActivo) {
    // Si no tiene cookie o la cookie es inválida, usar la primera sucursal
    vinculoActivo = vinculos[0];
    cookieStore.set("restaurante_activo", vinculoActivo.restaurante_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  // Notificaciones
  let notificationCounts = {
    totalAlertas: 0,
    cancelacionesPendientes: 0,
    mermasRevision: 0,
    incidenciasCompras: 0,
    stockBajo: 0,
  };

  try {
    const res = await obtenerResumenNotificacionesAction();
    notificationCounts = {
      totalAlertas: res.totalAlertas,
      cancelacionesPendientes: res.cancelacionesPendientes,
      mermasRevision: res.mermasRevision,
      incidenciasCompras: res.incidenciasCompras,
      stockBajo: res.stockBajo,
    };
  } catch {
    // Ignorar para roles que no tienen acceso a notificaciones
  }

  const membresia = evaluarEstadoMembresia({
    estado_suscripcion: vinculoActivo.estado_suscripcion,
    fecha_fin_trial: vinculoActivo.fecha_fin_trial,
  });

  return {
    user: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: vinculoActivo.rol,
    },
    currentBranchId: vinculoActivo.restaurante_id,
    branches: vinculos,
    notificationCounts,
    membresia: {
      bloqueado: membresia.bloqueado,
      motivoBloqueo: membresia.motivoBloqueo,
      esTrial: membresia.esTrial,
      diasRestantesTrial: membresia.diasRestantesTrial,
      debeMostrarRecordatorio: membresia.debeMostrarRecordatorio,
      fechaFinTrial: membresia.fechaFinTrial ? membresia.fechaFinTrial.toISOString() : null,
    },
    restauranteActivo: {
      id: vinculoActivo.restaurante_id,
      nombre: vinculoActivo.nombre,
      plan: vinculoActivo.plan as Plan,
    },
  };
}

