import { config } from "dotenv";

// Cargar .env.local (o el archivo indicado por DOTENV_CONFIG_PATH) antes de cualquier uso de process.env
const envPath = process.env.DOTENV_CONFIG_PATH || ".env.local";
config({ path: envPath, override: true });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en las variables de entorno");
}

// Conexión directa a Postgres (solo para Drizzle — queries, mutaciones, migraciones)
// NO uses esta conexión para Auth ni Realtime — usa @supabase/supabase-js para eso
const client = postgres(process.env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
