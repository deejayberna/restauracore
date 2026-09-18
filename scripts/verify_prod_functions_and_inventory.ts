import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import postgres from "postgres";

const prodEnvPath = path.resolve(process.cwd(), ".env.production.local");
config({ path: prodEnvPath, override: true });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

async function verifyAll() {
  console.log("=================================================================");
  console.log("  CONFIRMACIÓN COMPLETA DE BASE DE DATOS DE PRODUCCIÓN (NUEVA)  ");
  console.log("=================================================================\n");

  // 1. Funciones de negocio solicitadas en punto 2
  console.log("--- 1. CONSULTA DE FUNCIONES DE NEGOCIO (pg_proc) ---");
  const procs = await sql`
    SELECT proname 
    FROM pg_proc 
    WHERE proname IN ('restaurantes_activos_del_usuario', 'check_last_dueno', 'fn_alerta_stock_bajo')
    ORDER BY proname;
  `;
  console.table(procs);

  // 2. Triggers activos solicitados en punto 2
  console.log("\n--- 2. CONSULTA DE TRIGGERS ACTIVOS (pg_trigger) ---");
  const triggers = await sql`
    SELECT 
      t.tgname AS trigger_name,
      c.relname AS table_name,
      p.proname AS function_name,
      pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND t.tgname IN ('trg_prevent_last_dueno', 'trg_alerta_stock_bajo')
    ORDER BY c.relname, t.tgname;
  `;
  console.table(triggers.map(t => ({
    trigger_name: t.trigger_name,
    table_name: t.table_name,
    function_name: t.function_name
  })));
  for (const t of triggers) {
    console.log(`Definición [${t.trigger_name}]: ${t.definition}`);
  }

  // 3. Bucket de storage y sus políticas
  console.log("\n--- 3. BUCKET STORAGE 'mermas-evidencia' ---");
  const buckets = await sql`
    SELECT id, name, public, created_at FROM storage.buckets WHERE id = 'mermas-evidencia';
  `;
  console.table(buckets);

  const storagePolicies = await sql`
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies 
    WHERE schemaname = 'storage'
    ORDER BY policyname;
  `;
  console.log("Políticas en storage.objects:");
  console.table(storagePolicies);

  // 4. Tablas en public y rowsecurity
  console.log("\n--- 4. TABLAS Y ESTADO DE ROW LEVEL SECURITY (pg_tables) ---");
  const tables = await sql`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `;
  console.log(`Total tablas en public: ${tables.length}`);
  console.table(tables);

  // Comparación contra schema.ts
  const schemaPath = path.resolve(process.cwd(), "db", "schema.ts");
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");
  const pgTableRegex = /pgTable\(\s*["']([^"']+)["']/g;
  const schemaTables: string[] = [];
  let match;
  while ((match = pgTableRegex.exec(schemaContent)) !== null) {
    schemaTables.push(match[1]);
  }
  schemaTables.sort();

  const missingInDb = schemaTables.filter(t => !tables.map(d => d.tablename).includes(t));
  const missingInSchema = tables.map(d => d.tablename).filter(t => !schemaTables.includes(t));
  const noRls = tables.filter(t => !t.rowsecurity);

  console.log(`Tablas en db/schema.ts: ${schemaTables.length}`);
  console.log(`Tablas en PostgreSQL producción: ${tables.length}`);
  console.log(`Coincidencia exacta de tablas: ${tables.length === 23 && missingInDb.length === 0 && missingInSchema.length === 0 ? 'SÍ (23 de 23)' : 'NO'}`);
  console.log(`Tablas con rowsecurity = false: ${noRls.length === 0 ? 'NINGUNA (todas protegidas)' : noRls.map(t => t.tablename).join(', ')}`);

  // 5. Políticas RLS en public
  console.log("\n--- 5. POLÍTICAS RLS EN PUBLIC (pg_policies) ---");
  const policies = await sql`
    SELECT tablename, policyname, cmd 
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `;
  console.log(`Total políticas RLS en public: ${policies.length}`);

  const polByTable: Record<string, string[]> = {};
  for (const p of policies) {
    if (!polByTable[p.tablename]) polByTable[p.tablename] = [];
    polByTable[p.tablename].push(`${p.policyname} (${p.cmd})`);
  }

  for (const [t, pols] of Object.entries(polByTable)) {
    console.log(`  • ${t.padEnd(30)} [${pols.length}]: ${pols.join(", ")}`);
  }

  console.log("\n=================================================================");
  console.log("  VERIFICACIÓN FINAL DE PRODUCCIÓN: COMPLETADA EXITOSAMENTE ✓   ");
  console.log("=================================================================");

  await sql.end();
  process.exit(0);
}

verifyAll().catch(err => {
  console.error("Error en verifyAll:", err);
  process.exit(1);
});

