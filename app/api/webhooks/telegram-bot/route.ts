import { NextRequest, NextResponse } from "next/server";
import { procesarStartTelegram } from "@/lib/telegram-clientes";

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const message = update?.message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const text: string = message.text;
    const chatId: string = String(message.chat.id);
    const from = message.from;
    const nombre = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
    const username = from?.username;

    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const startPayload = parts.length > 1 ? parts[1].trim() : "";

      if (startPayload) {
        await procesarStartTelegram({
          chatId,
          nombre: nombre || undefined,
          username: username || undefined,
          startPayload,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[TelegramWebhook] Error procesando update:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

