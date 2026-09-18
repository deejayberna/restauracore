import { config } from "dotenv";
import * as path from "path";

const envPath = process.env.DOTENV_CONFIG_PATH || ".env.local";
config({ path: path.resolve(process.cwd(), envPath), override: true });

import postgres from "postgres";

async function run() {
  console.log(`Aplicando migración 0007 usando entorno: ${envPath}...`);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL no definida");

  const sql = postgres(dbUrl, { max: 1 });

  await sql`
    ALTER TABLE "restaurantes" 
      ADD COLUMN IF NOT EXISTS "telegram_chat_id" text,
      ADD COLUMN IF NOT EXISTS "email_alertas" text;
  `;
  console.log("✓ Columnas telegram_chat_id y email_alertas agregadas/verificadas en restaurantes.");

  await sql.end();
  console.log("✓ Migración 0007 finalizada con éxito.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Error aplicando migración 0007:", err);
  process.exit(1);
});

