import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN no encontrado.");
  process.exit(1);
}

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secretToken) {
  console.error("TELEGRAM_WEBHOOK_SECRET no encontrado en el entorno.");
  process.exit(1);
}

const webhookUrl = "https://restautom.vercel.app/api/webhooks/telegram-bot";

async function setWebhook() {
  console.log(`Configurando webhook a: ${webhookUrl}`);
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
  });

  const data = await res.json();
  console.log("Respuesta setWebhook:", JSON.stringify(data, null, 2));

  console.log("\nConsultando getWebhookInfo...");
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const infoData = await infoRes.json();
  console.log("Respuesta getWebhookInfo (crudo):");
  console.log(JSON.stringify(infoData, null, 2));
}

setWebhook().catch(console.error);
