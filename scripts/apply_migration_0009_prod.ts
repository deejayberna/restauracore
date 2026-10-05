import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(process.cwd(), ".env.production.local"), override: true });

import postgres from "postgres";

async function run() {
  console.log("Aplicando migración 0009 y RLS en PRODUCCIÓN (.env.production.local)...");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL no definida en .env.production.local");

  const sql = postgres(dbUrl, { max: 1 });

  try {
    // 1. Tabla clientes_telegram
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "public"."clientes_telegram" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "restaurante_id" uuid NOT NULL REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE,
        "chat_id_telegram" text NOT NULL,
        "nombre_telegram" text,
        "codigo_vinculacion" text UNIQUE,
        "orden_id_origen" uuid REFERENCES "public"."ordenes"("id") ON DELETE SET NULL,
        "ultima_visita_en" timestamp NOT NULL DEFAULT now(),
        "total_visitas" integer NOT NULL DEFAULT 1,
        "ultimo_mensaje_recuperacion_en" timestamp,
        "activo" boolean NOT NULL DEFAULT true,
        "creado_en" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "uq_clientes_telegram_restaurante_chat" UNIQUE ("restaurante_id", "chat_id_telegram")
      );
    `);
    console.log("✓ Tabla clientes_telegram verificada/creada en producción.");

    // 2. Tabla vinculaciones_telegram_pendientes
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "public"."vinculaciones_telegram_pendientes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "codigo" text NOT NULL UNIQUE,
        "restaurante_id" uuid NOT NULL REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE,
        "orden_id" uuid REFERENCES "public"."ordenes"("id") ON DELETE CASCADE,
        "creado_en" timestamp NOT NULL DEFAULT now(),
        "expira_en" timestamp NOT NULL
      );
    `);
    console.log("✓ Tabla vinculaciones_telegram_pendientes verificada/creada en producción.");

    // 3. Índices
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "idx_clientes_telegram_restaurante" ON "public"."clientes_telegram" ("restaurante_id");
      CREATE INDEX IF NOT EXISTS "idx_clientes_telegram_chat" ON "public"."clientes_telegram" ("chat_id_telegram");
      CREATE INDEX IF NOT EXISTS "idx_clientes_telegram_codigo" ON "public"."clientes_telegram" ("codigo_vinculacion");
      CREATE INDEX IF NOT EXISTS "idx_vinculaciones_telegram_codigo" ON "public"."vinculaciones_telegram_pendientes" ("codigo");
    `);
    console.log("✓ Índices creados exitosamente en producción.");

    // 4. Habilitar RLS en ambas tablas
    await sql.unsafe(`
      ALTER TABLE "public"."clientes_telegram" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "public"."vinculaciones_telegram_pendientes" ENABLE ROW LEVEL SECURITY;
    `);
    console.log("✓ RLS habilitado (rowsecurity = true) en ambas tablas.");

    // 5. Políticas RLS
    await sql.unsafe(`
      -- Políticas para clientes_telegram
      DROP POLICY IF EXISTS "clientes_telegram_select" ON "public"."clientes_telegram";
      CREATE POLICY "clientes_telegram_select" ON "public"."clientes_telegram"
        FOR SELECT USING (
          restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
          )
        );

      DROP POLICY IF EXISTS "clientes_telegram_modify" ON "public"."clientes_telegram";
      CREATE POLICY "clientes_telegram_modify" ON "public"."clientes_telegram"
        FOR ALL USING (
          restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
              AND ur.rol IN ('gerente', 'dueno')
          )
        );

      -- Políticas para vinculaciones_telegram_pendientes
      DROP POLICY IF EXISTS "vinculaciones_telegram_select" ON "public"."vinculaciones_telegram_pendientes";
      CREATE POLICY "vinculaciones_telegram_select" ON "public"."vinculaciones_telegram_pendientes"
        FOR SELECT USING (
          restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
          )
        );

      DROP POLICY IF EXISTS "vinculaciones_telegram_all" ON "public"."vinculaciones_telegram_pendientes";
      CREATE POLICY "vinculaciones_telegram_all" ON "public"."vinculaciones_telegram_pendientes"
        FOR ALL USING (
          restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
          )
        );

      -- Grants
      GRANT USAGE ON SCHEMA public TO authenticated, anon;
      GRANT ALL ON "public"."clientes_telegram" TO authenticated, anon, service_role;
      GRANT ALL ON "public"."vinculaciones_telegram_pendientes" TO authenticated, anon, service_role;
    `);
    console.log("✓ Políticas RLS y Grants aplicados en producción.");

    console.log("\n✓ Migración 0009 y RLS completadas con ÉXITO en PRODUCCIÓN.");
  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  console.error("Error aplicando en producción:", err);
  process.exit(1);
});
