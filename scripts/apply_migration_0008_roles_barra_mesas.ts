import { db } from "@/db";
import { sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

async function aplicarEnBaseDeDatos(url: string, nombreEnv: string) {
  console.log(`\n======================================================`);
  console.log(`Aplicando migración en: ${nombreEnv}`);
  console.log(`======================================================`);

  // Usamos postgres directo via drizzle sql
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;

  const client = postgres(url, { max: 1 });
  const migrationDb = drizzle(client);

  try {
    // 1. ALTER TYPE rol ADD VALUE (debe correr fuera de bloques transaccionales)
    console.log("1. Actualizando enum 'rol'...");
    const rolesNuevos = ["anfitrion", "food_runner", "supervisor_piso", "bartender"];
    for (const r of rolesNuevos) {
      try {
        await client.unsafe(`ALTER TYPE "public"."rol" ADD VALUE IF NOT EXISTS '${r}';`);
        console.log(`   ✓ Rol '${r}' asegurado en enum rol.`);
      } catch (err: any) {
        console.log(`   Nota rol '${r}': ${err.message}`);
      }
    }

    // 2. Crear enum 'estacion'
    console.log("2. Creando enum 'estacion'...");
    await client.unsafe(`
      DO $$ BEGIN
        CREATE TYPE "public"."estacion" AS ENUM('cocina', 'bar');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("   ✓ Enum 'estacion' asegurado.");

    // 3. Columna 'estacion' en platillos
    console.log("3. Agregando columna 'estacion' a platillos...");
    await client.unsafe(`
      ALTER TABLE "public"."platillos"
        ADD COLUMN IF NOT EXISTS "estacion" "public"."estacion" NOT NULL DEFAULT 'cocina';
    `);
    console.log("   ✓ Columna 'estacion' en platillos asegurada con DEFAULT 'cocina'.");

    // 4. Columnas 'mesero_actual_id' y 'asignado_en' en mesas
    console.log("4. Agregando columnas de exclusividad en mesas...");
    await client.unsafe(`
      ALTER TABLE "public"."mesas"
        ADD COLUMN IF NOT EXISTS "mesero_actual_id" uuid REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;
      ALTER TABLE "public"."mesas"
        ADD COLUMN IF NOT EXISTS "asignado_en" timestamp with time zone;
    `);
    console.log("   ✓ Columnas 'mesero_actual_id' y 'asignado_en' agregadas a mesas.");

    // 5. Política RLS mesas_update
    console.log("5. Asegurando política RLS 'mesas_update'...");
    await client.unsafe(`
      DROP POLICY IF EXISTS "mesas_update" ON "public"."mesas";
      CREATE POLICY "mesas_update" ON "public"."mesas"
        FOR UPDATE USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));
    `);
    console.log("   ✓ Política RLS 'mesas_update' configurada.");

    console.log(`Migración completada con éxito en ${nombreEnv}.`);
  } finally {
    await client.end();
  }
}

async function main() {
  // A. Entorno local/desarrollo (.env.local)
  const envLocal = dotenv.config({ path: ".env.local" }).parsed || {};
  const dbUrlLocal = envLocal.DATABASE_URL || process.env.DATABASE_URL;

  if (dbUrlLocal) {
    await aplicarEnBaseDeDatos(dbUrlLocal, "DESARROLLO (.env.local)");
  }

  // B. Entorno producción (.env.production.local)
  const envProd = dotenv.config({ path: ".env.production.local" }).parsed || {};
  const dbUrlProd = envProd.DATABASE_URL;

  if (dbUrlProd && dbUrlProd !== dbUrlLocal) {
    await aplicarEnBaseDeDatos(dbUrlProd, "PRODUCCIÓN (.env.production.local)");
  }
}

main().catch((err) => {
  console.error("Error fatal en migración:", err);
  process.exit(1);
});
