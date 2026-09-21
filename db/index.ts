import { config } from "dotenv";

// Cargar .env.local (o el archivo indicado por DOTENV_CONFIG_PATH) antes de cualquier uso de process.env
const envPath = process.env.DOTENV_CONFIG_PATH || ".env.local";
config({ path: envPath, override: true });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

// Conexión a Postgres para Drizzle
// Durante la fase de build estático en CI/Vercel, si DATABASE_URL no está inyectada en el entorno de compilación,
// se usa un endpoint dummy para permitir que Next.js compile las rutas sin abortar el proceso.
const client = postgres(
  databaseUrl || "postgresql://postgres:postgres@127.0.0.1:5432/build_dummy",
  { prepare: false }
);

export const db = drizzle(client, { schema });
