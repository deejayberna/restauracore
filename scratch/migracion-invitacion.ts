import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Aplicando migración invitacion_pendiente a PostgreSQL...");
  await db.execute(sql`
    ALTER TABLE usuario_restaurantes 
    ADD COLUMN IF NOT EXISTS invitacion_pendiente BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  console.log("Columna invitacion_pendiente agregada exitosamente.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en migración:", err);
  process.exit(1);
});

