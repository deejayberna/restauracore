import { db } from "@/db";
import { sql } from "drizzle-orm";

async function checkInventory() {
  console.log("=== INICIANDO INSPECCIÓN EN BASE DE DATOS DE DESARROLLO ===");

  // 1. Tablas en public y su estado de RLS
  const tablesResult: any = await db.execute(sql`
    SELECT 
      schemaname, 
      tablename, 
      rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  const tables = tablesResult.rows || tablesResult;
  console.log(`\n--- TABLAS EN SCHEMA PUBLIC (Total: ${tables.length}) ---`);
  console.table(tables);

  // 2. Políticas RLS en public
  const policiesResult: any = await db.execute(sql`
    SELECT 
      schemaname, 
      tablename, 
      policyname, 
      permissive, 
      roles, 
      cmd, 
      qual, 
      with_check 
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);

  const policies = policiesResult.rows || policiesResult;
  console.log(`\n--- POLÍTICAS RLS EN PUBLIC (Total: ${policies.length}) ---`);
  for (const p of policies) {
    console.log(`TABLA: [${p.tablename}] | POLÍTICA: [${p.policyname}] | COMANDO: ${p.cmd} | ROLES: ${p.roles}`);
    console.log(`  USING: ${p.qual}`);
    if (p.with_check) {
      console.log(`  WITH CHECK: ${p.with_check}`);
    }
  }

  // 3. Políticas RLS en storage (si existen)
  try {
    const storageResult: any = await db.execute(sql`
      SELECT 
        schemaname, 
        tablename, 
        policyname, 
        cmd, 
        qual, 
        with_check 
      FROM pg_policies 
      WHERE schemaname = 'storage'
      ORDER BY tablename, policyname;
    `);
    const storagePolicies = storageResult.rows || storageResult;
    console.log(`\n--- POLÍTICAS RLS EN STORAGE (Total: ${storagePolicies.length}) ---`);
    for (const sp of storagePolicies) {
      console.log(`TABLA: [storage.${sp.tablename}] | POLÍTICA: [${sp.policyname}] | COMANDO: ${sp.cmd}`);
    }
  } catch (e) {
    console.log("No se pudo consultar storage:", (e as any).message);
  }

  // 4. Triggers en public
  const triggersResult: any = await db.execute(sql`
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
    ORDER BY c.relname, t.tgname;
  `);

  const triggers = triggersResult.rows || triggersResult;
  console.log(`\n--- TRIGGERS EN SCHEMA PUBLIC (Total: ${triggers.length}) ---`);
  for (const trg of triggers) {
    console.log(`TABLA: [${trg.table_name}] | TRIGGER: [${trg.trigger_name}] | FUNCIÓN: [${trg.function_name}]`);
    console.log(`  DEFINICIÓN: ${trg.definition}`);
  }

  console.log("\n=== INSPECCIÓN COMPLETADA ===");
  process.exit(0);
}

checkInventory().catch(err => {
  console.error("Error al consultar:", err);
  process.exit(1);
});

