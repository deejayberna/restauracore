import * as dotenv from "dotenv";

async function aplicarMigracion0009() {
  dotenv.config({ path: ".env.local" });
  dotenv.config();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL no encontrada en el entorno.");
    process.exit(1);
  }

  const postgres = (await import("postgres")).default;
  const client = postgres(url, { max: 1 });

  console.log("Aplicando migración 0009: Clientes Telegram y Vinculaciones...");

  try {
    // 1. Tabla clientes_telegram
    await client.unsafe(`
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
    console.log("✓ Tabla clientes_telegram verificada.");

    // 2. Tabla vinculaciones_telegram_pendientes
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS "public"."vinculaciones_telegram_pendientes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "codigo" text NOT NULL UNIQUE,
        "restaurante_id" uuid NOT NULL REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE,
        "orden_id" uuid REFERENCES "public"."ordenes"("id") ON DELETE CASCADE,
        "creado_en" timestamp NOT NULL DEFAULT now(),
        "expira_en" timestamp NOT NULL
      );
    `);
    console.log("✓ Tabla vinculaciones_telegram_pendientes verificada.");

    // 3. Índices
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS "idx_clientes_telegram_restaurante" ON "public"."clientes_telegram" ("restaurante_id");
      CREATE INDEX IF NOT EXISTS "idx_clientes_telegram_chat" ON "public"."clientes_telegram" ("chat_id_telegram");
      CREATE INDEX IF NOT EXISTS "idx_clientes_telegram_codigo" ON "public"."clientes_telegram" ("codigo_vinculacion");
      CREATE INDEX IF NOT EXISTS "idx_vinculaciones_telegram_codigo" ON "public"."vinculaciones_telegram_pendientes" ("codigo");
    `);
    console.log("✓ Índices creados exitosamente.");

    console.log("\nMigración 0009 completada con éxito.");
  } catch (err: any) {
    console.error("Error aplicando migración 0009:", err);
  } finally {
    await client.end();
  }
}

aplicarMigracion0009();

