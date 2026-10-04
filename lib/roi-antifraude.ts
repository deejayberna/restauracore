import { db } from "@/db";
import {
  ingredientes,
  logAuditoria,
  movimientosInventario,
  restaurantes,
  turnos,
} from "@/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export interface ResumenValorProtegido {
  periodo: {
    desde: Date;
    hasta: Date;
    mesNombre: string;
    anio: number;
  };
  restaurante: {
    id: string;
    nombre: string;
    creadoEn: Date;
    diasActivo: number;
  };
  elegibleParaMostrar: boolean;
  montoTotalDetectado: number;
  desglose: {
    discrepanciasCaja: {
      montoFaltantes: number;
      turnosConFaltante: number;
      totalTurnosAuditados: number;
      detalles: {
        turnoId: string;
        codigo: string;
        fechaCierre: Date | null;
        montoFaltante: number;
      }[];
    };
    mermasRevision: {
      montoEstimado: number;
      cantidadEventos: number;
      detalles: {
        movimientoId: string;
        ingrediente: string;
        cantidad: number;
        costoUnitario: number;
        subtotal: number;
        motivo: string;
        creadoEn: Date;
      }[];
    };
  };
  seguridadYAuditoria: {
    intentosBloqueados: number;
    alertasRoboSospechadoTotal: number;
    alertasRoboInvestigadas: number;
    desgloseAccionesBloqueadas: { accion: string; conteo: number }[];
  };
  confirmacionesDueno: {
    roboConfirmadoMonto: number;
    roboConfirmadoEventos: number;
    errorHumanoMonto: number;
    errorHumanoEventos: number;
  };
}

export function obtenerRangoMesCalendarioActual(referencia: Date = new Date()): {
  desde: Date;
  hasta: Date;
  mesNombre: string;
  anio: number;
} {
  const anio = referencia.getFullYear();
  const mes = referencia.getMonth();
  const desde = new Date(anio, mes, 1, 0, 0, 0, 0);
  const hasta = new Date(referencia);

  const nombresMeses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  return {
    desde,
    hasta,
    mesNombre: nombresMeses[mes],
    anio,
  };
}

export async function calcularValorProtegido(
  restauranteId: string,
  desdeParam?: Date,
  hastaParam?: Date
): Promise<ResumenValorProtegido> {
  const rango = obtenerRangoMesCalendarioActual();
  const desde = desdeParam ?? rango.desde;
  // Añadir un margen de 10 segundos a 'hasta' para cubrir pequeñas diferencias de reloj entre el servidor Node y Postgres
  const hasta = hastaParam ?? new Date(Date.now() + 10000);

  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restauranteId),
  });

  if (!rest) {
    throw new Error(`Restaurante no encontrado: ${restauranteId}`);
  }

  const creadoEn = rest.creado_en ?? new Date();
  const msPorDia = 1000 * 60 * 60 * 24;
  const diasActivo = Math.max(0, Math.floor((Date.now() - creadoEn.getTime()) / msPorDia));
  const elegibleParaMostrar = diasActivo >= 7;

  const turnosPeriodo = await db.query.turnos.findMany({
    where: and(
      eq(turnos.restaurante_id, restauranteId),
      eq(turnos.estado, "cerrado"),
      gte(turnos.fecha_cierre, desde),
      lte(turnos.fecha_cierre, hasta)
    ),
    orderBy: desc(turnos.fecha_cierre),
  });

  let montoFaltantesCaja = 0;
  let turnosConFaltante = 0;
  const detallesTurnos: ResumenValorProtegido["desglose"]["discrepanciasCaja"]["detalles"] = [];

  for (const t of turnosPeriodo) {
    if (!t.hay_discrepancia || !t.diferencias) continue;

    const difObj = t.diferencias as any;
    const diffTotalRaw = difObj?.total?.diferencia ?? difObj?.total;
    const diffTotal = typeof diffTotalRaw === "number" ? diffTotalRaw : parseFloat(diffTotalRaw ?? "0");

    if (diffTotal < -0.001) {
      const faltante = Math.abs(diffTotal);
      montoFaltantesCaja += faltante;
      turnosConFaltante += 1;
      detallesTurnos.push({
        turnoId: t.id,
        codigo: t.codigo,
        fechaCierre: t.fecha_cierre,
        montoFaltante: faltante,
      });
    }
  }

  const mermasPeriodo = await db
    .select({
      id: movimientosInventario.id,
      cantidad: movimientosInventario.cantidad,
      motivo: movimientosInventario.motivo,
      revision_pendiente: movimientosInventario.revision_pendiente,
      creado_en: movimientosInventario.creado_en,
      ingrediente_nombre: ingredientes.nombre,
      costo_unitario: ingredientes.costo_unitario,
    })
    .from(movimientosInventario)
    .innerJoin(ingredientes, eq(ingredientes.id, movimientosInventario.ingrediente_id))
    .where(
      and(
        eq(ingredientes.restaurante_id, restauranteId),
        eq(movimientosInventario.tipo, "merma"),
        gte(movimientosInventario.creado_en, desde),
        lte(movimientosInventario.creado_en, hasta)
      )
    )
    .orderBy(desc(movimientosInventario.creado_en));

  let montoEstimadoMermas = 0;
  const detallesMermas: ResumenValorProtegido["desglose"]["mermasRevision"]["detalles"] = [];

  for (const m of mermasPeriodo) {
    const motivoNorm = (m.motivo ?? "").toLowerCase();
    const esCancelacionPostPrep = motivoNorm.includes("cancelacion_post_preparacion");
    const esRoboSospechado = motivoNorm.includes("robo sospechado");

    if (m.revision_pendiente || esCancelacionPostPrep || esRoboSospechado) {
      const cantAbs = Math.abs(parseFloat(m.cantidad));
      const costoUnit = parseFloat(m.costo_unitario);
      const subtotal = cantAbs * costoUnit;

      montoEstimadoMermas += subtotal;
      detallesMermas.push({
        movimientoId: m.id,
        ingrediente: m.ingrediente_nombre,
        cantidad: cantAbs,
        costoUnitario: costoUnit,
        subtotal,
        motivo: m.motivo ?? "Sin motivo especificado",
        creadoEn: m.creado_en,
      });
    }
  }

  const logsBloqueados = await db
    .select({
      id: logAuditoria.id,
      accion: logAuditoria.accion,
    })
    .from(logAuditoria)
    .where(
      and(
        eq(logAuditoria.restaurante_id, restauranteId),
        gte(logAuditoria.creado_en, desde),
        lte(logAuditoria.creado_en, hasta),
        sql`(${logAuditoria.accion} LIKE 'INTENTO_NO_AUTORIZADO_%' OR ${logAuditoria.accion} LIKE 'ANOMALIA_%')`
      )
    );

  const intentosBloqueados = logsBloqueados.length;
  const mapaAcciones: Record<string, number> = {};
  for (const log of logsBloqueados) {
    mapaAcciones[log.accion] = (mapaAcciones[log.accion] ?? 0) + 1;
  }
  const desgloseAccionesBloqueadas = Object.entries(mapaAcciones).map(([accion, conteo]) => ({
    accion,
    conteo,
  }));

  const mermasRoboSospechado = mermasPeriodo.filter((m) =>
    (m.motivo ?? "").toLowerCase().includes("robo sospechado")
  );
  const alertasRoboSospechadoTotal = mermasRoboSospechado.length;

  const logsConfirmaciones = await db
    .select({
      id: logAuditoria.id,
      accion: logAuditoria.accion,
      tabla_afectada: logAuditoria.tabla_afectada,
      registro_id: logAuditoria.registro_id,
      valores_nuevos: logAuditoria.valores_nuevos,
    })
    .from(logAuditoria)
    .where(
      and(
        eq(logAuditoria.restaurante_id, restauranteId),
        gte(logAuditoria.creado_en, desde),
        lte(logAuditoria.creado_en, hasta),
        eq(logAuditoria.accion, "CONFIRMACION_RESULTADO_INCIDENCIA")
      )
    );

  let roboConfirmadoMonto = 0;
  let roboConfirmadoEventos = 0;
  let errorHumanoMonto = 0;
  let errorHumanoEventos = 0;

  const mermasInvestigadasSet = new Set<string>();

  for (const log of logsConfirmaciones) {
    const vals = (log.valores_nuevos as any) ?? {};
    const resultado = vals.resultado;
    const monto = typeof vals.monto === "number" ? vals.monto : parseFloat(vals.monto ?? "0");

    if (log.tabla_afectada === "movimientos_inventario" && log.registro_id) {
      mermasInvestigadasSet.add(log.registro_id);
    }

    if (resultado === "robo_real") {
      roboConfirmadoMonto += monto;
      roboConfirmadoEventos += 1;
    } else if (resultado === "error_humano") {
      errorHumanoMonto += monto;
      errorHumanoEventos += 1;
    }
  }

  for (const m of mermasRoboSospechado) {
    if (!m.revision_pendiente) {
      mermasInvestigadasSet.add(m.id);
    }
  }

  const alertasRoboInvestigadas = mermasInvestigadasSet.size;
  const montoTotalDetectado = Number((montoFaltantesCaja + montoEstimadoMermas).toFixed(2));

  return {
    periodo: {
      desde,
      hasta,
      mesNombre: rango.mesNombre,
      anio: rango.anio,
    },
    restaurante: {
      id: rest.id,
      nombre: rest.nombre,
      creadoEn,
      diasActivo,
    },
    elegibleParaMostrar,
    montoTotalDetectado,
    desglose: {
      discrepanciasCaja: {
        montoFaltantes: Number(montoFaltantesCaja.toFixed(2)),
        turnosConFaltante,
        totalTurnosAuditados: turnosPeriodo.length,
        detalles: detallesTurnos,
      },
      mermasRevision: {
        montoEstimado: Number(montoEstimadoMermas.toFixed(2)),
        cantidadEventos: detallesMermas.length,
        detalles: detallesMermas,
      },
    },
    seguridadYAuditoria: {
      intentosBloqueados,
      alertasRoboSospechadoTotal,
      alertasRoboInvestigadas,
      desgloseAccionesBloqueadas,
    },
    confirmacionesDueno: {
      roboConfirmadoMonto: Number(roboConfirmadoMonto.toFixed(2)),
      roboConfirmadoEventos,
      errorHumanoMonto: Number(errorHumanoMonto.toFixed(2)),
      errorHumanoEventos,
    },
  };
}
