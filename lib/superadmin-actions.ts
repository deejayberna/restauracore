"use server";

import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  ticketsSoporte,
  logAuditoria,
} from "@/db/schema";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { UnauthorizedError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { getStripeClient } from "@/lib/stripe";

// Precios estándar de referencia para MRR estimado (MXN)
const PRECIOS_PLAN = {
  basico: 799,
  pro: 1499,
  enterprise: 2999,
};

/**
 * Valida que la sesión actual pertenezca a un correo autorizado en SUPER_ADMIN_EMAILS.
 * Doble capa de seguridad para Node.js / Server Actions.
 */
export async function validarSuperAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new UnauthorizedError("Acceso denegado: Sesión no iniciada.");
  }

  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (superAdminEmails.length === 0 || !superAdminEmails.includes(user.email.toLowerCase())) {
    throw new UnauthorizedError("Acceso denegado: Se requieren credenciales de Super-Admin.");
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  return {
    authId: user.id,
    id: usuario?.id ?? user.id,
    email: user.email,
    nombre: usuario?.nombre ?? user.email,
  };
}

/**
 * Métricas globales del SaaS para el dashboard del Super-Admin.
 */
export async function obtenerMetricasGlobalesAction() {
  await validarSuperAdmin();

  const todos = await db.select().from(restaurantes);

  const totalRestaurantes = todos.length;
  const activos = todos.filter((r) => r.estado_suscripcion === "activa").length;
  const trial = todos.filter((r) => r.estado_suscripcion === "trial").length;
  const cancelados = todos.filter((r) => r.estado_suscripcion === "cancelada").length;
  const pagoFallido = todos.filter((r) => r.estado_suscripcion === "pago_fallido").length;

  // Cálculo de MRR estimado (solo suscripciones activas de pago)
  const mrrEstimado = todos
    .filter((r) => r.estado_suscripcion === "activa")
    .reduce((acc, r) => acc + (PRECIOS_PLAN[r.plan as keyof typeof PRECIOS_PLAN] || 0), 0);

  // Conteo de tickets pendientes
  const ticketsAbiertosRes = await db
    .select({ count: sql<number>`count(*)` })
    .from(ticketsSoporte)
    .where(eq(ticketsSoporte.estado, "abierto"));

  const ticketsAbiertos = Number(ticketsAbiertosRes[0]?.count ?? 0);

  return {
    totalRestaurantes,
    activos,
    trial,
    cancelados,
    pagoFallido,
    mrrEstimado,
    ticketsAbiertos,
  };
}

/**
 * Directorio global de restaurantes con búsqueda y filtros.
 */
export async function obtenerRestaurantesSuperAdminAction(filtros?: {
  busqueda?: string;
  estado?: string;
}) {
  await validarSuperAdmin();

  const busqueda = filtros?.busqueda?.trim().toLowerCase();
  const estado = filtros?.estado?.trim();

  // Consulta todos los restaurantes con sus usuarios vinculados
  const lista = await db.query.restaurantes.findMany({
    orderBy: [desc(restaurantes.creado_en)],
    with: {
      usuarioRestaurantes: {
        where: and(eq(usuarioRestaurantes.rol, "dueno"), eq(usuarioRestaurantes.activo, true)),
        with: {
          usuario: true,
        },
      },
      ticketsSoporte: {
        orderBy: [desc(ticketsSoporte.creado_en)],
        limit: 5,
      },
    },
  });

  let resultados = lista.map((r) => {
    const duenoRel = r.usuarioRestaurantes?.[0];
    const dueno = duenoRel?.usuario;
    return {
      id: r.id,
      nombre: r.nombre,
      plan: r.plan,
      estado_suscripcion: r.estado_suscripcion,
      fecha_fin_trial: r.fecha_fin_trial,
      stripe_customer_id: r.stripe_customer_id,
      stripe_subscription_id: r.stripe_subscription_id,
      creado_en: r.creado_en,
      timezone: r.timezone,
      direccion: r.direccion,
      dueno: dueno
        ? {
            id: dueno.id,
            nombre: dueno.nombre,
            email: dueno.email,
          }
        : null,

      ticketsCount: r.ticketsSoporte?.length ?? 0,
    };
  });

  if (estado && estado !== "todos") {
    resultados = resultados.filter((r) => r.estado_suscripcion === estado);
  }

  if (busqueda) {
    resultados = resultados.filter(
      (r) =>
        r.nombre.toLowerCase().includes(busqueda) ||
        r.dueno?.email.toLowerCase().includes(busqueda) ||
        r.dueno?.nombre.toLowerCase().includes(busqueda)
    );
  }

  return resultados;
}

/**
 * Consulta detalle de un restaurante específico incluyendo historial Stripe si existe.
 */
export async function obtenerDetalleRestauranteAction(restauranteId: string) {
  await validarSuperAdmin();

  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restauranteId),
    with: {
      usuarioRestaurantes: {
        with: {
          usuario: true,
        },
      },
      ticketsSoporte: {
        orderBy: [desc(ticketsSoporte.creado_en)],
      },
    },
  });

  if (!rest) {
    throw new Error("Restaurante no encontrado.");
  }

  let historialStripe: any[] = [];
  if (rest.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripeClient();
      const facturas = await stripe.invoices.list({
        customer: rest.stripe_customer_id,
        limit: 10,
      });
      historialStripe = facturas.data.map((f) => ({
        id: f.id,
        numero: f.number,
        total: (f.total || 0) / 100,
        moneda: f.currency.toUpperCase(),
        estado: f.status,
        fecha: new Date(f.created * 1000).toISOString(),
        urlPdf: f.hosted_invoice_url,
      }));
    } catch (err) {
      console.warn("[SuperAdmin] No se pudo obtener facturas Stripe:", err);
    }
  }

  return {
    ...rest,
    historialStripe,
  };
}

export interface ExtenderTrialInput {
  restauranteId: string;
  diasAdicionales?: number;
  nuevaFechaFin?: string;
  motivo?: string;
}

/**
 * Función centralizada con validaciones estrictas para extender el periodo de prueba.
 */
export async function extenderTrialAction({
  restauranteId,
  diasAdicionales,
  nuevaFechaFin,
  motivo,
}: ExtenderTrialInput) {
  const superAdmin = await validarSuperAdmin();

  const [restaurante] = await db
    .select()
    .from(restaurantes)
    .where(eq(restaurantes.id, restauranteId));

  if (!restaurante) {
    throw new Error("Restaurante no encontrado.");
  }

  // 1. Bloqueo estricto: no extender suscripciones canceladas
  if (restaurante.estado_suscripcion === "cancelada") {
    throw new Error(
      "Operación rechazada: No es posible extender el trial de un restaurante con suscripción cancelada."
    );
  }

  // 2. Cálculo y validación de fecha futura
  // Si el trial ya venció, se calcula desde el momento actual (new Date())
  const ahora = new Date();
  const fechaFinActual = restaurante.fecha_fin_trial
    ? new Date(restaurante.fecha_fin_trial)
    : ahora;

  const baseDate = fechaFinActual > ahora ? fechaFinActual : ahora;
  const fechaCalculada = nuevaFechaFin
    ? new Date(nuevaFechaFin)
    : new Date(baseDate.getTime() + (diasAdicionales ?? 7) * 24 * 60 * 60 * 1000);

  if (fechaCalculada <= ahora) {
    throw new Error(
      "Operación rechazada: La nueva fecha de finalización del trial debe ser estrictamente en el futuro."
    );
  }

  // 3. Actualización de BD
  await db
    .update(restaurantes)
    .set({
      fecha_fin_trial: fechaCalculada,
      estado_suscripcion: "trial",
    })
    .where(eq(restaurantes.id, restauranteId));


  // 4. Auditoría inmutable
  // Nota: si superAdmin.id no es un UUID válido de usuarios (ej. admin global fuera de DB),
  // se busca o se deja el primer usuario admin disponible.
  let usuarioAuditoriaId = superAdmin.id;
  const [usuarioExiste] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioAuditoriaId));

  if (!usuarioExiste) {
    const primerUsuario = await db.query.usuarios.findFirst();
    if (primerUsuario) usuarioAuditoriaId = primerUsuario.id;
  }

  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuarioAuditoriaId,
    accion: "SUPERADMIN_EXTENDER_TRIAL",
    tabla_afectada: "restaurantes",
    registro_id: restauranteId,
    valores_anteriores: {
      fecha_fin_trial: restaurante.fecha_fin_trial,
    },
    valores_nuevos: {
      ejecutado_por_email: superAdmin.email,
      fecha_fin_trial: fechaCalculada,
      dias_adicionales: diasAdicionales,
      motivo: motivo || "Extensión autorizada desde panel Super-Admin",
    },
  });


  revalidatePath("/superadmin");
  return { success: true, nuevaFechaFin: fechaCalculada.toISOString() };
}

/**
 * Responder a un ticket de soporte desde el panel global de Super-Admin.
 */
export async function responderTicketAction(input: {
  ticketId: string;
  respuesta: string;
  nuevoEstado?: "en_proceso" | "resuelto";
}) {
  const superAdmin = await validarSuperAdmin();

  const respuesta = input.respuesta?.trim();
  if (!respuesta || respuesta.length < 5) {
    throw new Error("La respuesta debe tener al menos 5 caracteres.");
  }

  let usuarioAuditoriaId = superAdmin.id;
  const [usuarioExiste] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioAuditoriaId));
  if (!usuarioExiste) {
    const primer = await db.query.usuarios.findFirst();
    if (primer) usuarioAuditoriaId = primer.id;
  }

  await db
    .update(ticketsSoporte)
    .set({
      respuesta,
      estado: input.nuevoEstado || "resuelto",
      respondido_por: usuarioAuditoriaId,
      respondido_en: new Date(),
    })
    .where(eq(ticketsSoporte.id, input.ticketId));

  revalidatePath("/superadmin");
  revalidatePath("/soporte");
  return { success: true };
}

/**
 * Consulta unificada de todos los tickets del sistema para el inbox global de soporte.
 */
export async function obtenerTodosTicketsAction(filtroEstado?: string) {
  await validarSuperAdmin();

  const query = db
    .select({
      id: ticketsSoporte.id,
      restaurante_id: ticketsSoporte.restaurante_id,
      restaurante_nombre: restaurantes.nombre,
      usuario_id: ticketsSoporte.usuario_id,
      usuario_nombre: usuarios.nombre,
      usuario_email: usuarios.email,
      asunto: ticketsSoporte.asunto,
      mensaje: ticketsSoporte.mensaje,
      estado: ticketsSoporte.estado,
      respuesta: ticketsSoporte.respuesta,
      creado_en: ticketsSoporte.creado_en,
      respondido_en: ticketsSoporte.respondido_en,
    })
    .from(ticketsSoporte)
    .innerJoin(restaurantes, eq(ticketsSoporte.restaurante_id, restaurantes.id))
    .innerJoin(usuarios, eq(ticketsSoporte.usuario_id, usuarios.id))
    .orderBy(desc(ticketsSoporte.creado_en));

  const tickets = await query;

  if (filtroEstado && filtroEstado !== "todos") {
    return tickets.filter((t) => t.estado === filtroEstado);
  }

  return tickets;
}

