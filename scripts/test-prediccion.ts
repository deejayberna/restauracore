import { config } from "dotenv";
config({ path: ".env.local" });

import { generarPrediccionDemanda } from "../lib/ai/prediccionDemanda";
import { db } from "../db";
import { restaurantes } from "../db/schema";

async function main() {
  const [rest] = await db.query.restaurantes.findMany();
  if (!rest) { console.error("No hay restaurantes"); process.exit(1); }

  console.log(`🤖 Generando predicción para: ${rest.nombre}`);
  await generarPrediccionDemanda(rest.id);
  console.log("✅ Predicciones guardadas — revisa la tabla predicciones_demanda en Supabase");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
