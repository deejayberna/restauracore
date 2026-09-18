/**
 * Fase 5.3 — Detección de anomalías.
 *
 * Revisa, por restaurante, los movimientos de inventario tipo 'merma' y las
 * cancelaciones registradas en log_auditoria, y señala los casos que se salen
 * de su PROPIO promedio histórico por más de 2 desviaciones estándar.
 *
 * Tres decisiones de diseño que importan:
 * 1. La detección es 100% determinista (ver ./estadisticas.ts). La IA solo
 *    redacta el texto explicativo, y su salida se valida con Zod.
 * 2. Las alertas se comparan contra el historial del propio sujeto, no contra el
 *    promedio del restaurante: un mesero con mucho volumen no se vuelve
 *    sospechoso solo por atender más mesas.
 * 3. El texto NUNCA acusa. Señala el dato y sugiere qué revisar — quien concluye
 *    es el dueño, no el sistema.
 */

import { db } from "@/db";
import {
  alertasAnomalias,
  ingredientes,
  logAuditoria,
  movimientosInventario,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, eq, gte, ilike } from "drizzle-orm";
import {
  construirSeries,
  detectarAnomalias,
  DIAS_POR_PERIODO,
  type Anomalia,
  type EventoSerie,
} from "./estadisticas";
import { pedirExplicaciones } from "./explicaciones";
import type { NuevaAlertaAnomalia } from "@/db/schema";

type TipoAnomalia = "merma_ingrediente" | "merma_usuario" | "cancelaciones_usuario";

export interface OpcionesAnalisis {
  /** Fin de la ventana de análisis. Inyectable para pruebas y reprocesos. */
  fin?: Date;
  /** Periodos semanales a considerar, incluyendo el reciente (13 ≈ 90 días). */
  periodos?: number;
  umbralZ?: number;
}

export interface ResultadoAnalisis {
  detectadas: number;
  insertadas: number;
  omitidas_por_duplicado: number;
}

interface Hallazgo {
  tipo: TipoAnomalia;
  sujeto_id: string;
  nombre: string;
  unidad: string | null;
  anomalia: Anomalia;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export async function detectarAnomaliasRestaurante(
  restaurante_id: string,
  opciones: OpcionesAnalisis = {}
): Promise<ResultadoAnalisis> {
  const fin = opciones.fin ?? new Date();
  const periodos = opciones.periodos ?? 13; // ~90 días
  const umbralZ = opciones.umbralZ ?? 2;
  const inicio = new Date(fin.getTime() - periodos * DIAS_POR_PERIODO * MS_POR_DIA);
  const periodoInicioReciente = new Date(fin.getTime() - DIAS_POR_PERIODO * MS_POR_DIA);

  // ─── 1. Datos crudos de la ventana ─────────────────────────────────────────
  // El filtro por restaurante va en el JOIN contra ingredientes: movimientos_inventario
  // no tiene restaurante_id propio, y traer los movimientos de todos los
  // restaurantes para filtrarlos en memoria rompería el aislamiento multi-tenant.
  const mermas = await db
    .select({
      ingrediente_id: movimientosInventario.ingrediente_id,
      usuario_id: movimientosInventario.creado_por,
      cantidad: movimientosInventario.cantidad,
      creado_en: movimientosInventario.creado_en,
    })
    .from(movimientosInventario)
    .innerJoin(ingredientes, eq(ingredientes.id, movimientosInventario.ingrediente_id))
    .where(
      and(
        eq(ingredientes.restaurante_id, restaurante_id),
        eq(movimientosInventario.tipo, "merma"),
        gte(movimientosInventario.creado_en, inicio)
      )
    );

  // Las cancelaciones viven en log_auditoria. Se buscan por patrón en `accion`
  // porque distintas partes del sistema las registran con verbos propios
  // (CANCELAR_ORDEN, ORDEN_CANCELADA, ...).
  const cancelaciones = await db
    .select({
      usuario_id: logAuditoria.usuario_id,
      creado_en: logAuditoria.creado_en,
    })
    .from(logAuditoria)
    .where(
      and(
        eq(logAuditoria.restaurante_id, restaurante_id),
        gte(logAuditoria.creado_en, inicio),
        ilike(logAuditoria.accion, "%CANCEL%")
      )
    );

  if (mermas.length === 0 && cancelaciones.length === 0) {
    return { detectadas: 0, insertadas: 0, omitidas_por_duplicado: 0 };
  }

  // ─── 2. Series y detección determinista ────────────────────────────────────
  const eventosMermaPorIngrediente: EventoSerie[] = mermas.map((m) => ({
    sujeto_id: m.ingrediente_id,
    cantidad: Math.abs(Number(m.cantidad)),
    fecha: new Date(m.creado_en),
  }));

  const eventosMermaPorUsuario: EventoSerie[] = mermas.map((m) => ({
    sujeto_id: m.usuario_id,
    cantidad: Math.abs(Number(m.cantidad)),
    fecha: new Date(m.creado_en),
  }));

  // Cada cancelación cuenta 1 — lo que se mide es la frecuencia, no un monto
  const eventosCancelacion: EventoSerie[] = cancelaciones.map((c) => ({
    sujeto_id: c.usuario_id,
    cantidad: 1,
    fecha: new Date(c.creado_en),
  }));

  const opcionesSeries = { fin, periodos };
  const opcionesDeteccion = { umbralZ, minPeriodosHistoricos: 4, minValorReciente: 0 };

  const anomaliasPorTipo: Record<TipoAnomalia, Anomalia[]> = {
    merma_ingrediente: detectarAnomalias(
      construirSeries(eventosMermaPorIngrediente, opcionesSeries),
      opcionesDeteccion
    ),
    merma_usuario: detectarAnomalias(
      construirSeries(eventosMermaPorUsuario, opcionesSeries),
      opcionesDeteccion
    ),
    cancelaciones_usuario: detectarAnomalias(
      construirSeries(eventosCancelacion, opcionesSeries),
      opcionesDeteccion
    ),
  };

  const totalDetectadas = Object.values(anomaliasPorTipo).reduce((n, a) => n + a.length, 0);
  if (totalDetectadas === 0) {
    return { detectadas: 0, insertadas: 0, omitidas_por_duplicado: 0 };
  }

  // ─── 3. Nombres para que la alerta sea legible ──────────────────────────────
  const [ingsRestaurante, usuariosRestaurante] = await Promise.all([
    db
      .select({
        id: ingredientes.id,
        nombre: ingredientes.nombre,
        unidad: ingredientes.unidad_medida,
      })
      .from(ingredientes)
      .where(eq(ingredientes.restaurante_id, restaurante_id)),
    db
      .select({ id: usuarios.id, nombre: usuarios.nombre, rol: usuarioRestaurantes.rol })
      .from(usuarioRestaurantes)
      .innerJoin(usuarios, eq(usuarios.id, usuarioRestaurantes.usuario_id))
      .where(eq(usuarioRestaurantes.restaurante_id, restaurante_id)),
  ]);

  const nombreIngrediente = new Map(ingsRestaurante.map((i) => [i.id, i]));
  const nombreUsuario = new Map(usuariosRestaurante.map((u) => [u.id, u]));

  const hallazgos: Hallazgo[] = [];
  for (const [tipo, anomalias] of Object.entries(anomaliasPorTipo) as [
    TipoAnomalia,
    Anomalia[],
  ][]) {
    for (const anomalia of anomalias) {
      if (tipo === "merma_ingrediente") {
        const ing = nombreIngrediente.get(anomalia.sujeto_id);
        // Un ingrediente de otro restaurante no debería llegar aquí (el JOIN ya
        // filtró); si llegara, se descarta antes de crear la alerta
        if (!ing) continue;
        hallazgos.push({
          tipo,
          sujeto_id: anomalia.sujeto_id,
          nombre: ing.nombre,
          unidad: ing.unidad,
          anomalia,
        });
      } else {
        const usuario = nombreUsuario.get(anomalia.sujeto_id);
        if (!usuario) continue;
        hallazgos.push({
          tipo,
          sujeto_id: anomalia.sujeto_id,
          nombre: `${usuario.nombre} (${usuario.rol})`,
          unidad: tipo === "merma_usuario" ? "unidades de merma" : "cancelaciones",
          anomalia,
        });
      }
    }
  }

  if (hallazgos.length === 0) {
    return { detectadas: totalDetectadas, insertadas: 0, omitidas_por_duplicado: 0 };
  }

  // ─── 4. No repetir alertas que el dueño todavía no ha atendido ─────────────
  const vigentes = await db
    .select({
      tipo: alertasAnomalias.tipo,
      ingrediente_id: alertasAnomalias.ingrediente_id,
      usuario_id: alertasAnomalias.usuario_id,
    })
    .from(alertasAnomalias)
    .where(
      and(
        eq(alertasAnomalias.restaurante_id, restaurante_id),
        eq(alertasAnomalias.atendida, false),
        gte(alertasAnomalias.creado_en, periodoInicioReciente)
      )
    );

  const clavesVigentes = new Set(
    vigentes.map((v) => `${v.tipo}:${v.ingrediente_id ?? v.usuario_id}`)
  );

  const nuevos = hallazgos.filter((h) => !clavesVigentes.has(`${h.tipo}:${h.sujeto_id}`));
  const omitidas = hallazgos.length - nuevos.length;

  if (nuevos.length === 0) {
    return {
      detectadas: totalDetectadas,
      insertadas: 0,
      omitidas_por_duplicado: omitidas,
    };
  }

  // ─── 5. Redacción (IA con fallback determinista) ────────────────────────────
  const explicacionesIA = await pedirExplicacionesAnomalias(nuevos, periodos);

  const filas: NuevaAlertaAnomalia[] = nuevos.map((h) => ({
    restaurante_id,
    tipo: h.tipo,
    ingrediente_id: h.tipo === "merma_ingrediente" ? h.sujeto_id : null,
    usuario_id: h.tipo === "merma_ingrediente" ? null : h.sujeto_id,
    valor_reciente: h.anomalia.valor_reciente.toFixed(3),
    promedio_historico: h.anomalia.promedio_historico.toFixed(3),
    desviacion_estandar: h.anomalia.desviacion_estandar.toFixed(3),
    z_score: h.anomalia.z_score.toFixed(2),
    explicacion: explicacionesIA.get(claveHallazgo(h)) ?? explicacionBase(h, periodos),
    periodo_inicio: periodoInicioReciente,
    periodo_fin: fin,
  }));

  await db.insert(alertasAnomalias).values(filas);

  console.log(
    `[DeteccionAnomalias] ${filas.length} alertas creadas para el restaurante ${restaurante_id}` +
      (omitidas > 0 ? ` (${omitidas} omitidas por alerta vigente)` : "")
  );

  return {
    detectadas: totalDetectadas,
    insertadas: filas.length,
    omitidas_por_duplicado: omitidas,
  };
}

function claveHallazgo(h: Hallazgo): string {
  return `${h.tipo}:${h.sujeto_id}`;
}

function formatearNumero(valor: number): string {
  return valor.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

/**
 * Texto que se usa si la IA no está disponible o responde con un formato
 * inesperado. Contiene exactamente los mismos datos que la versión redactada —
 * la alerta nunca queda vacía ni depende del LLM para ser útil.
 */
function explicacionBase(h: Hallazgo, periodos: number): string {
  const { valor_reciente, promedio_historico, desviacion_estandar, z_score } = h.anomalia;
  const unidad = h.unidad ? ` ${h.unidad}` : "";
  const semanas = periodos - 1;

  const que =
    h.tipo === "merma_ingrediente"
      ? `la merma registrada de ${h.nombre}`
      : h.tipo === "merma_usuario"
        ? `la merma registrada por ${h.nombre}`
        : `las cancelaciones registradas por ${h.nombre}`;

  return (
    `En los últimos 7 días ${que} fue de ${formatearNumero(valor_reciente)}${unidad}, ` +
    `frente a un promedio de ${formatearNumero(promedio_historico)}${unidad} por semana ` +
    `en las ${semanas} semanas anteriores (desviación estándar ${formatearNumero(desviacion_estandar)}). ` +
    `Eso son ${formatearNumero(z_score)} desviaciones estándar por encima de su propio promedio histórico. ` +
    `Es un dato fuera de patrón, no una conclusión: puede explicarse por un cambio de proveedor, ` +
    `una receta nueva, un evento especial o un error de captura. Conviene revisar los registros de ese periodo.`
  );
}

async function pedirExplicacionesAnomalias(
  hallazgos: Hallazgo[],
  periodos: number
): Promise<Map<string, string>> {
  const sistema =
    "Eres un analista de control interno de restaurantes. Explicas datos estadísticos a " +
    "dueños de restaurante en español claro y neutral.\n\n" +
    "Reglas estrictas:\n" +
    "- NUNCA acuses a una persona ni insinúes robo, fraude o mala fe.\n" +
    "- Describe únicamente el dato observado y por qué se sale del patrón histórico.\n" +
    "- Menciona 2 o 3 causas posibles legítimas además de las problemáticas.\n" +
    "- Termina sugiriendo qué revisar concretamente.\n" +
    "- No inventes cifras: usa solo los números que se te dan.\n" +
    "- Máximo 4 oraciones por explicación.";

  // Se manda solo el resumen agregado — nunca los movimientos crudos
  const resumen = hallazgos.map((h) => ({
    clave: claveHallazgo(h),
    tipo: h.tipo,
    sujeto: h.nombre,
    unidad: h.unidad,
    total_ultimos_7_dias: Number(h.anomalia.valor_reciente.toFixed(3)),
    promedio_semanal_historico: Number(h.anomalia.promedio_historico.toFixed(3)),
    desviacion_estandar: Number(h.anomalia.desviacion_estandar.toFixed(3)),
    z_score: Number(h.anomalia.z_score.toFixed(2)),
    semanas_de_historial: periodos - 1,
  }));

  const prompt =
    `Se detectaron ${hallazgos.length} desviaciones estadísticas en un restaurante. ` +
    `Para cada una, redacta una explicación de qué se detectó y por qué es inusual.\n\n` +
    `Devuelve una explicación por cada "clave", sin omitir ninguna:\n\n` +
    JSON.stringify(resumen, null, 2);

  return pedirExplicaciones(sistema, prompt);
}
