import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";

async function checkInventory() {
  // 1. Tablas
  const tables: any = await db.execute(sql`
    SELECT schemaname, tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  // 2. Políticas RLS
  const policies: any = await db.execute(sql`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);

  // 3. Triggers
  const triggers: any = await db.execute(sql`
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

  // 4. Funciones creadas por nosotros (no de extensiones)
  const functions: any = await db.execute(sql`
    SELECT 
      p.proname,
      pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  `);

  const report = {
    tables: tables.rows || tables,
    policies: policies.rows || policies,
    triggers: triggers.rows || triggers,
    functions: (functions.rows || functions).map((f: any) => ({
      name: f.proname,
      def: f.def
    }))
  };

  fs.writeFileSync("C:/Users/berna/.gemini/antigravity/brain/5dbfb7e6-16ee-42fb-9873-6a8db85cc717/scratch/db_inventory.json", JSON.stringify(report, null, 2));
  console.log("Inventario guardado en db_inventory.json");
  console.log(`Total Tablas: ${report.tables.length}`);
  console.log(`Total Políticas RLS: ${report.policies.length}`);
  console.log(`Total Triggers: ${report.triggers.length}`);
  console.log(`Total Funciones en public: ${report.functions.length}`);
  process.exit(0);
}

checkInventory().catch(err => {
  console.error(err);
  process.exit(1);
});

