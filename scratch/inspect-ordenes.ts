import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const cols = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ordenes'
    ORDER BY ordinal_position;
  `);
  console.log("Columnas de ordenes:", cols);

  const ordenesPagadas = await db.execute(sql`
    SELECT * FROM ordenes WHERE estado = 'pagado';
  `);
  console.log("Órdenes pagadas:", ordenesPagadas);

  process.exit(0);
}

main().catch((e) => {
  console.error("Error inspecting ordenes:", e);
  process.exit(1);
});

