/**
 * Fase 6.1 — Reporte de Rentabilidad y Food Cost Real por Platillo.
 *
 * Calcula el food cost % real de cada platillo:
 * Σ(costo_unitario × cantidad_requerida) / precio_promedio_congelado_real
 * ordenado de MENOR a MAYOR rentabilidad.
 */

import { db } from "@/db";
import { categoriasMenu, ingredientes, ordenes, ordenItems, platillos, recetas } from "@/db/schema";
import { and, eq, gte, inArray, ne, or, sql } from "drizzle-orm";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type NivelRentabilidad =
  | "critico"
  | "alerta"
  | "saludable"
  | "excelente"
  | "sin_datos";

export interface EntradaPlatilloRentabilidad {
  platillo_id: string;
  nombre: string;
  categoria_nombre: string | null;
  precio_catalogo: number;
  costo_receta: number;
  tiene_receta: boolean;
  unidades_vendidas: number;
  ingreso_real: number;
}

export interface PlatilloRentabilidad extends EntradaPlatilloRentabilidad {
  precio_promedio_real: number;
  food_cost_pct: number | null;
  margen_unitario: number;
  margen_pct: number | null;
  margen_total: number;
  nivel: NivelRentabilidad;
  diagnostico: string;
}

export interface MetricasGlobalesRentabilidad {
  ingreso_total: number;
  costo_total_alimentos: number;
  margen_bruto_total: number;
  food_cost_global_pct: number | null;
  total_unidades: number;
  platillos_analizados: number;
  platillos_con_receta: number;
}

export interface ReporteRentabilidad {
  platillos: PlatilloRentabilidad[];
  metricas: MetricasGlobalesRentabilidad;
  ventana: {
    inicio: Date;
    fin: Date;
    dias: number;
  };
}

export interface OpcionesRentabilidad {
  dias?: number;
  fin?: Date;
  orden?: "menor_a_mayor" | "mayor_a_menor";
}

/**
 * Función pura para procesar la lista de platillos y calcular su rentabilidad y diagnóstico.
 * Permite pruebas unitarias directas sin depender de la base de datos.
 */
export function procesarRentabilidad(
  entradas: EntradaPlatilloRentabilidad[],
  orden: "menor_a_mayor" | "mayor_a_menor" = "menor_a_mayor"
): { platillos: PlatilloRentabilidad[]; metricas: MetricasGlobalesRentabilidad } {
  let ingresoTotal = 0;
  let costoTotalAlimentos = 0;
  let totalUnidades = 0;
  let conReceta = 0;

  const resultado: PlatilloRentabilidad[] = entradas.map((e) => {
    const unidades = e.unidades_vendidas;
    const precioPromedioReal = unidades > 0 ? e.ingreso_real / unidades : e.precio_catalogo;
    const costoReceta = e.tiene_receta ? e.costo_receta : 0;
    const margenUnitario = precioPromedioReal - costoReceta;
    const margenTotal = margenUnitario * unidades;

    const foodCostPct =
      e.tiene_receta && precioPromedioReal > 0 ? (costoReceta / precioPromedioReal) * 100 : null;

    const margenPct =
      precioPromedioReal > 0 ? (margenUnitario / precioPromedioReal) * 100 : null;

    if (e.tiene_receta) conReceta++;
    ingresoTotal += e.ingreso_real;
    totalUnidades += unidades;
    if (e.tiene_receta) {
      costoTotalAlimentos += costoReceta * unidades;
    }

    let nivel: NivelRentabilidad = "sin_datos";
    let diagnostico = "";

    if (!e.tiene_receta) {
      nivel = "sin_datos";
      diagnostico = "Falta registrar receta e insumos.";
    } else if (unidades === 0) {
      nivel = "sin_datos";
      diagnostico = "Sin ventas en el periodo analizado.";
    } else if (foodCostPct !== null) {
      if (foodCostPct > 38) {
        nivel = "critico";
        diagnostico = "Costo excesivo (>38%). Revisa porciones o sube precio urgente.";
      } else if (foodCostPct > 32) {
        nivel = "alerta";
        diagnostico = "Margen ajustado (32-38%). Conviene negociar insumos con proveedores.";
      } else if (foodCostPct >= 22) {
        nivel = "saludable";
        diagnostico = "Rentabilidad saludable (22-32%). En rango estándar de la industria.";
      } else {
        nivel = "excelente";
        diagnostico = "Alta rentabilidad (<22%). Excelente margen de contribución.";
      }
    }

    return {
      ...e,
      precio_promedio_real: precioPromedioReal,
      food_cost_pct: foodCostPct,
      margen_unitario: margenUnitario,
      margen_pct: margenPct,
      margen_total: margenTotal,
      nivel,
      diagnostico,
    };
  });

  // Ordenar de MENOR a MAYOR rentabilidad (o inverso según solicitud)
  resultado.sort((a, b) => {
    // Platillos sin receta o sin ventas al final
    if (!a.tiene_receta && b.tiene_receta) return 1;
    if (a.tiene_receta && !b.tiene_receta) return -1;
    if (a.unidades_vendidas === 0 && b.unidades_vendidas > 0) return 1;
    if (a.unidades_vendidas > 0 && b.unidades_vendidas === 0) return -1;

    // Comparar por margen de contribución unitario
    const factor = orden === "menor_a_mayor" ? 1 : -1;
    return (a.margen_unitario - b.margen_unitario) * factor;
  });

  const margenBrutoTotal = ingresoTotal - costoTotalAlimentos;
  const foodCostGlobalPct =
    ingresoTotal > 0 ? (costoTotalAlimentos / ingresoTotal) * 100 : null;

  return {
    platillos: resultado,
    metricas: {
      ingreso_total: ingresoTotal,
      costo_total_alimentos: costoTotalAlimentos,
      margen_bruto_total: margenBrutoTotal,
      food_cost_global_pct: foodCostGlobalPct,
      total_unidades: totalUnidades,
      platillos_analizados: entradas.length,
      platillos_con_receta: conReceta,
    },
  };
}

/**
 * Consulta la base de datos con Drizzle y calcula el reporte de rentabilidad para el restaurante activo.
 */
export async function obtenerReporteRentabilidad(
  restaurante_id: string,
  opciones: OpcionesRentabilidad = {}
): Promise<ReporteRentabilidad> {
  const dias = opciones.dias ?? 90;
  const fin = opciones.fin ?? new Date();
  const inicio = new Date(fin.getTime() - dias * MS_POR_DIA);
  const orden = opciones.orden ?? "menor_a_mayor";

  // 1. Platillos con su categoría
  const platillosRest = await db
    .select({
      id: platillos.id,
      nombre: platillos.nombre,
      precio: platillos.precio,
      categoria_nombre: categoriasMenu.nombre,
    })
    .from(platillos)
    .leftJoin(categoriasMenu, eq(categoriasMenu.id, platillos.categoria_id))
    .where(eq(platillos.restaurante_id, restaurante_id));

  if (platillosRest.length === 0) {
    return {
      platillos: [],
      metricas: {
        ingreso_total: 0,
        costo_total_alimentos: 0,
        margen_bruto_total: 0,
        food_cost_global_pct: null,
        total_unidades: 0,
        platillos_analizados: 0,
        platillos_con_receta: 0,
      },
      ventana: { inicio, fin, dias },
    };
  }

  const idsPlatillos = platillosRest.map((p) => p.id);

  // 2. Costo de receta: Σ(cantidad_requerida × costo_unitario)
  const costos = await db
    .select({
      platillo_id: recetas.platillo_id,
      costo: sql<string>`SUM(${recetas.cantidad_requerida} * ${ingredientes.costo_unitario})`,
      ingredientes_count: sql<number>`COUNT(*)::int`,
    })
    .from(recetas)
    .innerJoin(ingredientes, eq(ingredientes.id, recetas.ingrediente_id))
    .where(inArray(recetas.platillo_id, idsPlatillos))
    .groupBy(recetas.platillo_id);

  // 3. Ventas reales (criterio híbrido: cuentas pagadas o consumo entregado en cuentas abiertas)
  const ventas = await db
    .select({
      platillo_id: ordenItems.platillo_id,
      unidades: sql<string>`SUM(${ordenItems.cantidad})`,
      ingreso: sql<string>`SUM(${ordenItems.precio_unitario_congelado} * ${ordenItems.cantidad})`,
    })
    .from(ordenItems)
    .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
    .where(
      and(
        eq(ordenes.restaurante_id, restaurante_id),
        ne(ordenItems.estado, "cancelado"),
        or(
          eq(ordenes.estado, "pagado"),
          and(
            inArray(ordenes.estado, ["abierta", "cuenta_solicitada"]),
            eq(ordenItems.estado, "entregado")
          )
        ),
        gte(ordenes.creado_en, inicio)
      )
    )
    .groupBy(ordenItems.platillo_id);

  const costoMap = new Map(costos.map((c) => [c.platillo_id, c]));
  const ventaMap = new Map(ventas.map((v) => [v.platillo_id, v]));

  const entradas: EntradaPlatilloRentabilidad[] = platillosRest.map((p) => {
    const c = costoMap.get(p.id);
    const v = ventaMap.get(p.id);

    return {
      platillo_id: p.id,
      nombre: p.nombre,
      categoria_nombre: p.categoria_nombre,
      precio_catalogo: Number(p.precio),
      costo_receta: c ? Number(c.costo) : 0,
      tiene_receta: (c?.ingredientes_count ?? 0) > 0,
      unidades_vendidas: v ? Number(v.unidades) : 0,
      ingreso_real: v ? Number(v.ingreso) : 0,
    };
  });

  const { platillos: analizados, metricas } = procesarRentabilidad(entradas, orden);

  return {
    platillos: analizados,
    metricas,
    ventana: { inicio, fin, dias },
  };
}

