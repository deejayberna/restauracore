import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function getBotInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN no encontrado en .env.local");
    process.exit(1);
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    console.log("Respuesta de Telegram getMe:", JSON.stringify(data, null, 2));
    if (data.ok && data.result?.username) {
      console.log(`BOT_USERNAME: @${data.result.username}`);
    }
  } catch (error) {
    console.error("Error al consultar Telegram getMe:", error);
  }
}

getBotInfo();

