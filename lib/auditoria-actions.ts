"use server";

import { db } from "@/db";
import { logAuditoria, usuarios, usuarioRestaurantes } from "@/db/schema";
import { eq, and, desc, count, sql, gte, lte } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";

async function obtenerSesionDueño() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError("Sesión no iniciada");
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) {
    throw new UnauthorizedError("Usuario no registrado en el sistema");
  }

  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) {
    throw new UnauthorizedError("No hay un restaurante activo seleccionado");
  }

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo || vinculo.rol !== "dueno") {
    throw new UnauthorizedError("Acceso exclusivo para el Dueño del restaurante");
  }

  return { usuario, vinculo, restaurante_id };
}

export interface FiltrosAuditoria {
  page?: number;
  pageSize?: number;
  tipo?: "todos" | "anomalias" | "seguridad" | "caja" | "personal";
  usuario_id?: string;
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
}

/**
 * Consulta el log de auditoría con filtros y paginación.
 * Restringido exclusivamente al Dueño.
 */
export async function consultarAuditoriaAction(filtros: FiltrosAuditoria = {}) {
  const { restaurante_id } = await obtenerSesionDueño();

  const page = Math.max(1, filtros.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filtros.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const condiciones: any[] = [eq(logAuditoria.restaurante_id, restaurante_id)];

  if (filtros.usuario_id) {
    condiciones.push(eq(logAuditoria.usuario_id, filtros.usuario_id));
  }

  if (filtros.desde) {
    condiciones.push(gte(logAuditoria.creado_en, new Date(`${filtros.desde}T00:00:00.000Z`)));
  }

  if (filtros.hasta) {
    condiciones.push(lte(logAuditoria.creado_en, new Date(`${filtros.hasta}T23:59:59.999Z`)));
  }

  if (filtros.tipo === "anomalias") {
    condiciones.push(sql`${logAuditoria.accion} LIKE 'ANOMALIA_%' OR ${logAuditoria.accion} LIKE 'FALLO_ENVIO_%'`);
  } else if (filtros.tipo === "seguridad") {
    condiciones.push(sql`${logAuditoria.accion} LIKE 'INTENTO_NO_AUTORIZADO_%' OR ${logAuditoria.accion} LIKE 'ACCESO_%'`);
  } else if (filtros.tipo === "caja") {
    condiciones.push(sql`${logAuditoria.accion} LIKE '%CAJA%' OR ${logAuditoria.accion} LIKE '%TURNO%' OR ${logAuditoria.accion} LIKE '%PAGO%'`);
  } else if (filtros.tipo === "personal") {
    condiciones.push(sql`${logAuditoria.accion} LIKE '%PERSONAL%' OR ${logAuditoria.accion} LIKE '%ASIGNACION_%'`);
  }

  const whereClause = and(...condiciones);

  // Conteo total
  const [totalRes] = await db
    .select({ total: count() })
    .from(logAuditoria)
    .where(whereClause);

  const total = totalRes?.total ?? 0;

  // Filas paginadas
  const filas = await db
    .select({
      id: logAuditoria.id,
      accion: logAuditoria.accion,
      tabla_afectada: logAuditoria.tabla_afectada,
      registro_id: logAuditoria.registro_id,
      valores_anteriores: logAuditoria.valores_anteriores,
      valores_nuevos: logAuditoria.valores_nuevos,
      timestamp: logAuditoria.creado_en,
      usuario_id: logAuditoria.usuario_id,
      usuario_nombre: usuarios.nombre,
      usuario_email: usuarios.email,
    })
    .from(logAuditoria)
    .leftJoin(usuarios, eq(usuarios.id, logAuditoria.usuario_id))
    .where(whereClause)
    .orderBy(desc(logAuditoria.creado_en))
    .limit(pageSize)
    .offset(offset);

  return {
    filas,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
