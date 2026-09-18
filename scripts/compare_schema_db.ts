import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function compareTables() {
  console.log("=== COMPARACIÓN DE TABLAS: db/schema.ts vs pg_tables ===");

  // 1. Leer db/schema.ts y extraer todas las llamadas a pgTable('nombre', ...)
  const schemaPath = path.join(process.cwd(), "db", "schema.ts");
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");

  // Regex para capturar pgTable("nombre_tabla" o pgTable('nombre_tabla'
  const pgTableRegex = /pgTable\(\s*["']([^"']+)["']/g;
  const schemaTables: string[] = [];
  let match;
  while ((match = pgTableRegex.exec(schemaContent)) !== null) {
    schemaTables.push(match[1]);
  }

  // 2. Consultar pg_tables en la base de datos
  const dbResult: any = await db.execute(sql`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  const dbTables: string[] = (dbResult.rows || dbResult).map((r: any) => r.tablename);

  console.log(`\nTotal pgTable() en db/schema.ts: ${schemaTables.length}`);
  console.log(`Total tablas en pg_tables (public): ${dbTables.length}`);

  console.log("\n--- Tablas en db/schema.ts ---");
  schemaTables.sort().forEach((t, i) => console.log(` ${i + 1}. ${t}`));

  console.log("\n--- Tablas en pg_tables (PostgreSQL) ---");
  dbTables.sort().forEach((t, i) => console.log(` ${i + 1}. ${t}`));

  // Tablas en schema que no están en DB
  const missingInDb = schemaTables.filter(t => !dbTables.includes(t));
  // Tablas en DB que no están en schema
  const missingInSchema = dbTables.filter(t => !schemaTables.includes(t));

  console.log("\n--- RESULTADO DE LA COMPARACIÓN ---");
  console.log(`¿Coincidencia exacta de conteo? ${schemaTables.length === dbTables.length ? 'SÍ' : 'NO'}`);
  console.log(`Tablas en schema.ts ausentes en Postgres (huérfanas en código): ${missingInDb.length === 0 ? 'NINGUNA' : missingInDb.join(', ')}`);
  console.log(`Tablas en Postgres ausentes en schema.ts (huérfanas en DB): ${missingInSchema.length === 0 ? 'NINGUNA' : missingInSchema.join(', ')}`);

  process.exit(0);
}

compareTables().catch(err => {
  console.error(err);
  process.exit(1);
});

