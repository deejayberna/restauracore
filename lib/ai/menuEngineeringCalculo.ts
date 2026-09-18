/**
 * Fase 5.4 — Matriz clásica de menu engineering (Kasavana-Smith).
 *
 * Igual que en la detección de anomalías, la clasificación es determinista y
 * vive en un archivo sin base de datos ni IA para poder probarse sola. Esta es
 * lógica de dinero: un platillo mal clasificado lleva a subir o bajar precios
 * equivocados.
 */

export type Cuadrante =
  | "estrella"
  | "caballo_de_batalla"
  | "rompecabezas"
  | "perro"
  | "sin_datos";

export type MotivoSinDatos = "sin_ventas" | "sin_receta";

export interface EntradaPlatillo {
  platillo_id: string;
  nombre: string;
  /** Precio de catálogo actual — solo informativo, no se usa para clasificar. */
  precio_catalogo: number;
  /** Σ (cantidad_requerida × costo_unitario) de la receta. */
  costo_receta: number;
  /** Si el platillo tiene receta registrada. Sin receta no hay food cost real. */
  tiene_receta: boolean;
  unidades_vendidas: number;
  /** Σ (precio_unitario_congelado × cantidad) de ventas reales de la ventana. */
  ingreso_real: number;
}

export interface PlatilloAnalizado extends EntradaPlatillo {
  /** Ingreso real / unidades: lo que de verdad se cobró, no el precio de catálogo. */
  precio_promedio_real: number;
  /** costo_receta / precio_promedio_real × 100. Null si no hay receta o no hubo venta. */
  food_cost_pct: number | null;
  margen_contribucion: number;
  participacion: number;
  popular: boolean;
  rentable: boolean;
  cuadrante: Cuadrante;
  motivo_sin_datos: MotivoSinDatos | null;
}

export interface Umbrales {
  /** Participación mínima para considerar un platillo popular. */
  participacion_minima: number;
  /** Margen de contribución promedio ponderado por unidades vendidas. */
  margen_minimo: number;
  factor_popularidad: number;
  platillos_clasificados: number;
  unidades_totales: number;
}

export interface ResultadoMenuEngineering {
  platillos: PlatilloAnalizado[];
  umbrales: Umbrales;
}

/**
 * En la matriz clásica un platillo es "popular" si vende al menos el 70% de lo
 * que vendería si la demanda se repartiera en partes iguales entre los platillos
 * del menú.
 */
export const FACTOR_POPULARIDAD = 0.7;

export const SUGERENCIA_BASE: Record<Cuadrante, string> = {
  estrella:
    "Alta venta y buen margen. No le muevas el precio a la ligera: mantén la calidad y la porción " +
    "constantes, dale el lugar más visible del menú y entrena al equipo para recomendarlo primero. " +
    "Aprovecha para hacer upsell ofreciéndolo en maridaje con bebidas o entradas de alto margen.",
  caballo_de_batalla:
    "Vende mucho pero deja poco. Trabaja el costo antes que el precio: revisa porciones, mermas y " +
    "proveedor del ingrediente más caro. Para mejorar rentabilidad, haz venta cruzada combinándolo con " +
    "un complemento o postre rentable, o sube el precio en incrementos pequeños.",
  rompecabezas:
    "Deja buen margen pero casi no se vende. Antes de retirarlo, dale una oportunidad real: mejor " +
    "descripción y foto, mejor ubicación en el menú y venta sugestiva activa del mesero al ordenar.",
  perro:
    "Poca venta y poco margen. Ocupa espacio en el menú, inventario y atención del equipo. " +
    "Rediséñalo con otro costo objetivo o retíralo y reasigna esos insumos a los platillos estrella.",
  sin_datos:
    "Sin datos suficientes para clasificarlo: le falta receta registrada o no tuvo ventas en la " +
    "ventana analizada. Completa su receta y vuelve a revisar el reporte tras un periodo con ventas.",
};

/**
 * Clasifica cada platillo en su cuadrante.
 *
 * Los umbrales se calculan SOLO con los platillos que tienen venta y receta: un
 * platillo sin receta tendría costo 0 y margen igual a su precio completo, y al
 * entrar al promedio inflaría el umbral de rentabilidad y empujaría platillos
 * sanos al cuadrante "perro".
 */
export function analizarMenu(
  entradas: EntradaPlatillo[],
  { factorPopularidad = FACTOR_POPULARIDAD }: { factorPopularidad?: number } = {}
): ResultadoMenuEngineering {
  const clasificables = entradas.filter((e) => e.unidades_vendidas > 0 && e.tiene_receta);

  const unidadesTotales = clasificables.reduce((sum, e) => sum + e.unidades_vendidas, 0);

  const participacionMinima =
    clasificables.length > 0 ? (1 / clasificables.length) * factorPopularidad : 0;

  const margenPonderado = (entrada: EntradaPlatillo) =>
    entrada.ingreso_real / entrada.unidades_vendidas - entrada.costo_receta;

  const margenMinimo =
    unidadesTotales > 0
      ? clasificables.reduce((sum, e) => sum + margenPonderado(e) * e.unidades_vendidas, 0) /
        unidadesTotales
      : 0;

  const platillos: PlatilloAnalizado[] = entradas.map((entrada) => {
    const precioPromedioReal =
      entrada.unidades_vendidas > 0
        ? entrada.ingreso_real / entrada.unidades_vendidas
        : entrada.precio_catalogo;

    const margen = precioPromedioReal - (entrada.tiene_receta ? entrada.costo_receta : 0);

    const foodCostPct =
      entrada.tiene_receta && precioPromedioReal > 0
        ? (entrada.costo_receta / precioPromedioReal) * 100
        : null;

    const esClasificable = entrada.unidades_vendidas > 0 && entrada.tiene_receta;

    const participacion =
      esClasificable && unidadesTotales > 0 ? entrada.unidades_vendidas / unidadesTotales : 0;

    if (!esClasificable) {
      return {
        ...entrada,
        precio_promedio_real: precioPromedioReal,
        food_cost_pct: foodCostPct,
        margen_contribucion: margen,
        participacion,
        popular: false,
        rentable: false,
        cuadrante: "sin_datos" as Cuadrante,
        motivo_sin_datos: entrada.unidades_vendidas === 0 ? "sin_ventas" : "sin_receta",
      };
    }

    const popular = participacion >= participacionMinima;
    const rentable = margen >= margenMinimo;

    return {
      ...entrada,
      precio_promedio_real: precioPromedioReal,
      food_cost_pct: foodCostPct,
      margen_contribucion: margen,
      participacion,
      popular,
      rentable,
      cuadrante: cuadranteDe(popular, rentable),
      motivo_sin_datos: null,
    };
  });

  return {
    platillos,
    umbrales: {
      participacion_minima: participacionMinima,
      margen_minimo: margenMinimo,
      factor_popularidad: factorPopularidad,
      platillos_clasificados: clasificables.length,
      unidades_totales: unidadesTotales,
    },
  };
}

function cuadranteDe(popular: boolean, rentable: boolean): Cuadrante {
  if (popular && rentable) return "estrella";
  if (popular && !rentable) return "caballo_de_batalla";
  if (!popular && rentable) return "rompecabezas";
  return "perro";
}

export const ETIQUETA_CUADRANTE: Record<Cuadrante, string> = {
  estrella: "⭐ Estrella",
  caballo_de_batalla: "🐴 Caballo de batalla",
  rompecabezas: "🧩 Rompecabezas",
  perro: "🐕 Perro",
  sin_datos: "❔ Sin datos",
};

export const DESCRIPCION_CUADRANTE: Record<Cuadrante, string> = {
  estrella: "Alta popularidad + alto margen",
  caballo_de_batalla: "Alta popularidad + bajo margen",
  rompecabezas: "Baja popularidad + alto margen",
  perro: "Baja popularidad + bajo margen",
  sin_datos: "Sin receta o sin ventas en la ventana",
};

export const ORDEN_CUADRANTES: Cuadrante[] = [
  "estrella",
  "caballo_de_batalla",
  "rompecabezas",
  "perro",
  "sin_datos",
];
