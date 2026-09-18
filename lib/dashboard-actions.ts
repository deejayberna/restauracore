/**
 * Fase 7 — Dashboard del Dueño (Multi-Sucursal).
 *
 * Consultas agregadas y métricas ejecutivas para usuarios con rol 'dueno'.
 * 1. Control de acceso: requiere rol 'dueno' en usuario_restaurantes.
 * 2. Segregación estricta: cada sucursal muestra sus métricas de forma aislada.
 * 3. Consolidación explícita: si administra múltiples sucursales, el consolidado
 *    se etiqueta inequívocamente como "Total consolidado de N restaurantes".
 */

import { db } from "@/db";
import {
  alertasAnomalias,
  alertasInventario,
  ingredientes,
  ordenes,
  ordenItems,
  restaurantes,
  turnos,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { obtenerReporteRentabilidad } from "./rentabilidad";

export interface MetricasVentas {
  hoy: number;
  ordenes_hoy: number;
  semana: number;
  ordenes_semana: number;
  mes: number;
  ordenes_mes: number;
  serie_horas: { hora: string; ventas: number }[];
  serie_dias: { dia: string; ventas: number }[];
}

export interface MetricasSucursal {
  restaurante: {
    id: string;
    nombre: string;
    timezone: string;
    plan: string;
  };
  ventas: MetricasVentas;
  top_rentabilidad: {
    nombre: string;
    margen_pct: number | null;
    margen_total: number;
    precio: number;
  }[];
  top_volumen: {
    nombre: string;
    unidades: number;
    ingreso: number;
  }[];
  alertas_inventario: {
    id: string;
    ingrediente: string;
    nivel: "bajo" | "critico";
    creado_en: Date;
  }[];
  anomalias_activas: {
    id: string;
    tipo: string;
    explicacion: string;
    z_score: string;
    creado_en: Date;
  }[];
  ultimo_cierre_caja: {
    id: string;
    codigo: string;
    fecha_cierre: Date | null;
    hay_discrepancia: boolean;
    diferencia_total: number;
  } | null;
}

export interface ConsolidadoMultiSucursal {
  etiqueta: string;
  num_restaurantes: number;
  ventas_hoy: number;
  ventas_semana: number;
  ventas_mes: number;
  total_alertas_inventario: number;
  total_anomalias: number;
  comparativa: {
    restaurante_id: string;
    nombre: string;
    ventas_hoy: number;
    ventas_semana: number;
    ventas_mes: number;
  }[];
}

export interface ResultadoDashboardDueno {
  autorizado: boolean;
  restaurantes_disponibles: { id: string; nombre: string }[];
  sucursales: MetricasSucursal[];
  consolidado: ConsolidadoMultiSucursal | null;
}

/**
 * Consulta todos los restaurantes donde el usuario posee un vínculo activo con rol 'dueno'.
 */
export async function obtenerRestaurantesDueno(usuarioId: string) {
  return await db
    .select({
      id: restaurantes.id,
      nombre: restaurantes.nombre,
      timezone: restaurantes.timezone,
      plan: restaurantes.plan,
    })
    .from(usuarioRestaurantes)
    .innerJoin(restaurantes, eq(restaurantes.id, usuarioRestaurantes.restaurante_id))
    .where(
      and(
        eq(usuarioRestaurantes.usuario_id, usuarioId),
        eq(usuarioRestaurantes.rol, "dueno"),
        eq(usuarioRestaurantes.activo, true)
      )
    );
}

/**
 * Calcula las fechas locales de corte (inicio de día, 7 días, 30 días) para un timezone dado.
 */
export function calcularVentanasTiempo(fechaReferencia: Date = new Date(), timezone: string = "America/Mexico_City") {
  // Obtener fecha YYYY-MM-DD en el timezone local
  const formatoLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fechaReferencia);

  // Inicio del día local a las 00:00:00
  const [anio, mes, dia] = formatoLocal.split("-").map(Number);
  // Creamos la fecha base UTC estimada para la medianoche local
  const inicioHoy = new Date(Date.UTC(anio, mes - 1, dia, 6, 0, 0)); // Aproximado UTC para UTC-6

  const inicioSemana = new Date(fechaReferencia.getTime() - 7 * 24 * 60 * 60 * 1000);
  const inicioMes = new Date(fechaReferencia.getTime() - 30 * 24 * 60 * 60 * 1000);

  return { formatoLocal, inicioHoy, inicioSemana, inicioMes };
}

/**
 * Obtiene las métricas operativas y financieras aisladas de una sucursal específica.
 */
export async function obtenerMetricasRestaurante(
  restauranteId: string,
  timezone: string = "America/Mexico_City",
  fechaReferencia: Date = new Date()
): Promise<MetricasSucursal> {
  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restauranteId),
  });

  const tz = rest?.timezone ?? timezone;
  const { inicioHoy, inicioSemana, inicioMes } = calcularVentanasTiempo(fechaReferencia, tz);

  // 1.1 Órdenes pagadas en los últimos 30 días para calcular series y totales
  const ordenesValidas = await db
    .select({
      id: ordenes.id,
      total: ordenes.total,
      creado_en: ordenes.creado_en,
    })
    .from(ordenes)
    .where(
      and(
        eq(ordenes.restaurante_id, restauranteId),
        eq(ordenes.estado, "pagado"),
        gte(ordenes.creado_en, inicioMes)
      )
    );

  // 1.2 Criterio híbrido: Consumo devengado y entregado en mesas activas (cuentas abiertas o con cuenta solicitada)
  const itemsAbiertosEntregados = await db
    .select({
      id: ordenItems.id,
      monto: sql<string>`(${ordenItems.precio_unitario_congelado} * ${ordenItems.cantidad})`,
      creado_en: ordenes.creado_en,
    })
    .from(ordenItems)
    .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
    .where(
      and(
        eq(ordenes.restaurante_id, restauranteId),
        inArray(ordenes.estado, ["abierta", "cuenta_solicitada"]),
        eq(ordenItems.estado, "entregado"),
        gte(ordenes.creado_en, inicioMes)
      )
    );

  let ventasHoy = 0;
  let ordenesHoy = 0;
  let ventasSemana = 0;
  let ordenesSemana = 0;
  let ventasMes = 0;
  let ordenesMes = 0;

  // Series para Recharts:
  // Horas del día (00 a 23)
  const horasMap = new Map<string, number>();
  for (let h = 0; h < 24; h++) {
    horasMap.set(`${String(h).padStart(2, "0")}:00`, 0);
  }

  // Días de la semana (últimos 7 días)
  const diasMap = new Map<string, number>();
  for (let d = 6; d >= 0; d--) {
    const f = new Date(fechaReferencia.getTime() - d * 24 * 60 * 60 * 1000);
    const claveDia = f.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", timeZone: tz });
    diasMap.set(claveDia, 0);
  }

  // Sumar ventas de órdenes cobradas (pagadas)
  for (const ord of ordenesValidas) {
    const totalNum = parseFloat(ord.total);
    ventasMes += totalNum;
    ordenesMes++;

    if (ord.creado_en >= inicioSemana) {
      ventasSemana += totalNum;
      ordenesSemana++;

      const claveDia = ord.creado_en.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", timeZone: tz });
      if (diasMap.has(claveDia)) {
        diasMap.set(claveDia, (diasMap.get(claveDia) ?? 0) + totalNum);
      }
    }

    if (ord.creado_en >= inicioHoy) {
      ventasHoy += totalNum;
      ordenesHoy++;

      const horaLocal = ord.creado_en.toLocaleTimeString("es-MX", { hour: "2-digit", hour12: false, timeZone: tz });
      const claveHora = `${horaLocal}:00`;
      if (horasMap.has(claveHora)) {
        horasMap.set(claveHora, (horasMap.get(claveHora) ?? 0) + totalNum);
      }
    }
  }

  // Sumar consumo devengado entregado de mesas abiertas en curso (no incrementa ordenes_hoy/cobradas)
  for (const item of itemsAbiertosEntregados) {
    const montoNum = parseFloat(item.monto);
    ventasMes += montoNum;

    if (item.creado_en >= inicioSemana) {
      ventasSemana += montoNum;

      const claveDia = item.creado_en.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", timeZone: tz });
      if (diasMap.has(claveDia)) {
        diasMap.set(claveDia, (diasMap.get(claveDia) ?? 0) + montoNum);
      }
    }

    if (item.creado_en >= inicioHoy) {
      ventasHoy += montoNum;

      const horaLocal = item.creado_en.toLocaleTimeString("es-MX", { hour: "2-digit", hour12: false, timeZone: tz });
      const claveHora = `${horaLocal}:00`;
      if (horasMap.has(claveHora)) {
        horasMap.set(claveHora, (horasMap.get(claveHora) ?? 0) + montoNum);
      }
    }
  }

  const serie_horas = Array.from(horasMap.entries()).map(([hora, ventas]) => ({
    hora,
    ventas: Number(ventas.toFixed(2)),
  }));

  const serie_dias = Array.from(diasMap.entries()).map(([dia, ventas]) => ({
    dia,
    ventas: Number(ventas.toFixed(2)),
  }));

  // 2. Top Platillos por Rentabilidad y por Volumen (Fase 6.1)
  let topRentabilidad: MetricasSucursal["top_rentabilidad"] = [];
  let topVolumen: MetricasSucursal["top_volumen"] = [];

  try {
    const reporteRent = await obtenerReporteRentabilidad(restauranteId, { dias: 30 });
    // Top 5 por margen porcentual
    topRentabilidad = [...reporteRent.platillos]
      .filter((p) => p.margen_pct !== null)
      .sort((a, b) => (b.margen_pct ?? 0) - (a.margen_pct ?? 0))
      .slice(0, 5)
      .map((p) => ({
        nombre: p.nombre,
        margen_pct: p.margen_pct,
        margen_total: Number(p.margen_total.toFixed(2)),
        precio: p.precio_catalogo,
      }));

    // Top 5 por volumen de unidades vendidas
    topVolumen = [...reporteRent.platillos]
      .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
      .slice(0, 5)
      .map((p) => ({
        nombre: p.nombre,
        unidades: p.unidades_vendidas,
        ingreso: Number(p.ingreso_real.toFixed(2)),
      }));
  } catch (err) {
    console.warn(`[Dashboard] No se pudo calcular rentabilidad para ${restauranteId}:`, err);
  }

  // 3. Alertas de inventario activas (no atendidas)
  const alertasDb = await db
    .select({
      id: alertasInventario.id,
      ingrediente: ingredientes.nombre,
      nivel: alertasInventario.nivel,
      creado_en: alertasInventario.creado_en,
    })
    .from(alertasInventario)
    .innerJoin(ingredientes, eq(ingredientes.id, alertasInventario.ingrediente_id))
    .where(
      and(
        eq(alertasInventario.restaurante_id, restauranteId),
        eq(alertasInventario.atendida, false)
      )
    )
    .orderBy(desc(alertasInventario.creado_en))
    .limit(10);

  // 4. Anomalías activas no atendidas (Fase 5)
  const anomaliasDb = await db
    .select({
      id: alertasAnomalias.id,
      tipo: alertasAnomalias.tipo,
      explicacion: alertasAnomalias.explicacion,
      z_score: alertasAnomalias.z_score,
      creado_en: alertasAnomalias.creado_en,
    })
    .from(alertasAnomalias)
    .where(
      and(
        eq(alertasAnomalias.restaurante_id, restauranteId),
        eq(alertasAnomalias.atendida, false)
      )
    )
    .orderBy(desc(alertasAnomalias.creado_en))
    .limit(5);

  // 5. Último cierre de caja registrado (Fase 6.2)
  const ultimoTurnoCerrado = await db.query.turnos.findFirst({
    where: and(
      eq(turnos.restaurante_id, restauranteId),
      eq(turnos.estado, "cerrado")
    ),
    orderBy: desc(turnos.fecha_cierre),
  });

  let ultimoCierre: MetricasSucursal["ultimo_cierre_caja"] = null;
  if (ultimoTurnoCerrado) {
    const dif = ultimoTurnoCerrado.diferencias as any;
    ultimoCierre = {
      id: ultimoTurnoCerrado.id,
      codigo: ultimoTurnoCerrado.codigo,
      fecha_cierre: ultimoTurnoCerrado.fecha_cierre,
      hay_discrepancia: ultimoTurnoCerrado.hay_discrepancia,
      diferencia_total: dif?.total?.diferencia ?? (dif?.total ?? 0),
    };
  }

  return {
    restaurante: {
      id: rest?.id ?? restauranteId,
      nombre: rest?.nombre ?? "Restaurante",
      timezone: tz,
      plan: rest?.plan ?? "basico",
    },
    ventas: {
      hoy: Number(ventasHoy.toFixed(2)),
      ordenes_hoy: ordenesHoy,
      semana: Number(ventasSemana.toFixed(2)),
      ordenes_semana: ordenesSemana,
      mes: Number(ventasMes.toFixed(2)),
      ordenes_mes: ordenesMes,
      serie_horas,
      serie_dias,
    },
    top_rentabilidad: topRentabilidad,
    top_volumen: topVolumen,
    alertas_inventario: alertasDb,
    anomalias_activas: anomaliasDb,
    ultimo_cierre_caja: ultimoCierre,
  };
}

/**
 * Consulta y agrupa las métricas ejecutivas para el dueño autenticado.
 * Respeta la segregación estricta y añade la vista consolidada si administra > 1 restaurante.
 */
export async function obtenerMetricasMultiSucursal(
  usuarioId: string,
  restauranteFiltroId?: string
): Promise<ResultadoDashboardDueno> {
  const restaurantesDueno = await obtenerRestaurantesDueno(usuarioId);

  if (restaurantesDueno.length === 0) {
    return {
      autorizado: false,
      restaurantes_disponibles: [],
      sucursales: [],
      consolidado: null,
    };
  }

  const sucursalesFiltradas = restauranteFiltroId && restauranteFiltroId !== "todos"
    ? restaurantesDueno.filter((r) => r.id === restauranteFiltroId)
    : restaurantesDueno;

  const metricasSucursales: MetricasSucursal[] = [];
  for (const r of sucursalesFiltradas) {
    const metricas = await obtenerMetricasRestaurante(r.id, r.timezone);
    metricasSucursales.push(metricas);
  }

  // Generar total consolidado si el dueño tiene más de 1 restaurante
  let consolidado: ConsolidadoMultiSucursal | null = null;
  if (restaurantesDueno.length > 1) {
    let ventasHoyTotal = 0;
    let ventasSemanaTotal = 0;
    let ventasMesTotal = 0;
    let totalAlertas = 0;
    let totalAnomalias = 0;

    const comparativa = metricasSucursales.map((s) => {
      ventasHoyTotal += s.ventas.hoy;
      ventasSemanaTotal += s.ventas.semana;
      ventasMesTotal += s.ventas.mes;
      totalAlertas += s.alertas_inventario.length;
      totalAnomalias += s.anomalias_activas.length;

      return {
        restaurante_id: s.restaurante.id,
        nombre: s.restaurante.nombre,
        ventas_hoy: s.ventas.hoy,
        ventas_semana: s.ventas.semana,
        ventas_mes: s.ventas.mes,
      };
    });

    consolidado = {
      etiqueta: `Total consolidado de ${metricasSucursales.length} restaurante${metricasSucursales.length > 1 ? "s" : ""}`,
      num_restaurantes: metricasSucursales.length,
      ventas_hoy: Number(ventasHoyTotal.toFixed(2)),
      ventas_semana: Number(ventasSemanaTotal.toFixed(2)),
      ventas_mes: Number(ventasMesTotal.toFixed(2)),
      total_alertas_inventario: totalAlertas,
      total_anomalias: totalAnomalias,
      comparativa,
    };
  }

  return {
    autorizado: true,
    restaurantes_disponibles: restaurantesDueno.map((r) => ({ id: r.id, nombre: r.nombre })),
    sucursales: metricasSucursales,
    consolidado,
  };
}
