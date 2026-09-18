import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function run() {
  console.log("Aplicando migración 0004_fase9_mejoras_integrales.sql...");
  const filePath = path.join(process.cwd(), "db", "migrations", "0004_fase9_mejoras_integrales.sql");
  const sqlContent = fs.readFileSync(filePath, "utf-8");

  // Dividir por bloques o ejecutar de forma controlada
  // 1. ALTER TYPE rol ADD VALUE IF NOT EXISTS 'cajero' (ejecutar primero de forma aislada)
  try {
    await db.execute(sql`ALTER TYPE "public"."rol" ADD VALUE IF NOT EXISTS 'cajero';`);
    console.log("✓ ALTER TYPE rol ADD VALUE IF NOT EXISTS 'cajero' exitoso.");
  } catch (err: any) {
    console.log("Nota en ALTER TYPE rol:", err?.message ?? err);
  }

  // 2. Ejecutar el resto de la migración
  await db.execute(sql.raw(sqlContent));
  console.log("✓ Migración 0004 aplicada con éxito en PostgreSQL.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Error aplicando migración:", err);
  process.exit(1);
});

