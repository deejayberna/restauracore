import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { restaurantes } from "@/db/schema";
import { generarPrediccionDemanda } from "@/lib/ai/prediccionDemanda";

export async function GET(request: NextRequest) {
  // Verificar que la llamada viene del cron de Vercel
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const todos = await db.query.restaurantes.findMany();
  const resultados: { restaurante: string; ok: boolean; error?: string }[] = [];

  for (const rest of todos) {
    try {
      await generarPrediccionDemanda(rest.id);
      resultados.push({ restaurante: rest.nombre, ok: true });
    } catch (e) {
      resultados.push({
        restaurante: rest.nombre,
        ok: false,
        error: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  return NextResponse.json({ resultados });
}
