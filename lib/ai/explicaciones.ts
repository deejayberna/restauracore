/**
 * Capa de redacción con IA, compartida por detección de anomalías (5.3) y
 * menu engineering (5.4).
 *
 * Regla de la Fase 5: la IA NUNCA decide números ni clasificaciones — eso ya se
 * calculó de forma determinista antes de llegar aquí. La IA solo redacta el
 * texto que acompaña a un dato ya verificado, y su salida se valida con Zod
 * antes de usarse. Si la IA falla, responde cualquier cosa, o el formato cambia,
 * estas funciones devuelven un mapa vacío y quien las llama usa su texto propio.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "@/lib/validation";

/** Modelo usado por la capa de IA de la Fase 5. */
export const MODELO_IA = "claude-opus-5";

export const explicacionesSchema = z.object({
  explicaciones: z
    .array(
      z.object({
        clave: z.string().min(1),
        explicacion: z.string().min(10).max(800),
      })
    )
    .max(100),
});

export type RespuestaExplicaciones = z.infer<typeof explicacionesSchema>;

/**
 * Valida la salida de la IA y la convierte en un mapa clave → texto.
 * Ante CUALQUIER forma inesperada (null, string, objeto distinto, campos
 * faltantes, texto vacío) devuelve un mapa vacío en vez de lanzar: una alerta de
 * inventario o un reporte de rentabilidad no puede caerse porque un LLM
 * respondió raro.
 */
export function parseExplicaciones(raw: unknown): Map<string, string> {
  const resultado = explicacionesSchema.safeParse(raw);

  if (!resultado.success) {
    console.warn(
      "[IA] Respuesta con formato inesperado — se usarán las explicaciones base:",
      resultado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
    );
    return new Map();
  }

  return new Map(resultado.data.explicaciones.map((e) => [e.clave, e.explicacion.trim()]));
}

/**
 * Pide a la IA un texto por cada clave y devuelve solo lo que pasó validación.
 * No lanza nunca: cualquier error de red, de API o de formato se registra y se
 * devuelve un mapa vacío.
 */
export async function pedirExplicaciones(
  sistema: string,
  prompt: string
): Promise<Map<string, string>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[IA] ANTHROPIC_API_KEY no configurada — se usarán las explicaciones base");
    return new Map();
  }

  try {
    // Cliente construido aquí y no a nivel de módulo para que este archivo se
    // pueda importar en pruebas sin credenciales
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const respuesta = await client.messages.parse({
      model: MODELO_IA,
      max_tokens: 8192,
      system: sistema,
      messages: [{ role: "user", content: prompt }],
      output_config: {
        effort: "low", // redactar textos cortos no necesita razonamiento profundo
        format: zodOutputFormat(explicacionesSchema),
      },
    });

    // parsed_output es null si la salida no cumplió el esquema
    return parseExplicaciones(respuesta.parsed_output);
  } catch (e) {
    console.error("[IA] Error al pedir explicaciones:", e);
    return new Map();
  }
}
