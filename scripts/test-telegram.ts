import { config } from "dotenv";
config({ path: ".env.local" });

import { enviarNotificacionAlerta } from "../lib/notificaciones";

async function main() {
  console.log("📤 Enviando notificación de prueba a Telegram...");

  await enviarNotificacionAlerta({
    ingrediente: "Pollo A",
    nivel: "critico",
    stock_actual: "0.100",
    stock_minimo: "5.000",
    unidad: "kg",
    restaurante: "Restaurante A — La Hacienda",
    destinatario_email: "gerente@test.com",
  });

  console.log("✅ Listo — revisa tu Telegram");
}

main().catch(console.error);
