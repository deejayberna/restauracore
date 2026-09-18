import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { movimientosInventario, ingredientes, prediccionesDemanda } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { z } from "@/lib/validation";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Schema Zod para validar la respuesta de la IA
const prediccionSchema = z.array(
  z.object({
    ingrediente_id: z.string().uuid(),
    fecha: z.string(), // ISO date string
    cantidad_estimada: z.number().min(0),
  })
);

interface ResumenIngrediente {
  ingrediente_id: string;
  nombre: string;
  unidad: string;
  consumo_por_dia: Record<string, number>; // "lunes" -> promedio consumo
  total_90_dias: number;
}

export async function generarPrediccionDemanda(restaurante_id: string): Promise<void> {
  // 1. Consultar historial de movimientos tipo 'venta' de los últimos 90 días
  const hace90Dias = new Date();
  hace90Dias.setDate(hace90Dias.getDate() - 90);

  const ingsRestaurante = await db.query.ingredientes.findMany({
    where: eq(ingredientes.restaurante_id, restaurante_id),
  });

  if (ingsRestaurante.length === 0) return;

  const movimientos = await db.query.movimientosInventario.findMany({
    where: and(
      eq(movimientosInventario.tipo, "venta"),
      gte(movimientosInventario.creado_en, hace90Dias)
    ),
  });

  // 2. Agregar consumo por ingrediente y día de la semana
  const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const resumen: ResumenIngrediente[] = ingsRestaurante.map((ing) => {
    const movIng = movimientos.filter((m) => m.ingrediente_id === ing.id);
    const consumoPorDia: Record<string, number[]> = {};

    for (const mov of movIng) {
      const dia = DIAS[new Date(mov.creado_en).getDay()];
      if (!consumoPorDia[dia]) consumoPorDia[dia] = [];
      consumoPorDia[dia].push(Math.abs(Number(mov.cantidad)));
    }

    const promedioPorDia: Record<string, number> = {};
    for (const [dia, valores] of Object.entries(consumoPorDia)) {
      promedioPorDia[dia] = valores.reduce((a, b) => a + b, 0) / valores.length;
    }

    return {
      ingrediente_id: ing.id,
      nombre: ing.nombre,
      unidad: ing.unidad_medida,
      consumo_por_dia: promedioPorDia,
      total_90_dias: movIng.reduce((sum, m) => sum + Math.abs(Number(m.cantidad)), 0),
    };
  });

  // Filtrar ingredientes sin historial
  const conHistorial = resumen.filter((r) => r.total_90_dias > 0);
  if (conHistorial.length === 0) return;

  // 3. Enviar resumen agregado a la IA (nunca datos crudos innecesarios)
  const hoy = new Date();
  const proximosSieteDias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().split("T")[0];
  });

  const prompt = `Eres un sistema de predicción de demanda para restaurantes.
  
Basándote en el historial de consumo de los últimos 90 días, predice el consumo esperado para los próximos 7 días.

Historial de consumo promedio por día de la semana:
${JSON.stringify(conHistorial, null, 2)}

Fechas a predecir: ${proximosSieteDias.join(", ")}

Responde ÚNICAMENTE con un array JSON válido con este formato exacto, sin texto adicional:
[
  {
    "ingrediente_id": "uuid-del-ingrediente",
    "fecha": "YYYY-MM-DD",
    "cantidad_estimada": numero_positivo
  }
]

Genera una predicción por cada ingrediente por cada fecha (${conHistorial.length * 7} objetos total).`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const contenido = message.content[0];
  if (contenido.type !== "text") throw new Error("Respuesta inesperada de la IA");

  // 4. Validar respuesta con Zod — nunca confiar ciegamente en la salida del LLM
  let predicciones: z.infer<typeof prediccionSchema>;
  try {
    const jsonMatch = contenido.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No se encontró JSON en la respuesta");
    predicciones = prediccionSchema.parse(JSON.parse(jsonMatch[0]));
  } catch (e) {
    console.error("[PrediccionDemanda] Respuesta inválida de la IA:", e);
    throw new Error("La IA respondió con un formato inesperado");
  }

  // 5. Guardar predicciones en la BD (solo las que tienen cantidad > 0)
  const conCantidad = predicciones.filter((p) => p.cantidad_estimada > 0);
  if (conCantidad.length === 0) return;

  await db.insert(prediccionesDemanda).values(
    conCantidad.map((p) => ({
      ingrediente_id: p.ingrediente_id,
      fecha: new Date(p.fecha),
      cantidad_estimada: p.cantidad_estimada.toFixed(3),
      generado_en: new Date(),
    }))
  );

  console.log(`[PrediccionDemanda] ${conCantidad.length} predicciones guardadas`);
}
