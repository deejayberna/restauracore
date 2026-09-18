/**
 * Núcleo estadístico de la detección de anomalías (Fase 5.3).
 *
 * Este archivo NO importa la base de datos ni la API de IA a propósito: la
 * matemática que decide si algo es "inusual" debe poder probarse sola, sin red
 * ni credenciales. La detección es determinista — la IA solo redacta después.
 */

export const DIAS_POR_PERIODO = 7;

/** Un hecho suelto: cuánto, de quién/de qué, y cuándo. */
export interface EventoSerie {
  sujeto_id: string;
  cantidad: number;
  fecha: Date;
}

/**
 * Serie de un sujeto (un ingrediente o un usuario) partida en periodos
 * semanales: el periodo reciente contra su propio historial.
 */
export interface SerieSujeto {
  sujeto_id: string;
  valor_reciente: number;
  /** Totales de los periodos anteriores, del más reciente al más antiguo. */
  periodos_historicos: number[];
}

export interface Anomalia {
  sujeto_id: string;
  valor_reciente: number;
  promedio_historico: number;
  desviacion_estandar: number;
  z_score: number;
}

export interface OpcionesSeries {
  /** Fin de la ventana de análisis (normalmente "ahora"). */
  fin: Date;
  /** Cuántos periodos semanales considerar, incluyendo el reciente. */
  periodos: number;
}

export interface OpcionesDeteccion {
  /** Cuántas desviaciones estándar sobre su propio promedio disparan la alerta. */
  umbralZ?: number;
  /** Mínimo de periodos históricos con datos para que la comparación signifique algo. */
  minPeriodosHistoricos?: number;
  /** Piso absoluto: por debajo de este valor no se alerta aunque el z-score sea alto. */
  minValorReciente?: number;
}

export function promedio(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/**
 * Desviación estándar muestral (denominador n-1). Se usa la muestral y no la
 * poblacional porque los periodos observados son una muestra del comportamiento
 * del sujeto, no su universo completo.
 */
export function desviacionEstandarMuestral(valores: number[]): number {
  if (valores.length < 2) return 0;
  const media = promedio(valores);
  const sumaCuadrados = valores.reduce((acc, v) => acc + (v - media) ** 2, 0);
  return Math.sqrt(sumaCuadrados / (valores.length - 1));
}

/**
 * Agrupa eventos en periodos de 7 días contados hacia atrás desde `fin`.
 * El índice 0 es el periodo más reciente (los últimos 7 días).
 * Los periodos sin eventos quedan en 0 — un sujeto que dejó de tener mermas
 * también forma parte de su propio historial.
 */
export function construirSeries(
  eventos: EventoSerie[],
  { fin, periodos }: OpcionesSeries
): SerieSujeto[] {
  if (periodos < 2) throw new Error("Se necesitan al menos 2 periodos para comparar");

  const msPorPeriodo = DIAS_POR_PERIODO * 24 * 60 * 60 * 1000;
  const totales = new Map<string, number[]>();

  for (const evento of eventos) {
    const transcurrido = fin.getTime() - evento.fecha.getTime();
    // Eventos futuros (transcurrido < 0) o fuera de la ventana se ignoran
    if (transcurrido < 0) continue;
    const indice = Math.floor(transcurrido / msPorPeriodo);
    if (indice >= periodos) continue;

    let serie = totales.get(evento.sujeto_id);
    if (!serie) {
      serie = new Array<number>(periodos).fill(0);
      totales.set(evento.sujeto_id, serie);
    }
    serie[indice] += evento.cantidad;
  }

  return Array.from(totales, ([sujeto_id, serie]) => ({
    sujeto_id,
    valor_reciente: serie[0],
    periodos_historicos: serie.slice(1),
  }));
}

/**
 * Marca los sujetos cuyo periodo reciente se sale de su propio comportamiento
 * histórico por más de `umbralZ` desviaciones estándar.
 *
 * Solo se señalan desviaciones HACIA ARRIBA: que un mesero cancele menos de lo
 * normal no es un hallazgo. Las series con desviación estándar 0 se descartan
 * (historial plano o un solo dato: el z-score sería infinito y la alerta, ruido).
 */
export function detectarAnomalias(
  series: SerieSujeto[],
  {
    umbralZ = 2,
    minPeriodosHistoricos = 4,
    minValorReciente = 0,
  }: OpcionesDeteccion = {}
): Anomalia[] {
  const anomalias: Anomalia[] = [];

  for (const serie of series) {
    if (serie.periodos_historicos.length < minPeriodosHistoricos) continue;
    if (serie.valor_reciente <= minValorReciente) continue;

    const media = promedio(serie.periodos_historicos);
    const desviacion = desviacionEstandarMuestral(serie.periodos_historicos);
    if (desviacion <= 0) continue;

    const z = (serie.valor_reciente - media) / desviacion;
    if (z <= umbralZ) continue;

    anomalias.push({
      sujeto_id: serie.sujeto_id,
      valor_reciente: serie.valor_reciente,
      promedio_historico: media,
      desviacion_estandar: desviacion,
      z_score: z,
    });
  }

  // Lo más desviado primero — es lo que el dueño debería mirar antes
  return anomalias.sort((a, b) => b.z_score - a.z_score);
}
