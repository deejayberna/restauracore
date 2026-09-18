/**
 * Fase 5.4 — Menu engineering: food cost % real, frecuencia de venta,
 * clasificación en cuadrantes y sugerencias de qué hacer con cada categoría.
 *
 * El food cost % se calcula contra el precio REALMENTE cobrado
 * (precio_unitario_congelado de las ventas), no contra el precio de catálogo:
 * si hubo promociones o cambios de precio, el catálogo miente sobre la
 * rentabilidad histórica.
 */

import { db } from "@/db";
import { ingredientes, ordenes, ordenItems, platillos, recetas } from "@/db/schema";
import { and, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import {
  analizarMenu,
  ORDEN_CUADRANTES,
  SUGERENCIA_BASE,
  type Cuadrante,
  type EntradaPlatillo,
  type PlatilloAnalizado,
  type Umbrales,
} from "./menuEngineeringCalculo";
import { pedirExplicaciones } from "./explicaciones";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface OpcionesReporte {
  /** Días de historial de ventas a considerar. */
  dias?: number;
  fin?: Date;
  /** Si false, se omite la llamada a la IA y se usan las sugerencias base. */
  usarIA?: boolean;
}

export interface ReporteMenuEngineering {
  platillos: PlatilloAnalizado[];
  umbrales: Umbrales;
  sugerencias: Record<Cuadrante, string>;
  ventana: { inicio: Date; fin: Date; dias: number };
}

export async function generarReporteMenuEngineering(
  restaurante_id: string,
  opciones: OpcionesReporte = {}
): Promise<ReporteMenuEngineering> {
  const dias = opciones.dias ?? 90;
  const fin = opciones.fin ?? new Date();
  const inicio = new Date(fin.getTime() - dias * MS_POR_DIA);

  const platillosRestaurante = await db
    .select({
      id: platillos.id,
      nombre: platillos.nombre,
      precio: platillos.precio,
    })
    .from(platillos)
    .where(eq(platillos.restaurante_id, restaurante_id));

  if (platillosRestaurante.length === 0) {
    return {
      platillos: [],
      umbrales: {
        participacion_minima: 0,
        margen_minimo: 0,
        factor_popularidad: 0,
        platillos_clasificados: 0,
        unidades_totales: 0,
      },
      sugerencias: { ...SUGERENCIA_BASE },
      ventana: { inicio, fin, dias },
    };
  }

  const idsPlatillos = platillosRestaurante.map((p) => p.id);

  // Costo de receta por platillo: Σ (cantidad_requerida × costo_unitario)
  const costos = await db
    .select({
      platillo_id: recetas.platillo_id,
      costo: sql<string>`SUM(${recetas.cantidad_requerida} * ${ingredientes.costo_unitario})`,
      ingredientes_en_receta: sql<number>`COUNT(*)::int`,
    })
    .from(recetas)
    .innerJoin(ingredientes, eq(ingredientes.id, recetas.ingrediente_id))
    .where(inArray(recetas.platillo_id, idsPlatillos))
    .groupBy(recetas.platillo_id);

  // Ventas reales de la ventana (criterio híbrido: cuentas pagadas o consumo entregado en cuentas abiertas)
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

  const costoPorPlatillo = new Map(costos.map((c) => [c.platillo_id, c]));
  const ventaPorPlatillo = new Map(ventas.map((v) => [v.platillo_id, v]));

  const entradas: EntradaPlatillo[] = platillosRestaurante.map((p) => {
    const costo = costoPorPlatillo.get(p.id);
    const venta = ventaPorPlatillo.get(p.id);

    return {
      platillo_id: p.id,
      nombre: p.nombre,
      precio_catalogo: Number(p.precio),
      costo_receta: costo ? Number(costo.costo) : 0,
      tiene_receta: (costo?.ingredientes_en_receta ?? 0) > 0,
      unidades_vendidas: venta ? Number(venta.unidades) : 0,
      ingreso_real: venta ? Number(venta.ingreso) : 0,
    };
  });

  const { platillos: analizados, umbrales } = analizarMenu(entradas);

  // Más rentables primero, y dentro de eso los que más venden
  analizados.sort(
    (a, b) =>
      ORDEN_CUADRANTES.indexOf(a.cuadrante) - ORDEN_CUADRANTES.indexOf(b.cuadrante) ||
      b.unidades_vendidas - a.unidades_vendidas
  );

  const sugerencias =
    opciones.usarIA === false
      ? { ...SUGERENCIA_BASE }
      : await generarSugerencias(analizados, umbrales, dias);

  return { platillos: analizados, umbrales, sugerencias, ventana: { inicio, fin, dias } };
}

/**
 * Pide a la IA una sugerencia por cuadrante, aterrizada a los platillos reales
 * de ese cuadrante. Si la IA no está disponible o responde con un formato
 * inesperado, cada cuadrante conserva su sugerencia base — el reporte nunca se
 * queda sin recomendaciones.
 */
async function generarSugerencias(
  analizados: PlatilloAnalizado[],
  umbrales: Umbrales,
  dias: number
): Promise<Record<Cuadrante, string>> {
  const porCuadrante = ORDEN_CUADRANTES.map((cuadrante) => ({
    cuadrante,
    platillos: analizados
      .filter((p) => p.cuadrante === cuadrante)
      .map((p) => ({
        nombre: p.nombre,
        unidades_vendidas: p.unidades_vendidas,
        food_cost_pct: p.food_cost_pct !== null ? Number(p.food_cost_pct.toFixed(1)) : null,
        margen_contribucion: Number(p.margen_contribucion.toFixed(2)),
      })),
  })).filter((g) => g.platillos.length > 0);

  if (porCuadrante.length === 0) return { ...SUGERENCIA_BASE };

  const sistema =
    "Eres consultor de rentabilidad de restaurantes y dominas la matriz de menu engineering " +
    "(Estrella, Caballo de batalla, Rompecabezas, Perro). Escribes en español, para el dueño de " +
    "un restaurante, en tono directo y accionable.\n\n" +
    "Reglas estrictas:\n" +
    "- Una explicación por cuadrante, usando como 'clave' el nombre del cuadrante que se te da.\n" +
    "- Menciona por nombre los platillos concretos de ese cuadrante.\n" +
    "- Di qué hacer: promocionar, ajustar precio, rediseñar o retirar, según el cuadrante.\n" +
    "- Incluye recomendaciones de venta sugerida (upsell) o combos para potenciar el ticket promedio.\n" +
    "- No inventes cifras ni platillos: usa solo los datos que se te dan.\n" +
    "- Máximo 4 oraciones por cuadrante.";

  const prompt =
    `Análisis de menu engineering de los últimos ${dias} días.\n\n` +
    `Umbrales usados: participación mínima para ser "popular" ${(umbrales.participacion_minima * 100).toFixed(1)}%, ` +
    `margen de contribución promedio ponderado $${umbrales.margen_minimo.toFixed(2)}.\n\n` +
    `Platillos por cuadrante:\n\n${JSON.stringify(porCuadrante, null, 2)}\n\n` +
    `Redacta una sugerencia por cada cuadrante presente.`;

  const textosIA = await pedirExplicaciones(sistema, prompt);

  const sugerencias = { ...SUGERENCIA_BASE };
  for (const cuadrante of ORDEN_CUADRANTES) {
    const texto = textosIA.get(cuadrante);
    if (texto) sugerencias[cuadrante] = texto;
  }
  return sugerencias;
}
