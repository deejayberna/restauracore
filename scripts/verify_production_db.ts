import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function verifyDb() {
  console.log("=================================================");
  console.log("  VERIFICACIÓN FINAL DE BASE DE DATOS (PRODUCCIÓN)");
  console.log("=================================================\n");

  // 1. Tablas y rowsecurity
  const tablesResult: any = await db.execute(sql`
    SELECT 
      tablename, 
      rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  const dbTables: { tablename: string; rowsecurity: boolean }[] = tablesResult.rows || tablesResult;

  // 2. Tablas definidas en schema.ts
  const schemaPath = path.join(process.cwd(), "db", "schema.ts");
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");
  const pgTableRegex = /pgTable\(\s*["']([^"']+)["']/g;
  const schemaTables: string[] = [];
  let match;
  while ((match = pgTableRegex.exec(schemaContent)) !== null) {
    schemaTables.push(match[1]);
  }
  schemaTables.sort();

  console.log(`1. TABLAS:`);
  console.log(`   - Total en db/schema.ts: ${schemaTables.length}`);
  console.log(`   - Total en PostgreSQL:   ${dbTables.length}`);

  const missingInDb = schemaTables.filter(t => !dbTables.map(d => d.tablename).includes(t));
  const missingInSchema = dbTables.map(d => d.tablename).filter(t => !schemaTables.includes(t));
  const noRls = dbTables.filter(t => !t.rowsecurity);

  if (missingInDb.length === 0 && missingInSchema.length === 0 && dbTables.length === 23) {
    console.log(`   ✓ Las 23 tablas coinciden al 100% con db/schema.ts.`);
  } else {
    console.error(`   ✗ Discrepancia en tablas!`);
    if (missingInDb.length > 0) console.error(`     Faltan en DB: ${missingInDb.join(", ")}`);
    if (missingInSchema.length > 0) console.error(`     Huérfanas en DB: ${missingInSchema.join(", ")}`);
  }

  if (noRls.length === 0) {
    console.log(`   ✓ RLS habilitado (rowsecurity = true) en las 23 tablas.`);
  } else {
    console.error(`   ✗ ALERTA: Tablas sin RLS: ${noRls.map(t => t.tablename).join(", ")}`);
  }

  // 3. Políticas RLS
  const polResult: any = await db.execute(sql`
    SELECT tablename, policyname, cmd 
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);
  const policies: { tablename: string; policyname: string; cmd: string }[] = polResult.rows || polResult;

  console.log(`\n2. POLÍTICAS ROW LEVEL SECURITY (RLS):`);
  console.log(`   - Total políticas RLS activas en public: ${policies.length}`);

  const polByTable: Record<string, string[]> = {};
  for (const p of policies) {
    if (!polByTable[p.tablename]) polByTable[p.tablename] = [];
    polByTable[p.tablename].push(`${p.policyname} (${p.cmd})`);
  }

  for (const [t, pols] of Object.entries(polByTable)) {
    console.log(`   • ${t.padEnd(28)} [${pols.length}]: ${pols.join(", ")}`);
  }

  // 4. Triggers
  const trgResult: any = await db.execute(sql`
    SELECT 
      t.tgname AS trigger_name,
      c.relname AS table_name,
      p.proname AS function_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname;
  `);
  const triggers: any[] = trgResult.rows || trgResult;

  console.log(`\n3. TRIGGERS:`);
  console.log(`   - Total triggers en public: ${triggers.length}`);
  for (const trg of triggers) {
    console.log(`   ✓ Tabla [${trg.table_name}] -> Trigger: ${trg.trigger_name} (Función: ${trg.function_name})`);
  }

  console.log("\n=================================================");
  if (dbTables.length === 23 && noRls.length === 0 && policies.length >= 41 && triggers.length === 2) {
    console.log("  ESTADO GENERAL: LISTO PARA PRODUCCIÓN ✓");
  } else {
    console.log("  ESTADO GENERAL: REVISAR ADVERTENCIAS ARRIBA ⚠");
  }
  console.log("=================================================");
  process.exit(0);
}

verifyDb().catch(err => {
  console.error("Error en la verificación:", err);
  process.exit(1);
});

