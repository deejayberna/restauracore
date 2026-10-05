import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(process.cwd(), ".env.production.local"), override: true });

import postgres from "postgres";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL no definida");

  const sql = postgres(dbUrl, { max: 1 });

  try {
    const [restaurante] = await sql`SELECT id, nombre FROM restaurantes LIMIT 1;`;
    if (!restaurante) {
      console.error("No se encontró restaurante en producción");
      return;
    }

    const [orden] = await sql`SELECT id FROM ordenes WHERE restaurante_id = ${restaurante.id} LIMIT 1;`;

    const crypto = await import("crypto");
    const randomHex = crypto.randomBytes(8).toString("hex");
    const codigo = `v_${randomHex}`;
    const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO vinculaciones_telegram_pendientes (codigo, restaurante_id, orden_id, expira_en)
      VALUES (${codigo}, ${restaurante.id}, ${orden ? orden.id : null}, ${expiraEn});
    `;

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "RestauraninverBot";
    const link = `https://t.me/${botUsername}?start=${codigo}`;

    console.log("=== DEEP LINK REAL GENERADO EN PRODUCCIÓN ===");
    console.log("Restaurante:", restaurante.nombre, `(${restaurante.id})`);
    console.log("Orden:", orden ? orden.id : "Sin orden");
    console.log("Código único (24h):", codigo);
    console.log("Expira en:", expiraEn.toISOString());
    console.log("URL de Telegram:", link);
    console.log("=============================================");
  } finally {
    await sql.end();
  }
}

main().catch(console.error);
