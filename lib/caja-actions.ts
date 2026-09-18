"use server";

import { db } from "@/db";
import { logAuditoria, ordenes, pagos, turnos, usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { z } from "@/lib/validation";
import { UnauthorizedError } from "@/lib/errors";
import {
  enviarNotificacionDiscrepanciaCaja,
  type DiscrepanciaCajaPayload,
} from "./notificaciones";
import { obtenerDestinatariosRestaurante } from "./notificaciones-destinatarios";
import {
  calcularDiscrepanciasCaja,
  type ResumenMetodosPago,
  type ConteoFisicoInput,
  type DetalleMetodoDiferencia,
  type DiferenciasMetodosPago,
  type EstadoTurnoInfo,
  type ResultadoCierreCaja,
} from "./caja-utils";

export type {
  ResumenMetodosPago,
  ConteoFisicoInput,
  DetalleMetodoDiferencia,
  DiferenciasMetodosPago,
  EstadoTurnoInfo,
  ResultadoCierreCaja,
};

const conteoFisicoSchema = z.object({
  turno_id: z.string().min(1, "El identificador del turno es obligatorio"),
  efectivo: z.number().min(0, "El monto en efectivo no puede ser negativo"),
  tarjeta: z.number().min(0, "El monto en tarjeta no puede ser negativo"),
  transferencia: z.number().min(0, "El monto en transferencia no puede ser negativo"),
  notas: z.string().max(500).optional().nullable(),
});

/**
 * Consulta pagos registrados en la tabla 'pagos' (con fallback a 'ordenes' si pagos está vacío)
 * en el restaurante activo dentro del turno o rango de fechas.
 */
export async function obtenerResumenCajaSistema(
  restaurante_id: string,
  opciones: { inicio?: Date; fin?: Date; turno_id?: string } = {}
): Promise<ResumenMetodosPago> {
  const fin = opciones.fin ?? new Date();
  const inicio =
    opciones.inicio ?? new Date(new Date(fin).setHours(0, 0, 0, 0));

  // 1. Intento primario: leer de la tabla 'pagos'
  const condicionesPagos = [
    eq(pagos.restaurante_id, restaurante_id),
    gte(pagos.creado_en, inicio),
    lte(pagos.creado_en, fin),
  ];
  if (opciones.turno_id) {
    condicionesPagos.push(eq(pagos.turno_id, opciones.turno_id));
  }

  const pagosRegistrados = await db
    .select({
      id: pagos.id,
      monto: pagos.monto,
      metodo_pago: pagos.metodo_pago,
      orden_id: pagos.orden_id,
    })
    .from(pagos)
    .where(and(...condicionesPagos));

  if (pagosRegistrados.length > 0) {
    let efectivo = 0;
    let tarjeta = 0;
    let transferencia = 0;
    const ordenesSet = new Set<string>();

    for (const p of pagosRegistrados) {
      const monto = Number(p.monto);
      const metodo = p.metodo_pago;
      ordenesSet.add(p.orden_id);

      if (metodo === "tarjeta") {
        tarjeta += monto;
      } else if (metodo === "transferencia") {
        transferencia += monto;
      } else {
        efectivo += monto;
      }
    }

    const total = efectivo + tarjeta + transferencia;

    return {
      efectivo: Number(efectivo.toFixed(2)),
      tarjeta: Number(tarjeta.toFixed(2)),
      transferencia: Number(transferencia.toFixed(2)),
      total: Number(total.toFixed(2)),
      ordenes_count: ordenesSet.size,
    };
  }

  // 2. Fallback de retrocompatibilidad: leer de 'ordenes' directamente
  const ordenesPagadas = await db
    .select({
      id: ordenes.id,
      total: ordenes.total,
      metodo_pago: ordenes.metodo_pago,
    })
    .from(ordenes)
    .where(
      and(
        eq(ordenes.restaurante_id, restaurante_id),
        eq(ordenes.estado, "pagado"),
        gte(ordenes.creado_en, inicio),
        lte(ordenes.creado_en, fin)
      )
    );

  let efectivo = 0;
  let tarjeta = 0;
  let transferencia = 0;

  for (const o of ordenesPagadas) {
    const monto = Number(o.total);
    const metodo = (o.metodo_pago ?? "efectivo").toLowerCase();

    if (metodo.includes("tarjeta") || metodo.includes("terminal") || metodo.includes("card")) {
      tarjeta += monto;
    } else if (metodo.includes("transfer") || metodo.includes("spei") || metodo.includes("banco")) {
      transferencia += monto;
    } else {
      efectivo += monto;
    }
  }

  const total = efectivo + tarjeta + transferencia;

  return {
    efectivo: Number(efectivo.toFixed(2)),
    tarjeta: Number(tarjeta.toFixed(2)),
    transferencia: Number(transferencia.toFixed(2)),
    total: Number(total.toFixed(2)),
    ordenes_count: ordenesPagadas.length,
  };
}

/**
 * Obtiene o inicializa el turno en la tabla 'turnos'.
 * La tabla 'turnos' es la ÚNICA fuente de verdad para el estado del turno.
 */
export async function obtenerOCrearTurnoActivo(
  restaurante_id: string,
  usuario_id: string,
  codigoTurno: string,
  responsable_id?: string | null
): Promise<EstadoTurnoInfo> {
  const turnoExistente = await db.query.turnos.findFirst({
    where: and(
      eq(turnos.restaurante_id, restaurante_id),
      eq(turnos.codigo, codigoTurno)
    ),
  });

  if (turnoExistente) {
    return {
      id: turnoExistente.id,
      codigo: turnoExistente.codigo,
      estado: turnoExistente.estado,
      fecha_inicio: turnoExistente.fecha_inicio.toISOString(),
      fecha_cierre: turnoExistente.fecha_cierre?.toISOString() ?? null,
      abierto_por_id: turnoExistente.abierto_por,
      cerrado_por_id: turnoExistente.cerrado_por,
      responsable_id: turnoExistente.responsable_id ?? null,
      monto_fisico: turnoExistente.monto_fisico,
      monto_sistema: turnoExistente.monto_sistema,
      diferencias: turnoExistente.diferencias,
      hay_discrepancia: turnoExistente.hay_discrepancia,
    };
  }

  // Crear turno en estado 'abierto'
  const [nuevoTurno] = await db
    .insert(turnos)
    .values({
      restaurante_id,
      codigo: codigoTurno,
      estado: "abierto",
      abierto_por: usuario_id,
      responsable_id: responsable_id ?? usuario_id,
    })
    .returning();

  return {
    id: nuevoTurno.id,
    codigo: nuevoTurno.codigo,
    estado: nuevoTurno.estado,
    fecha_inicio: nuevoTurno.fecha_inicio.toISOString(),
    fecha_cierre: null,
    abierto_por_id: nuevoTurno.abierto_por,
    responsable_id: nuevoTurno.responsable_id ?? null,
    hay_discrepancia: false,
  };
}

/**
 * Helper interno para verificar el usuario activo y su vínculo en usuario_restaurantes.
 */
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
 * ACCIÓN 1 (Mesero, Gerente, Dueño):
 * Captura del conteo físico preliminar / entrega de turno.
 * NO cierra el turno, solo actualiza el conteo y registra auditoría.
 */
export async function capturarConteoFisicoAction(formData: {
  turno_id: string;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  notas?: string | null;
}) {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  // Validar permisos: cajero, mesero, gerente o dueño
  if (!["cajero", "mesero", "gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Rol no autorizado para capturar conteo de caja");
  }

  const validado = conteoFisicoSchema.parse(formData);

  // Buscar turno en tabla 'turnos'
  const turnoDb = await db.query.turnos.findFirst({
    where: and(
      eq(turnos.restaurante_id, restaurante_id),
      or(eq(turnos.id, validado.turno_id), eq(turnos.codigo, validado.turno_id))
    ),
  });

  if (turnoDb && turnoDb.estado === "cerrado") {
    throw new Error(
      `El turno '${turnoDb.codigo}' ya se encuentra cerrado. No se admiten nuevos conteos.`
    );
  }

  // Verificación de responsable_id: si el turno tiene un responsable asignado,
  // solo ese cajero/mesero asignado o un gerente/dueño puede capturarlo.
  if (
    turnoDb?.responsable_id &&
    ["cajero", "mesero"].includes(vinculo.rol) &&
    turnoDb.responsable_id !== usuario.id
  ) {
    await db.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: "INTENTO_NO_AUTORIZADO_CAPTURA_CAJA_TURNO_AJENO",
      tabla_afectada: "turnos",
      registro_id: turnoDb.id,
      valores_anteriores: null,
      valores_nuevos: {
        motivo: "Un cajero/mesero intentó capturar el conteo de un turno asignado a otro responsable",
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        rol_intentado: vinculo.rol,
        responsable_asignado_id: turnoDb.responsable_id,
        timestamp: new Date().toISOString(),
      },
    });

    throw new UnauthorizedError(
      "Control de turno: Solo el responsable asignado a este turno (o un gerente/dueño) puede capturar el conteo físico."
    );
  }

  const sistema = await obtenerResumenCajaSistema(restaurante_id, {
    turno_id: turnoDb?.id,
  });
  const discrepancias = calcularDiscrepanciasCaja(sistema, validado);

  if (turnoDb) {
    await db
      .update(turnos)
      .set({
        capturado_por: usuario.id,
        monto_fisico: {
          efectivo: validado.efectivo,
          tarjeta: validado.tarjeta,
          transferencia: validado.transferencia,
          total: discrepancias.total.fisico,
        },
        diferencias: discrepancias,
        notas: validado.notas ?? null,
        actualizado_en: new Date(),
      })
      .where(and(eq(turnos.id, turnoDb.id), eq(turnos.estado, "abierto")));
  }

  // Registrar la entrega física preliminar en log_auditoria
  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "CAPTURA_CONTEO_FISICO",
    tabla_afectada: "caja",
    registro_id: turnoDb?.id ?? validado.turno_id,
    valores_anteriores: { sistema },
    valores_nuevos: {
      fisico: {
        efectivo: validado.efectivo,
        tarjeta: validado.tarjeta,
        transferencia: validado.transferencia,
        total: discrepancias.total.fisico,
      },
      diferencias_preliminares: discrepancias,
      capturado_por: {
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        rol: vinculo.rol,
      },
      notas: validado.notas ?? null,
    },
  });

  return {
    ok: true,
    turno_id: turnoDb?.id ?? validado.turno_id,
    codigo: turnoDb?.codigo ?? validado.turno_id,
    capturado_por: {
      usuario_id: usuario.id,
      nombre: usuario.nombre,
      rol: vinculo.rol,
    },
    conteo: {
      efectivo: validado.efectivo,
      tarjeta: validado.tarjeta,
      transferencia: validado.transferencia,
      notas: validado.notas,
    },
    discrepancias,
  };
}

/**
 * ACCIÓN 2 (EXCLUSIVA Gerente o Dueño):
 * Cierre definitivo con actualización ATÓMICA en la base de datos:
 * UPDATE turnos SET estado = 'cerrado' WHERE id = $1 AND estado = 'abierto' RETURNING *
 *
 * Si 0 filas son afectadas:
 * 1. Rechaza la operación.
 * 2. Registra en log_auditoria como 'ANOMALIA_INTENTO_DOBLE_CIERRE_CAJA'.
 * 3. Garantiza inmunidad ante condiciones de carrera (dos peticiones concurrentes).
 */
/**
 * Helper exportado para la alerta proactiva de discrepancia en arqueo de caja (anti-silencio).
 * Decide si hay discrepancia y dispara la notificación multicanal de forma segura.
 * Si la notificación falla:
 * 1. Logea el error de forma explícita en servidor con el tag [FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA].
 * 2. Si se proporciona contexto de auditoría (restaurante_id y usuario_id), asienta
 *    inmediatamente un registro inmutable en log_auditoria con acción 'FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA'.
 * De este modo, un fallo de entrega jamás pasa desapercibido ni queda en silencio.
 */
export async function dispararAlertaDiscrepanciaCajaSiAplica(
  hayDiscrepancia: boolean,
  payload: DiscrepanciaCajaPayload,
  contextoAuditoria?: {
    restaurante_id: string;
    usuario_id: string;
    turno_uuid?: string;
  }
): Promise<{ disparada: boolean; enviada?: boolean; error?: string }> {
  if (!hayDiscrepancia) {
    return { disparada: false };
  }

  try {
    await enviarNotificacionDiscrepanciaCaja(payload);
    return { disparada: true, enviada: true };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA] No se pudo entregar la alerta de discrepancia para turno ${payload.turno_id}:`,
      errorMsg
    );

    // Registro inmutable de auditoría para evitar fallos silenciosos
    if (contextoAuditoria?.restaurante_id && contextoAuditoria?.usuario_id) {
      try {
        await db.insert(logAuditoria).values({
          restaurante_id: contextoAuditoria.restaurante_id,
          usuario_id: contextoAuditoria.usuario_id,
          accion: "FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA",
          tabla_afectada: "turnos",
          registro_id: contextoAuditoria.turno_uuid ?? payload.turno_id,
          valores_anteriores: null,
          valores_nuevos: {
            turno_codigo: payload.turno_id,
            diferencia_total: payload.diferencia_total,
            desglose: payload.desglose,
            usuario_captura: payload.usuario_captura,
            usuario_cierre: payload.usuario_cierre,
            notas: payload.notas,
            error: errorMsg,
            fallo_en: "alerta_inmediata_multicanal",
          },
        });
      } catch (auditErr) {
        console.error(
          "[FALLO_AUDITORIA_CRITICO] Error al asentar FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA en log_auditoria:",
          auditErr
        );
      }
    }

    return { disparada: true, enviada: false, error: errorMsg };
  }
}

export async function confirmarCierreCajaAction(formData: {
  turno_id: string;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  capturado_por_id?: string;
  capturado_por_nombre?: string;
  capturado_por_rol?: string;
  notas?: string | null;
}): Promise<ResultadoCierreCaja> {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolActivo();

  // 1. SEGREGACIÓN DE PERMISOS: Solo 'gerente' o 'dueno' pueden autorizar y cerrar
  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    // Registrar intento no autorizado de cierre por personal de línea
    await db.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: "INTENTO_NO_AUTORIZADO_CIERRE_CAJA",
      tabla_afectada: "caja",
      registro_id: formData.turno_id,
      valores_anteriores: null,
      valores_nuevos: {
        motivo: "Un mesero intentó ejecutar el cierre definitivo de caja",
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        rol_intentado: vinculo.rol,
        timestamp: new Date().toISOString(),
      },
    });

    throw new UnauthorizedError(
      "Control anti-robo: Solo un usuario con rol 'gerente' o 'dueno' puede autorizar y cerrar el corte de caja."
    );
  }

  const validado = conteoFisicoSchema.parse(formData);

  // 2. Buscar turno en tabla 'turnos'
  const turnoDb = await db.query.turnos.findFirst({
    where: and(
      eq(turnos.restaurante_id, restaurante_id),
      or(eq(turnos.id, validado.turno_id), eq(turnos.codigo, validado.turno_id))
    ),
  });

  if (!turnoDb) {
    return {
      ok: false,
      codigo: "TURNO_NO_ENCONTRADO",
      error: `No se encontró el turno '${validado.turno_id}'.`,
    };
  }

  // 3. Recalcular montos del sistema en el servidor
  const sistema = await obtenerResumenCajaSistema(restaurante_id, {
    turno_id: turnoDb.id,
  });
  const diferencias = calcularDiscrepanciasCaja(sistema, validado);

  const capturadoPor = {
    usuario_id: formData.capturado_por_id ?? usuario.id,
    nombre: formData.capturado_por_nombre ?? usuario.nombre,
    rol: formData.capturado_por_rol ?? vinculo.rol,
  };

  const autorizadoPor = {
    usuario_id: usuario.id,
    nombre: usuario.nombre,
    rol: vinculo.rol,
  };

  const ahora = new Date();

  // 4. ACTUALIZACIÓN ATÓMICA A NIVEL DE BASE DE DATOS:
  // UPDATE turnos SET estado = 'cerrado' WHERE id = $1 AND estado = 'abierto' RETURNING *
  const [turnoActualizado] = await db
    .update(turnos)
    .set({
      estado: "cerrado",
      cerrado_por: usuario.id,
      capturado_por: capturadoPor.usuario_id,
      fecha_cierre: ahora,
      monto_sistema: sistema,
      monto_fisico: {
        efectivo: validado.efectivo,
        tarjeta: validado.tarjeta,
        transferencia: validado.transferencia,
        total: diferencias.total.fisico,
      },
      diferencias: diferencias,
      hay_discrepancia: diferencias.hay_discrepancia,
      notas: validado.notas ?? null,
      actualizado_en: ahora,
    })
    .where(and(eq(turnos.id, turnoDb.id), eq(turnos.estado, "abierto")))
    .returning();

  // 5. SI 0 FILAS AFECTADAS: El turno ya estaba cerrado o fue cerrado concurrentemente
  if (!turnoActualizado) {
    // Asentar intento en log_auditoria como 'ANOMALIA_INTENTO_DOBLE_CIERRE_CAJA'
    await db.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: "ANOMALIA_INTENTO_DOBLE_CIERRE_CAJA",
      tabla_afectada: "turnos",
      registro_id: turnoDb.id,
      valores_anteriores: {
        turno_id: turnoDb.id,
        codigo: turnoDb.codigo,
        estado: "cerrado",
        fecha_cierre_previa: turnoDb.fecha_cierre?.toISOString(),
        cerrado_por_previo_id: turnoDb.cerrado_por,
      },
      valores_nuevos: {
        intento_por: autorizadoPor,
        fecha_intento: ahora.toISOString(),
        motivo:
          "Actualización atómica fallida (0 filas afectadas): el turno ya fue cerrado o se cerró de forma concurrente.",
      },
    });

    return {
      ok: false,
      codigo: "TURNO_YA_CERRADO",
      error: `El turno '${turnoDb.codigo}' ya fue cerrado previamente. Operación rechazada para prevenir doble cierre.`,
    };
  }

  // 6. AUDITORÍA COMPLETA: Siempre registrar el desglose completo por método de pago
  const accionLog = diferencias.hay_discrepancia
    ? "DISCREPANCIA_ARQUEO_CAJA"
    : "CIERRE_TURNO_CONCILIADO";

  const [logInsertado] = await db
    .insert(logAuditoria)
    .values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: accionLog,
      tabla_afectada: "caja",
      registro_id: turnoActualizado.id,
      valores_anteriores: {
        sistema: {
          efectivo: sistema.efectivo,
          tarjeta: sistema.tarjeta,
          transferencia: sistema.transferencia,
          total: sistema.total,
        },
        ordenes_pagadas_count: sistema.ordenes_count,
        turno_id: turnoActualizado.id,
        codigo: turnoActualizado.codigo,
      },
      valores_nuevos: {
        fisico: {
          efectivo: validado.efectivo,
          tarjeta: validado.tarjeta,
          transferencia: validado.transferencia,
          total: diferencias.total.fisico,
        },
        diferencias: {
          efectivo: diferencias.efectivo.diferencia,
          tarjeta: diferencias.tarjeta.diferencia,
          transferencia: diferencias.transferencia.diferencia,
          total: diferencias.total.diferencia,
        },
        hay_discrepancia: diferencias.hay_discrepancia,
        tipo_discrepancia: diferencias.tipo_discrepancia,
        capturado_por: capturadoPor,
        autorizado_y_cerrado_por: autorizadoPor,
        fecha_cierre: ahora.toISOString(),
        notas: validado.notas ?? null,
      },
    })
    .returning();

  // 7. ALERTA PROACTIVA INMEDIATA: Notificar si existe discrepancia (mecanismo anti-silencio)
  if (diferencias.hay_discrepancia) {
    const destinatarios = await obtenerDestinatariosRestaurante(restaurante_id);

    dispararAlertaDiscrepanciaCajaSiAplica(
      diferencias.hay_discrepancia,
      {
        restaurante: destinatarios.restaurante_nombre || "Restaurante",
        usuario_cierre: `${autorizadoPor.nombre} (${autorizadoPor.rol})`,
        usuario_captura: `${capturadoPor.nombre} (${capturadoPor.rol})`,
        turno_id: turnoActualizado.codigo,
        diferencia_total: diferencias.total.diferencia,
        desglose: {
          efectivo: diferencias.efectivo,
          tarjeta: diferencias.tarjeta,
          transferencia: diferencias.transferencia,
        },
        notas: validado.notas,
        chat_id: destinatarios.chat_id,
        destinatario_email: destinatarios.emails,
      },
      {
        restaurante_id,
        usuario_id: usuario.id,
        turno_uuid: turnoActualizado.id,
      }
    ).catch((unhandledErr) => {
      console.error("[dispararAlertaDiscrepanciaCajaSiAplica Unhandled Error]:", unhandledErr);
    });
  }

  return {
    ok: true,
    turno_id: turnoActualizado.id,
    codigo: turnoActualizado.codigo,
    accion: accionLog,
    auditoria_id: logInsertado?.id,
    diferencias,
    hay_discrepancia: diferencias.hay_discrepancia,
    autorizado_por: autorizadoPor,
    capturado_por: capturadoPor,
  };
}
