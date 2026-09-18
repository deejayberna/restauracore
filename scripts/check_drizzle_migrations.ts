import { db } from "@/db";
import { sql } from "drizzle-orm";

async function checkDrizzleMigrations() {
  const result: any = await db.execute(sql`
    SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
  `);
  console.log("=== MIGRACIONES EN drizzle.__drizzle_migrations ===");
  console.table(result.rows || result);
  process.exit(0);
}

checkDrizzleMigrations().catch(console.error);

