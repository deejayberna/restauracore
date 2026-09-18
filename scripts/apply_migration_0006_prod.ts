import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(process.cwd(), ".env.production.local"), override: true });

import postgres from "postgres";

async function run() {
  console.log("Aplicando migración 0006 en PRODUCCIÓN (.env.production.local)...");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL no definida");

  const sql = postgres(dbUrl, { max: 1 });

  await sql`
    DO $$ BEGIN
      CREATE TYPE "public"."estado_suscripcion" AS ENUM('trial', 'activa', 'pago_fallido', 'cancelada');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;
  console.log("✓ Tipo estado_suscripcion verificado/creado en producción.");

  await sql`
    CREATE TABLE IF NOT EXISTS "registros_pendientes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "email" text NOT NULL,
      "password_hash" text NOT NULL,
      "nombre_dueno" text NOT NULL,
      "nombre_restaurante" text NOT NULL,
      "direccion" text,
      "timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
      "plan" "plan" DEFAULT 'basico' NOT NULL,
      "stripe_session_id" text UNIQUE,
      "completado" boolean DEFAULT false NOT NULL,
      "expira_en" timestamp NOT NULL,
      "creado_en" timestamp DEFAULT now() NOT NULL
    );
  `;
  console.log("✓ Tabla registros_pendientes verificada/creada en producción.");

  await sql`
    CREATE TABLE IF NOT EXISTS "stripe_eventos_procesados" (
      "id" text PRIMARY KEY NOT NULL,
      "tipo" text NOT NULL,
      "procesado_en" timestamp DEFAULT now() NOT NULL
    );
  `;
  console.log("✓ Tabla stripe_eventos_procesados verificada/creada en producción.");

  await sql`
    ALTER TABLE "restaurantes" 
      ADD COLUMN IF NOT EXISTS "stripe_customer_id" text UNIQUE,
      ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text UNIQUE,
      ADD COLUMN IF NOT EXISTS "estado_suscripcion" "estado_suscripcion" DEFAULT 'trial' NOT NULL,
      ADD COLUMN IF NOT EXISTS "fecha_fin_trial" timestamp,
      ADD COLUMN IF NOT EXISTS "umbral_foto_merma" numeric(10, 2) DEFAULT '150.00';
  `;
  console.log("✓ Columnas en restaurantes verificadas/creadas en producción.");

  await sql.end();
  console.log("✓ Migración 0006 completada con éxito en PRODUCCIÓN.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Error en producción:", err);
  process.exit(1);
});

