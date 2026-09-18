import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  logAuditoria,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  obtenerDestinatariosRestaurante,
  notificarAdminFallbackRestauranteSinDestinatarios,
} from "@/lib/notificaciones-destinatarios";
import { enviarNotificacionRoboSospechoso } from "@/lib/notificaciones";
import * as crypto from "crypto";

describe("Arquitectura Multi-tenant de Alertas", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      TELEGRAM_BOT_TOKEN: "mock_bot_token_123",
      TELEGRAM_CHAT_ID_GERENTE: "999888777",
      RESEND_API_KEY: "re_mock_key_123",
      RESEND_FROM_EMAIL: "alertas@restauracore.com",
      GERENTE_EMAIL: "admin-sistema@restauracore.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("test (a): alerta de robo sospechado en restaurante con email_alertas configurado llega a ESE correo y no al GERENTE_EMAIL global", async () => {
    const timestamp = Date.now();
    const emailPropioRestaurante = `alertas-propio-${timestamp}@restaurante-a.com`;

    // 1. Crear restaurante con email_alertas configurado
    const [rest] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante A ${timestamp}`,
        email_alertas: emailPropioRestaurante,
        telegram_chat_id: "111222333",
      })
      .returning();

    // 2. Resolver destinatarios usando el helper centralizado
    const destinatarios = await obtenerDestinatariosRestaurante(rest.id);

    expect(destinatarios.chat_id).toBe("111222333");
    expect(destinatarios.emails).toContain(emailPropioRestaurante);
    expect(destinatarios.emails).not.toContain("admin-sistema@restauracore.com");

    // 3. Simular despacho de notificación y espiar fetch (Resend / Telegram)
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "mock_email_id" }),
      } as any;
    });

    await enviarNotificacionRoboSospechoso({
      restaurante: rest.nombre,
      ingrediente: "Corte New York",
      cantidad: 3,
      unidad: "kg",
      registrado_por_nombre: "Mesero Juan",
      registrado_por_email: "juan@test.com",
      registrado_por_rol: "mesero",
      movimiento_id: crypto.randomUUID(),
      destinatario_email: destinatarios.emails,
      chat_id: destinatarios.chat_id,
    });

    // 4. Verificar que Resend recibió 'to' con el email del restaurante, NUNCA el global
    const resendCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes("api.resend.com/emails")
    );
    expect(resendCall).toBeDefined();

    const bodyEnviado = JSON.parse((resendCall![1] as any).body);
    expect(bodyEnviado.to).toBe(emailPropioRestaurante);
    expect(bodyEnviado.to).not.toBe("admin-sistema@restauracore.com");

    // 5. Verificar que Telegram fue enviado al chat_id del restaurante
    const telegramCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes("api.telegram.org")
    );
    expect(telegramCall).toBeDefined();
    const bodyTelegram = JSON.parse((telegramCall![1] as any).body);
    expect(bodyTelegram.chat_id).toBe("111222333");
    expect(bodyTelegram.chat_id).not.toBe("999888777");
  });

  it("test (b): un restaurante con 2 dueños vinculados envía la alerta a AMBOS dueños", async () => {
    const timestamp = Date.now();
    const emailDueno1 = `dueno1-${timestamp}@restaurante-b.com`;
    const emailDueno2 = `dueno2-${timestamp}@restaurante-b.com`;

    // 1. Crear restaurante sin email_alertas específico
    const [rest] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante B Multi-Dueño ${timestamp}`,
      })
      .returning();

    // 2. Crear 2 usuarios
    const [usuario1] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_dueno1_${timestamp}`,
        nombre: "Dueño 1",
        email: emailDueno1,
        activo: true,
      })
      .returning();

    const [usuario2] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_dueno2_${timestamp}`,
        nombre: "Dueño 2",
        email: emailDueno2,
        activo: true,
      })
      .returning();

    // 3. Vincular a ambos como 'dueno' activos
    await db.insert(usuarioRestaurantes).values([
      {
        usuario_id: usuario1.id,
        restaurante_id: rest.id,
        rol: "dueno",
        activo: true,
      },
      {
        usuario_id: usuario2.id,
        restaurante_id: rest.id,
        rol: "dueno",
        activo: true,
      },
    ]);

    // 4. Resolver destinatarios
    const destinatarios = await obtenerDestinatariosRestaurante(rest.id);

    // Debe contener exactamente ambos correos
    expect(destinatarios.emails).toHaveLength(2);
    expect(destinatarios.emails).toContain(emailDueno1);
    expect(destinatarios.emails).toContain(emailDueno2);

    // 5. Verificar que enviarNotificacionRoboSospechoso entrega a la lista completa
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "mock_id" }),
      } as any;
    });

    await enviarNotificacionRoboSospechoso({
      restaurante: rest.nombre,
      ingrediente: "Botella Mezcal",
      cantidad: 1,
      unidad: "botella",
      registrado_por_nombre: "Cajero Mario",
      registrado_por_email: "mario@test.com",
      registrado_por_rol: "cajero",
      movimiento_id: crypto.randomUUID(),
      destinatario_email: destinatarios.emails,
    });

    const resendCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes("api.resend.com/emails")
    );
    expect(resendCall).toBeDefined();
    const bodyEnviado = JSON.parse((resendCall![1] as any).body);
    expect(bodyEnviado.to).toEqual(expect.arrayContaining([emailDueno1, emailDueno2]));
  });

  it("test (c): restaurante sin ningún destinatario configurado dispara fallback administrativo Y asienta RESTAURANTE_SIN_DESTINATARIO_ALERTAS en log_auditoria", async () => {
    const timestamp = Date.now();

    // 1. Crear restaurante sin email_alertas, sin telegram_chat_id y sin usuarios dueños vinculados
    const [rest] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante C Abandonado ${timestamp}`,
      })
      .returning();

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "mock_id" }),
      } as any;
    });

    // 2. Invocar resolución de destinatarios
    const destinatarios = await obtenerDestinatariosRestaurante(rest.id);

    expect(destinatarios.emails).toHaveLength(0);
    expect(destinatarios.chat_id).toBeUndefined();

    // 3. Verificar que se asentó RESTAURANTE_SIN_DESTINATARIO_ALERTAS en log_auditoria
    const auditoriaRows = await db
      .select()
      .from(logAuditoria)
      .where(
        and(
          eq(logAuditoria.restaurante_id, rest.id),
          eq(logAuditoria.accion, "RESTAURANTE_SIN_DESTINATARIO_ALERTAS")
        )
      );

    expect(auditoriaRows.length).toBeGreaterThanOrEqual(1);
    expect(auditoriaRows[0].tabla_afectada).toBe("restaurantes");

    // 4. Verificar que se disparó el fallback administrativo notificando al admin global
    const telegramAdminCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes("api.telegram.org")
    );
    expect(telegramAdminCall).toBeDefined();
    const bodyTelegram = JSON.parse((telegramAdminCall![1] as any).body);
    expect(bodyTelegram.chat_id).toBe("999888777"); // Chat ID del admin global
    expect(bodyTelegram.text).toContain("ALERTA DE SEGURIDAD DEL SISTEMA");

    const resendAdminCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes("api.resend.com/emails")
    );
    expect(resendAdminCall).toBeDefined();
    const bodyEmail = JSON.parse((resendAdminCall![1] as any).body);
    expect(bodyEmail.to).toBe("admin-sistema@restauracore.com"); // Email del admin global
    expect(bodyEmail.subject).toContain("Restaurante sin destinatarios de alertas");
  });
});

