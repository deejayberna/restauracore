import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function testRlsSql() {
  console.log("Validando y aplicando db/rls.sql...");
  const sqlContent = fs.readFileSync(path.join(process.cwd(), "db", "rls.sql"), "utf-8");
  
  await db.execute(sql.raw(sqlContent));
  console.log("✓ db/rls.sql ejecutado exitosamente sin errores.");
  process.exit(0);
}

testRlsSql().catch(err => {
  console.error("Error al ejecutar rls.sql:", err);
  process.exit(1);
});

