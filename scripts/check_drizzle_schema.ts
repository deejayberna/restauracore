import { db } from "@/db";
import { sql } from "drizzle-orm";

async function checkDrizzleSchema() {
  const schemas: any = await db.execute(sql`
    SELECT schema_name FROM information_schema.schemata;
  `);
  console.log("Esquemas en la BD:", (schemas.rows || schemas).map((r: any) => r.schema_name));

  const tables: any = await db.execute(sql`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name LIKE '%drizzle%' OR table_name LIKE '%migration%';
  `);
  console.log("Tablas relacionadas a migraciones:", tables.rows || tables);
  process.exit(0);
}

checkDrizzleSchema().catch(console.error);

