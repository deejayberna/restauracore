const fs = require('fs');
const path = require('path');

const envLocal = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const tokenMatch = envLocal.match(/TELEGRAM_BOT_TOKEN=([^\r\n]+)/);

if (!tokenMatch) {
  console.error("No TELEGRAM_BOT_TOKEN found");
  process.exit(1);
}

const token = tokenMatch[1].trim();

async function main() {
  console.log("=== TELEGRAM getWebhookInfo ===");
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  console.log("\n=== TEST PING TO VERCEL PRODUCTION WEBHOOK ===");
  try {
    const postRes = await fetch("https://restauracore.vercel.app/api/webhooks/telegram-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        update_id: 999999999,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 12345678, type: "private" },
          text: "/ping_test"
        }
      })
    });
    console.log("Status:", postRes.status, postRes.statusText);
    const body = await postRes.text();
    console.log("Response body:", body);
  } catch (err) {
    console.error("Error pinging webhook:", err);
  }
}

main();
