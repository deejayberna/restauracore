import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  mesas,
  ordenes,
  clientesTelegram,
  vinculacionesTelegramPendientes,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  generarLinkVinculacionTelegram,
  procesarStartTelegram,
  obtenerClientesTelegram,
  enviarMensajeRecuperacion,
  notificarPedidoListoTelegram,
  notificarPedidoCanceladoTelegram,
} from "@/lib/telegram-clientes";
import { tienePermisoPlan } from "@/lib/planes";
import { NextRequest } from "next/server";
import { POST as telegramWebhookPOST } from "@/app/api/webhooks/telegram-bot/route";

describe("Retención y Recuperación de Clientes vía Telegram", () => {
  const originalEnv = process.env;
  let restauranteAId: string;
  let restauranteBId: string;
  let ordenAId: string;
  let ordenBId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      TELEGRAM_BOT_TOKEN: "mock_token_telegram_retencion",
      NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "RestauraninverBot",
    };

    const ts = Date.now();

    // Crear dos restaurantes para pruebas de aislamiento multi-tenant
    const [restA] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Test A ${ts}`,
        plan: "enterprise",
      })
      .returning();
    restauranteAId = restA.id;

    const [restB] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Test B ${ts}`,
        plan: "pro", // No enterprise para probar permisos
      })
      .returning();
    restauranteBId = restB.id;

    // Crear mesas
    const [mesaA] = await db
      .insert(mesas)
      .values({
        restaurante_id: restauranteAId,
        numero: 1,
        qr_token: `qr_a_${ts}`,
      })
      .returning();

    const [mesaB] = await db
      .insert(mesas)
      .values({
        restaurante_id: restauranteBId,
        numero: 2,
        qr_token: `qr_b_${ts}`,
      })
      .returning();

    // Crear órdenes en estado 'abierta' (enum cuenta_estado)
    const [ordA] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restauranteAId,
        mesa_id: mesaA.id,
        estado: "abierta",
        subtotal: "100.00",
        total: "100.00",
      })
      .returning();
    ordenAId = ordA.id;

    const [ordB] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restauranteBId,
        mesa_id: mesaB.id,
        estado: "abierta",
        subtotal: "150.00",
        total: "150.00",
      })
      .returning();
    ordenBId = ordB.id;
  });

  afterEach(async () => {
    process.env = originalEnv;

    // Limpieza de datos de prueba
    if (restauranteAId) {
      await db.delete(clientesTelegram).where(eq(clientesTelegram.restaurante_id, restauranteAId));
      await db.delete(vinculacionesTelegramPendientes).where(eq(vinculacionesTelegramPendientes.restaurante_id, restauranteAId));
      await db.delete(ordenes).where(eq(ordenes.restaurante_id, restauranteAId));
      await db.delete(mesas).where(eq(mesas.restaurante_id, restauranteAId));
      await db.delete(restaurantes).where(eq(restaurantes.id, restauranteAId));
    }
    if (restauranteBId) {
      await db.delete(clientesTelegram).where(eq(clientesTelegram.restaurante_id, restauranteBId));
      await db.delete(vinculacionesTelegramPendientes).where(eq(vinculacionesTelegramPendientes.restaurante_id, restauranteBId));
      await db.delete(ordenes).where(eq(ordenes.restaurante_id, restauranteBId));
      await db.delete(mesas).where(eq(mesas.restaurante_id, restauranteBId));
      await db.delete(restaurantes).where(eq(restaurantes.id, restauranteBId));
    }
  });

  it("1. Generación de deep-link: crea código corto temporal <= 64 caracteres compatible con Telegram", async () => {
    const { link, codigo } = await generarLinkVinculacionTelegram({
      ordenId: ordenAId,
      restauranteId: restauranteAId,
    });

    expect(link).toContain("https://t.me/RestauraninverBot?start=");
    expect(codigo.length).toBeLessThanOrEqual(64);
    expect(codigo).toMatch(/^v_[a-f0-9]+$/);

    // Verificar en BD
    const pendiente = await db.query.vinculacionesTelegramPendientes.findFirst({
      where: eq(vinculacionesTelegramPendientes.codigo, codigo),
    });
    expect(pendiente).toBeDefined();
    expect(pendiente?.restaurante_id).toBe(restauranteAId);
    expect(pendiente?.orden_id).toBe(ordenAId);
  });

  it("2. Webhook /start: vincula al cliente, envía bienvenida neutral sin falsas promesas y limpia el código", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return { ok: true, json: async () => ({ ok: true }), text: async () => "" } as any;
    });

    const { codigo } = await generarLinkVinculacionTelegram({
      ordenId: ordenAId,
      restauranteId: restauranteAId,
    });

    const res = await procesarStartTelegram({
      chatId: "987654321",
      nombre: "Carlos Gómez",
      username: "cgomez",
      startPayload: codigo,
    });

    expect(res.ok).toBe(true);
    expect(res.restauranteNombre).toContain("Restaurante Test A");

    // Verificar mensaje enviado por Telegram
    expect(fetchSpy).toHaveBeenCalled();
    const telegramCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes("api.telegram.org")
    );
    expect(telegramCall).toBeDefined();
    const body = JSON.parse((telegramCall![1] as any).body);
    expect(body.chat_id).toBe("987654321");
    // Mensaje neutral sin prometer momento exacto
    expect(body.text).toContain("Te mantendremos al tanto del estado de tus pedidos y te compartiremos beneficios y promociones");

    // Verificar en BD clientes_telegram
    const cliente = await db.query.clientesTelegram.findFirst({
      where: and(
        eq(clientesTelegram.restaurante_id, restauranteAId),
        eq(clientesTelegram.chat_id_telegram, "987654321")
      ),
    });
    expect(cliente).toBeDefined();
    expect(cliente?.nombre_telegram).toBe("Carlos Gómez");
    expect(cliente?.total_visitas).toBe(1);

    // Código pendiente debe haber sido consumido
    const pendienteDespues = await db.query.vinculacionesTelegramPendientes.findFirst({
      where: eq(vinculacionesTelegramPendientes.codigo, codigo),
    });
    expect(pendienteDespues).toBeUndefined();
  });

  it("3. Visita recurrente: si el mismo comensal vuelve a ordenar, incrementa total_visitas y actualiza última visita", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return { ok: true, json: async () => ({ ok: true }), text: async () => "" } as any;
    });

    // Primera visita
    const { codigo: cod1 } = await generarLinkVinculacionTelegram({
      ordenId: ordenAId,
      restauranteId: restauranteAId,
    });
    await procesarStartTelegram({
      chatId: "555123456",
      nombre: "Laura Díaz",
      startPayload: cod1,
    });

    // Segunda visita
    const { codigo: cod2 } = await generarLinkVinculacionTelegram({
      ordenId: ordenAId,
      restauranteId: restauranteAId,
    });
    await procesarStartTelegram({
      chatId: "555123456",
      nombre: "Laura Díaz Actualizada",
      startPayload: cod2,
    });

    const cliente = await db.query.clientesTelegram.findFirst({
      where: and(
        eq(clientesTelegram.restaurante_id, restauranteAId),
        eq(clientesTelegram.chat_id_telegram, "555123456")
      ),
    });
    expect(cliente?.total_visitas).toBe(2);
    expect(cliente?.nombre_telegram).toBe("Laura Díaz Actualizada");
  });

  it("4. Aislamiento Multi-Tenant estricto: un restaurante nunca ve ni puede mensajear a clientes de otro", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return { ok: true, json: async () => ({ ok: true }), text: async () => "" } as any;
    });

    // Cliente vinculado a Restaurante A
    const { codigo: codA } = await generarLinkVinculacionTelegram({
      ordenId: ordenAId,
      restauranteId: restauranteAId,
    });
    await procesarStartTelegram({
      chatId: "111111111",
      nombre: "Cliente de A",
      startPayload: codA,
    });

    // Cliente vinculado a Restaurante B
    const { codigo: codB } = await generarLinkVinculacionTelegram({
      ordenId: ordenBId,
      restauranteId: restauranteBId,
    });
    await procesarStartTelegram({
      chatId: "222222222",
      nombre: "Cliente de B",
      startPayload: codB,
    });

    // Consulta de Restaurante A: solo ve su cliente
    const reporteA = await obtenerClientesTelegram(restauranteAId, 21);
    expect(reporteA.clientes.map((c) => c.chatId)).toContain("111111111");
    expect(reporteA.clientes.map((c) => c.chatId)).not.toContain("222222222");

    // Consulta de Restaurante B: solo ve su cliente
    const reporteB = await obtenerClientesTelegram(restauranteBId, 21);
    expect(reporteB.clientes.map((c) => c.chatId)).toContain("222222222");
    expect(reporteB.clientes.map((c) => c.chatId)).not.toContain("111111111");

    // Intento de violación de aislamiento: Restaurante A intenta enviar mensaje al cliente de B
    const clienteB = reporteB.clientes[0];
    const intentoAtaque = await enviarMensajeRecuperacion({
      restauranteId: restauranteAId,
      clienteId: clienteB.id,
      mensaje: "Mensaje ilegítimo",
    });

    expect(intentoAtaque.ok).toBe(false);
    expect(intentoAtaque.error).toContain("no pertenece a este restaurante");
  });

  it("5. Detección de inactividad configurable y protección antispam de 7 días", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return { ok: true, json: async () => ({ ok: true }), text: async () => "" } as any;
    });

    // Crear cliente con última visita hace 25 días
    const hace25Dias = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
    const [clienteInactivo] = await db
      .insert(clientesTelegram)
      .values({
        restaurante_id: restauranteAId,
        chat_id_telegram: "777888999",
        nombre_telegram: "Cliente Inactivo",
        ultima_visita_en: hace25Dias,
        total_visitas: 1,
      })
      .returning();

    // Con umbral de 21 días -> Inactivo
    const datos21 = await obtenerClientesTelegram(restauranteAId, 21);
    const cli21 = datos21.clientes.find((c) => c.id === clienteInactivo.id);
    expect(cli21?.esInactivo).toBe(true);
    expect(datos21.inactivos).toBeGreaterThanOrEqual(1);

    // Con umbral de 30 días -> Aún no inactivo
    const datos30 = await obtenerClientesTelegram(restauranteAId, 30);
    const cli30 = datos30.clientes.find((c) => c.id === clienteInactivo.id);
    expect(cli30?.esInactivo).toBe(false);

    // Enviar primer mensaje de recuperación
    const envio1 = await enviarMensajeRecuperacion({
      restauranteId: restauranteAId,
      clienteId: clienteInactivo.id,
      mensaje: "¡Te extrañamos en el restaurante!",
    });
    expect(envio1.ok).toBe(true);

    // Intento inmediato de enviar un segundo mensaje (debe bloquear por antispam)
    const envio2 = await enviarMensajeRecuperacion({
      restauranteId: restauranteAId,
      clienteId: clienteInactivo.id,
      mensaje: "Segundo mensaje consecutivo",
    });
    expect(envio2.ok).toBe(false);
    expect(envio2.error).toContain("Por protección antispam se permite 1 cada 7 días");
  });

  it("6. Notificaciones transaccionales: aviso de pedido listo y aviso si la orden es cancelada", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return { ok: true, json: async () => ({ ok: true }), text: async () => "" } as any;
    });

    // Vincular cliente a la orden A
    await db.insert(clientesTelegram).values({
      restaurante_id: restauranteAId,
      chat_id_telegram: "333444555",
      nombre_telegram: "Comensal Mesa 1",
      orden_id_origen: ordenAId,
    });

    // Notificación de pedido listo
    const listoNotificado = await notificarPedidoListoTelegram(ordenAId);
    expect(listoNotificado).toBe(true);

    const callListo = fetchSpy.mock.calls.find(([url, opts]: any) => {
      return url.toString().includes("sendMessage") && opts.body.includes("está listo");
    });
    expect(callListo).toBeDefined();

    // Notificación de orden cancelada
    const canceladoNotificado = await notificarPedidoCanceladoTelegram(ordenAId);
    expect(canceladoNotificado).toBe(true);

    const callCancelado = fetchSpy.mock.calls.find(([url, opts]: any) => {
      return url.toString().includes("sendMessage") && opts.body.includes("ha sido cancelado");
    });
    expect(callCancelado).toBeDefined();
  });

  it("7. Feature Gating: la función está restringida exclusivamente al plan Enterprise", () => {
    expect(tienePermisoPlan("basico", "telegram_recuperacion")).toBe(false);
    expect(tienePermisoPlan("pro", "telegram_recuperacion")).toBe(false);
    expect(tienePermisoPlan("enterprise", "telegram_recuperacion")).toBe(true);
    expect(tienePermisoPlan(null, "telegram_recuperacion")).toBe(false);
  });

  it("8. Seguridad del Webhook: Validación de X-Telegram-Bot-Api-Secret-Token", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "super_secret_webhook_token_123";

    // 1. Sin header -> 401
    const reqSinHeader = new NextRequest("http://localhost:3000/api/webhooks/telegram-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: "hola" } }),
    });
    const resSinHeader = await telegramWebhookPOST(reqSinHeader);
    expect(resSinHeader.status).toBe(401);
    const bodySinHeader = await resSinHeader.json();
    expect(bodySinHeader.error).toBe("No autorizado");

    // 2. Header incorrecto -> 401
    const reqHeaderMal = new NextRequest("http://localhost:3000/api/webhooks/telegram-bot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": "token_invalido_xyz",
      },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: "hola" } }),
    });
    const resHeaderMal = await telegramWebhookPOST(reqHeaderMal);
    expect(resHeaderMal.status).toBe(401);
    const bodyHeaderMal = await resHeaderMal.json();
    expect(bodyHeaderMal.error).toBe("No autorizado");

    // 3. Variable no configurada en entorno -> 401
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const reqSinEnv = new NextRequest("http://localhost:3000/api/webhooks/telegram-bot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": "super_secret_webhook_token_123",
      },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: "hola" } }),
    });
    const resSinEnv = await telegramWebhookPOST(reqSinEnv);
    expect(resSinEnv.status).toBe(401);

    // 4. Header correcto -> 200
    process.env.TELEGRAM_WEBHOOK_SECRET = "super_secret_webhook_token_123";
    const reqCorrecto = new NextRequest("http://localhost:3000/api/webhooks/telegram-bot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": "super_secret_webhook_token_123",
      },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: "hola" } }),
    });
    const resCorrecto = await telegramWebhookPOST(reqCorrecto);
    expect(resCorrecto.status).toBe(200);
    const bodyCorrecto = await resCorrecto.json();
    expect(bodyCorrecto.ok).toBe(true);
  });
});
