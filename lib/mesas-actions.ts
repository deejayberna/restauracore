"use server";

import { db } from "@/db";
import { asignacionesMesa, logAuditoria, mesas, ordenes, usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";

async function obtenerUsuarioYRolActivo() {
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

  if (!vinculo) {
    throw new UnauthorizedError("No tienes un vínculo activo con este restaurante");
  }

  return { usuario, vinculo, restaurante_id };
}

/**
 * Regenera el token QR de una mesa.
 * Invalida de forma inmediata el QR anterior.
 * Exclusivo para 'gerente' o 'dueno'.
 */
export async function regenerarTokenMesaAction(mesaId: string) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo gerentes o dueños pueden regenerar tokens QR de mesas");
  }

  const mesaExistente = await db.query.mesas.findFirst({
    where: and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)),
  });

  if (!mesaExistente) {
    throw new Error("Mesa no encontrada en el restaurante activo");
  }

  const nuevoToken = crypto.randomUUID();

  const [mesaActualizada] = await db
    .update(mesas)
    .set({
      qr_token: nuevoToken,
    })
    .where(and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)))
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "REGENERACION_QR_MESA",
    tabla_afectada: "mesas",
    registro_id: mesaId,
    valores_anteriores: {
      qr_token: mesaExistente.qr_token,
      numero: mesaExistente.numero,
    },
    valores_nuevos: {
      qr_token: nuevoToken,
      numero: mesaExistente.numero,
      regenerado_por: {
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        rol: vinculo.rol,
      },
      timestamp: new Date().toISOString(),
    },
  });

  return {
    ok: true,
    mesa_id: mesaId,
    numero: mesaActualizada.numero,
    nuevo_token: nuevoToken,
  };
}

/**
 * Asigna un mesero a una mesa para organización del turno.
 * La asignación es informativa y de apoyo operativo.
 */
export async function asignarMeseroMesaAction(input: {
  mesa_id: string;
  mesero_id?: string;
  usuario_id?: string;
  turno_id?: string | null;
  fecha?: string;
}) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo gerentes o dueños pueden asignar mesas a meseros");
  }

  const meseroId = input.mesero_id ?? input.usuario_id;
  if (!meseroId) throw new Error("El mesero asignado es obligatorio.");

  const fechaHoy = input.fecha ?? new Date().toISOString().slice(0, 10);

  // Eliminar asignación previa para esa mesa y fecha
  await db
    .delete(asignacionesMesa)
    .where(
      and(
        eq(asignacionesMesa.restaurante_id, restaurante_id),
        eq(asignacionesMesa.mesa_id, input.mesa_id),
        eq(asignacionesMesa.fecha, fechaHoy)
      )
    );

  // Crear nueva asignación
  const [nuevaAsignacion] = await db
    .insert(asignacionesMesa)
    .values({
      restaurante_id,
      mesa_id: input.mesa_id,
      mesero_id: meseroId,
      turno_id: input.turno_id ?? null,
      fecha: fechaHoy,
    })
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "ASIGNACION_MESERO_MESA",
    tabla_afectada: "asignaciones_mesa",
    registro_id: nuevaAsignacion.id,
    valores_anteriores: null,
    valores_nuevos: {
      mesa_id: input.mesa_id,
      mesero_id: meseroId,
      turno_id: input.turno_id ?? null,
      fecha: fechaHoy,
      asignado_por: usuario.id,
    },
  });

  return {
    ok: true,
    asignacion_id: nuevaAsignacion.id,
  };
}

/**
 * Toma exclusividad de una mesa de manera atómica con WHERE mesero_actual_id IS NULL.
 * Si otro mesero ya la tomó concurrentemente, la rechaza con su nombre.
 */
export async function tomarMesaAction(mesaId: string) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  // Roles permitidos para tomar mesa y dar servicio directo
  const ROLES_PERMITIDOS = ["mesero", "supervisor_piso", "gerente", "dueno"];
  if (!ROLES_PERMITIDOS.includes(vinculo.rol)) {
    throw new UnauthorizedError(`El rol '${vinculo.rol}' no está autorizado para tomar mesas.`);
  }

  // Actualización atómica con WHERE mesero_actual_id IS NULL para evitar condiciones de carrera
  const [mesaActualizada] = await db
    .update(mesas)
    .set({
      mesero_actual_id: usuario.id,
      asignado_en: new Date(),
    })
    .where(
      and(
        eq(mesas.id, mesaId),
        eq(mesas.restaurante_id, restaurante_id),
        sql`${mesas.mesero_actual_id} IS NULL`
      )
    )
    .returning();

  if (!mesaActualizada) {
    // Si no actualizó filas, investigamos la causa exacta
    const mesaActual = await db.query.mesas.findFirst({
      where: and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)),
    });

    if (!mesaActual) {
      throw new Error("Mesa no encontrada en este restaurante");
    }

    if (mesaActual.mesero_actual_id === usuario.id) {
      return { ok: true, mensaje: "Ya eres el mesero asignado a esta mesa", mesa: mesaActual };
    }

    let nombreOtro = "otro mesero";
    if (mesaActual.mesero_actual_id) {
      const otroUsuario = await db.query.usuarios.findFirst({
        where: eq(usuarios.id, mesaActual.mesero_actual_id),
      });
      if (otroUsuario?.nombre) {
        nombreOtro = otroUsuario.nombre;
      }
    }

    return {
      ok: false,
      error: `esta mesa ya está siendo atendida por ${nombreOtro}`,
    };
  }

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "TOMAR_MESA",
    tabla_afectada: "mesas",
    registro_id: mesaId,
    valores_anteriores: { mesero_actual_id: null },
    valores_nuevos: {
      mesero_actual_id: usuario.id,
      nombre_mesero: usuario.nombre,
      rol: vinculo.rol,
      asignado_en: new Date().toISOString(),
    },
  });

  return { ok: true, mesa: mesaActualizada };
}

/**
 * Libera la mesa actual.
 * Mesero solo puede liberar mesas tomadas por él mismo.
 * Supervisor de piso, gerente y dueño pueden liberar cualquier mesa.
 */
export async function liberarMesaAction(mesaId: string) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  const mesa = await db.query.mesas.findFirst({
    where: and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)),
  });

  if (!mesa) {
    throw new Error("Mesa no encontrada en este restaurante");
  }

  if (!mesa.mesero_actual_id) {
    return { ok: true, mensaje: "La mesa ya se encontraba liberada." };
  }

  // Si es mesero, solo puede liberar SU propia mesa
  if (vinculo.rol === "mesero" && mesa.mesero_actual_id !== usuario.id) {
    throw new UnauthorizedError("No puedes liberar una mesa atendida por otro mesero.");
  }

  // Roles permitidos para liberar
  const ROLES_LIBERACION = ["mesero", "supervisor_piso", "gerente", "dueno"];
  if (!ROLES_LIBERACION.includes(vinculo.rol)) {
    throw new UnauthorizedError(`El rol '${vinculo.rol}' no tiene permisos para liberar mesas.`);
  }

  const [mesaLiberada] = await db
    .update(mesas)
    .set({
      mesero_actual_id: null,
      asignado_en: null,
    })
    .where(and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)))
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "LIBERAR_MESA",
    tabla_afectada: "mesas",
    registro_id: mesaId,
    valores_anteriores: {
      mesero_actual_id: mesa.mesero_actual_id,
      asignado_en: mesa.asignado_en,
    },
    valores_nuevos: {
      mesero_actual_id: null,
      liberado_por: usuario.id,
      rol: vinculo.rol,
    },
  });

  return { ok: true, mesa: mesaLiberada };
}

/**
 * Transfiere una mesa a otro mesero del restaurante.
 * Exclusivo para 'supervisor_piso', 'gerente', 'dueno'.
 * Un mesero normal NO puede transferir mesas ajenas ni propias sin supervisión.
 */
export async function transferirMesaAction(mesaId: string, nuevoMeseroId: string) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  // EXCLUSIVO para supervisor_piso, gerente, dueno
  const ROLES_TRANSFERENCIA = ["supervisor_piso", "gerente", "dueno"];
  if (!ROLES_TRANSFERENCIA.includes(vinculo.rol)) {
    throw new UnauthorizedError(
      `Solo supervisor de piso, gerente o dueño pueden transferir mesas. Rol '${vinculo.rol}' no autorizado.`
    );
  }

  const mesa = await db.query.mesas.findFirst({
    where: and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)),
  });

  if (!mesa) {
    throw new Error("Mesa no encontrada en este restaurante");
  }

  // Validar que el nuevo mesero pertenezca al restaurante
  const vinculoNuevoMesero = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, nuevoMeseroId),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculoNuevoMesero) {
    throw new Error("El mesero receptor no pertenece activamente a este restaurante.");
  }

  const nuevoMeseroUsuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.id, nuevoMeseroId),
  });

  const [mesaActualizada] = await db
    .update(mesas)
    .set({
      mesero_actual_id: nuevoMeseroId,
      asignado_en: new Date(),
    })
    .where(and(eq(mesas.id, mesaId), eq(mesas.restaurante_id, restaurante_id)))
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "TRANSFERIR_MESA",
    tabla_afectada: "mesas",
    registro_id: mesaId,
    valores_anteriores: {
      mesero_actual_id: mesa.mesero_actual_id,
      asignado_en: mesa.asignado_en,
    },
    valores_nuevos: {
      mesero_actual_id: nuevoMeseroId,
      nombre_nuevo_mesero: nuevoMeseroUsuario?.nombre,
      transferido_por: usuario.id,
      rol_transferidor: vinculo.rol,
      timestamp: new Date().toISOString(),
    },
  });

  return { ok: true, mesa: mesaActualizada };
}

/**
 * Consulta todas las mesas del restaurante con su estado operativo actual,
 * mesero a cargo e indicador de órdenes abiertas no reclamadas.
 */
export async function obtenerMesasOperativasAction() {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  const listaMesas = await db.query.mesas.findMany({
    where: eq(mesas.restaurante_id, restaurante_id),
    orderBy: (m, { asc }) => [asc(m.numero)],
  });

  // Obtener órdenes abiertas activas del restaurante
  const ordenesActivas = await db.query.ordenes.findMany({
    where: and(
      eq(ordenes.restaurante_id, restaurante_id),
      sql`${ordenes.estado} IN ('abierta', 'cuenta_solicitada')`
    ),
  });

  // Obtener usuarios del restaurante para nombres de meseros
  const personal = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      email: usuarios.email,
      rol: usuarioRestaurantes.rol,
    })
    .from(usuarioRestaurantes)
    .innerJoin(usuarios, eq(usuarios.id, usuarioRestaurantes.usuario_id))
    .where(
      and(
        eq(usuarioRestaurantes.restaurante_id, restaurante_id),
        eq(usuarioRestaurantes.activo, true)
      )
    );

  const personalMap = new Map(personal.map((p) => [p.id, p]));

  const resultado = listaMesas.map((m) => {
    const ordenActiva = ordenesActivas.find((o) => o.mesa_id === m.id);
    const meseroInfo = m.mesero_actual_id ? personalMap.get(m.mesero_actual_id) : null;

    return {
      id: m.id,
      numero: m.numero,
      qr_token: m.qr_token,
      mesero_actual_id: m.mesero_actual_id,
      asignado_en: m.asignado_en,
      mesero_nombre: meseroInfo?.nombre ?? null,
      mesero_email: meseroInfo?.email ?? null,
      es_mi_mesa: m.mesero_actual_id === usuario.id,
      disponible_para_tomar: !m.mesero_actual_id,
      tiene_orden_activa: !!ordenActiva,
      orden_id: ordenActiva?.id ?? null,
      orden_total: ordenActiva?.total ?? null,
      orden_estado: ordenActiva?.estado ?? null,
      // Alerta de mesa no reclamada que requiere atención de servicio
      pedido_sin_mesero: !!ordenActiva && !m.mesero_actual_id,
    };
  });

  return {
    usuario_actual: { id: usuario.id, nombre: usuario.nombre, rol: vinculo.rol },
    mesas: resultado,
    meseros_disponibles: personal.filter((p) =>
      ["mesero", "supervisor_piso"].includes(p.rol)
    ),
  };
}

