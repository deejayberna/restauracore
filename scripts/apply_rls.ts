import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function applyRls() {
  console.log("Aplicando db/rls.sql consolidado en PostgreSQL...");
  const sqlPath = path.join(process.cwd(), "db", "rls.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  await db.execute(sql.raw(sqlContent));
  console.log("✓ db/rls.sql consolidado aplicado con éxito en la base de datos.");
  process.exit(0);
}

applyRls().catch((err) => {
  console.error("Error aplicando db/rls.sql:", err);
  process.exit(1);
});

