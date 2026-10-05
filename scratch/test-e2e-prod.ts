import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(process.cwd(), ".env.production.local"), override: true });

import postgres from "postgres";

async function testE2E() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL no definida en .env.production.local");

  const sql = postgres(dbUrl, { max: 1 });

  try {
    console.log("=== 1. BUSCANDO RESTAURANTE Y ORDEN EN PRODUCCIÓN ===");
    const [restaurante] = await sql`SELECT id, nombre, plan FROM restaurantes LIMIT 1;`;
    if (!restaurante) {
      console.error("No hay restaurantes en producción.");
      return;
    }
    console.log("Restaurante encontrado:", restaurante);

    // Buscar una orden existente o usar null
    const [orden] = await sql`SELECT id FROM ordenes WHERE restaurante_id = ${restaurante.id} LIMIT 1;`;
    console.log("Orden para prueba:", orden ? orden.id : "Ninguna (usando null)");

    const testCodigo = `v_prodtest_${Date.now()}`;
    const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000);

    console.log("\n=== 2. INSERTANDO VINCULACIÓN PENDIENTE DE PRUEBA EN PRODUCCIÓN ===");
    console.log(`Código generado: ${testCodigo}`);
    await sql`
      INSERT INTO vinculaciones_telegram_pendientes (codigo, restaurante_id, orden_id, expira_en)
      VALUES (${testCodigo}, ${restaurante.id}, ${orden ? orden.id : null}, ${expiraEn});
    `;
    console.log("✓ Vinculación pendiente insertada correctamente.");

    // Verificar que esté en la tabla
    const [pendiente] = await sql`
      SELECT * FROM vinculaciones_telegram_pendientes WHERE codigo = ${testCodigo};
    `;
    console.log("Registro en vinculaciones_telegram_pendientes:", pendiente);

    console.log("\n=== 3. ENVIANDO WEBHOOK REAL A VERCEL PRODUCCIÓN (https://restautom.vercel.app/api/webhooks/telegram-bot) ===");
    const testChatId = "423720063"; // Chat ID real del gerente/dueño
    const payload = {
      update_id: 1000001,
      message: {
        message_id: 9999,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: testChatId,
          type: "private",
          first_name: "Bernardo",
        },
        from: {
          id: testChatId,
          first_name: "Bernardo",
          username: "deejayberna",
        },
        text: `/start ${testCodigo}`,
      },
    };

    const webhookRes = await fetch("https://restautom.vercel.app/api/webhooks/telegram-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("Status HTTP del Webhook en Vercel:", webhookRes.status, webhookRes.statusText);
    const responseBody = await webhookRes.text();
    console.log("Respuesta cruda del Webhook:", responseBody);

    console.log("\n=== 4. VERIFICANDO IMPACTO EN BASE DE DATOS DE PRODUCCIÓN ===");
    // Debe haber consumido el código de vinculaciones_telegram_pendientes
    const pendienteDespues = await sql`
      SELECT * FROM vinculaciones_telegram_pendientes WHERE codigo = ${testCodigo};
    `;
    console.log("Vinculación pendiente tras webhook (debe estar vacía []):", pendienteDespues);

    // Debe haber insertado o actualizado el cliente en clientes_telegram
    const clientes = await sql`
      SELECT id, restaurante_id, chat_id_telegram, nombre_telegram, codigo_vinculacion, total_visitas, ultima_visita_en, activo
      FROM clientes_telegram
      WHERE chat_id_telegram = ${testChatId} AND restaurante_id = ${restaurante.id};
    `;
    console.log("Registro en clientes_telegram en producción:", JSON.stringify(clientes, null, 2));

  } finally {
    await sql.end();
  }
}

testE2E().catch((err) => {
  console.error("Error en test E2E:", err);
  process.exit(1);
});
