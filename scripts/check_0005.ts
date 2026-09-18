import { db } from "@/db";
import { sql } from "drizzle-orm";

async function check0005() {
  const res: any = await db.execute(sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'usuario_restaurantes' AND column_name = 'invitacion_pendiente';
  `);
  console.log("Columna invitacion_pendiente:", res.rows || res);
  process.exit(0);
}

check0005().catch(console.error);

