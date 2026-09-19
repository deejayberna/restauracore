import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  recordatoriosTrialEnviados,
  logAuditoria,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { registrarRestauranteDirectoAction } from "@/lib/registro-actions";
import { resetRateLimits } from "@/lib/rate-limiter";
import { validarTurnstileToken } from "@/lib/turnstile";
import { evaluarEstadoMembresia } from "@/lib/planes";
import { GET as recordatorioTrialCronGET } from "@/app/api/cron/recordatorio-trial/route";
import { NextRequest } from "next/server";
import * as notificaciones from "@/lib/notificaciones";

// Mock de Supabase Admin y Server
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      resend: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        createUser: vi.fn(async ({ email, user_metadata }: any) => ({
          data: {
            user: {
              id: `auth-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              email,
              user_metadata,
            },
          },
          error: null,
        })),
        listUsers: vi.fn(async () => ({
          data: { users: [] },
          error: null,
        })),
      },
    },
  })),
}));

describe("Seguridad del Registro y Cron de Recordatorios de Trial (Días 12 y 13)", () => {
  const timestamp = Date.now();
  const createdRestauranteIds: string[] = [];
  const createdUsuarioIds: string[] = [];

  afterAll(async () => {
    for (const restId of createdRestauranteIds) {
      await db.delete(recordatoriosTrialEnviados).where(eq(recordatoriosTrialEnviados.restaurante_id, restId)).catch(() => {});
      await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restId)).catch(() => {});
      await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restId)).catch(() => {});
      await db.delete(restaurantes).where(eq(restaurantes.id, restId)).catch(() => {});
    }
    for (const uId of createdUsuarioIds) {
      await db.delete(usuarios).where(eq(usuarios.id, uId)).catch(() => {});
    }
  });

  describe("1. Seguridad en /registro: Rate Limiting y Captcha", () => {
    it("Rate Limiting: bloquea el 4to intento de registro consecutivo desde la misma IP", async () => {
      resetRateLimits();

      // Los primeros 3 intentos deben proceder más allá del rate limiter
      for (let i = 1; i <= 3; i++) {
        const email = `ratelimit_${i}_${timestamp}@testrest.com`;
        const res = await registrarRestauranteDirectoAction({
          nombreRestaurante: `Restaurante RL ${i}`,
          nombreDueno: `Dueño RL ${i}`,
          email,
          password: "PasswordSegura123!",
          plan: "basico",
          timezone: "America/Mexico_City",
        });

        expect(res.success).toBe(true);
        expect(res.requiereConfirmacion).toBe(true);
        if (res.restauranteId) createdRestauranteIds.push(res.restauranteId);
        if (res.duenoId) createdUsuarioIds.push(res.duenoId);
      }

      // El 4to intento desde la misma IP (127.0.0.1) DEBE ser rechazado por rate limiting
      const res4 = await registrarRestauranteDirectoAction({
        nombreRestaurante: `Restaurante RL 4`,
        nombreDueno: `Dueño RL 4`,
        email: `ratelimit_4_${timestamp}@testrest.com`,
        password: "PasswordSegura123!",
        plan: "basico",
        timezone: "America/Mexico_City",
      });

      expect(res4.success).toBeUndefined();
      expect(res4.error).toMatch(/Demasiados intentos de registro/i);
    });

    it("Turnstile: en producción sin TURNSTILE_SECRET_KEY configurada, falla de forma visible y ruidosa", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalSecret = process.env.TURNSTILE_SECRET_KEY;
      const originalVitest = process.env.VITEST;

      try {
        (process.env as any).NODE_ENV = "production";
        delete process.env.TURNSTILE_SECRET_KEY;
        delete process.env.VITEST;

        const resultado = await validarTurnstileToken("dummy_token", "127.0.0.1");
        expect(resultado.success).toBe(false);
        expect(resultado.error).toMatch(/no está disponible temporalmente/i);
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
        if (originalSecret) process.env.TURNSTILE_SECRET_KEY = originalSecret;
        if (originalVitest) process.env.VITEST = originalVitest;
      }
    });
  });

  describe("2. Cron de Recordatorios de Trial (Días 12 y 13)", () => {
    let restauranteTrial: any;
    let duenoTrial: any;

    beforeAll(async () => {
      // Crear restaurante con trial que vence en exactamente 2 días
      const dosDiasAdelante = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 - 1000); // ~47.9h
      const [r] = await db
        .insert(restaurantes)
        .values({
          nombre: `Restaurante Trial Aviso ${timestamp}`,
          timezone: "America/Mexico_City",
          plan: "pro",
          estado_suscripcion: "trial",
          fecha_fin_trial: dosDiasAdelante,
        })
        .returning();
      restauranteTrial = r;
      createdRestauranteIds.push(r.id);

      const [u] = await db
        .insert(usuarios)
        .values({
          auth_id: `auth-trial-${timestamp}`,
          nombre: `Dueño Trial Aviso`,
          email: `dueno_trial_${timestamp}@test.com`,
          activo: true,
        })
        .returning();
      duenoTrial = u;
      createdUsuarioIds.push(u.id);

      await db.insert(usuarioRestaurantes).values({
        usuario_id: u.id,
        restaurante_id: r.id,
        rol: "dueno",
        activo: true,
      });
    });

    it("Rechaza peticiones sin header de autorización CRON_SECRET con HTTP 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/recordatorio-trial");
      const res = await recordatorioTrialCronGET(req);
      expect(res.status).toBe(401);
    });

    it("Envía recordatorio de 2 días y registra idempotencia atómica en BD", async () => {
      const spyNotif = vi.spyOn(notificaciones, "enviarNotificacionRecordatorioTrial").mockResolvedValue();

      const cronSecret = process.env.CRON_SECRET || "cron-test-secret";
      process.env.CRON_SECRET = cronSecret;

      const req = new NextRequest("http://localhost:3000/api/cron/recordatorio-trial?force=true", {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      const res = await recordatorioTrialCronGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.resultados).toBeDefined();

      const resEsteRest = data.resultados.find((item: any) => item.restaurante_id === restauranteTrial.id);
      expect(resEsteRest).toBeDefined();
      expect(resEsteRest.procesado).toBe(true);
      expect(resEsteRest.diasRestantes).toBe(2);

      expect(spyNotif).toHaveBeenCalled();

      // Verificar que se guardó en la tabla de idempotencia
      const registroIdemp = await db.query.recordatoriosTrialEnviados.findFirst({
        where: and(
          eq(recordatoriosTrialEnviados.restaurante_id, restauranteTrial.id),
          eq(recordatoriosTrialEnviados.dias_restantes, 2)
        ),
      });
      expect(registroIdemp).toBeDefined();

      spyNotif.mockRestore();
    });

    it("Idempotencia estricta: una segunda ejecución omite el restaurante por duplicado", async () => {
      const spyNotif = vi.spyOn(notificaciones, "enviarNotificacionRecordatorioTrial").mockResolvedValue();

      const cronSecret = process.env.CRON_SECRET || "cron-test-secret";
      const req = new NextRequest("http://localhost:3000/api/cron/recordatorio-trial?force=true", {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      const res = await recordatorioTrialCronGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      const resEsteRest = data.resultados.find((item: any) => item.restaurante_id === restauranteTrial.id);
      expect(resEsteRest).toBeDefined();
      expect(resEsteRest.procesado).toBe(false);
      expect(resEsteRest.omitido_por_duplicado).toBe(true);

      // No debió enviar notificación nuevamente
      expect(spyNotif).not.toHaveBeenCalled();

      spyNotif.mockRestore();
    });

    it("Mecanismo anti-silencio: si el canal de notificación falla, asienta FALLO_ENVIO_RECORDATORIO_TRIAL en log_auditoria", async () => {
      // Crear restaurante con 1 día restante
      const unDiaAdelante = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 - 1000);
      const [rest1d] = await db
        .insert(restaurantes)
        .values({
          nombre: `Restaurante Fallo Anti-Silencio ${timestamp}`,
          timezone: "America/Mexico_City",
          plan: "enterprise",
          estado_suscripcion: "trial",
          fecha_fin_trial: unDiaAdelante,
        })
        .returning();
      createdRestauranteIds.push(rest1d.id);

      // Simular fallo en envío de notificación
      const spyNotif = vi
        .spyOn(notificaciones, "enviarNotificacionRecordatorioTrial")
        .mockRejectedValueOnce(new Error("Fallo de conexión simulado con Resend y Telegram"));

      const cronSecret = process.env.CRON_SECRET || "cron-test-secret";
      const req = new NextRequest("http://localhost:3000/api/cron/recordatorio-trial?force=true", {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      const res = await recordatorioTrialCronGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      const resItem = data.resultados.find((i: any) => i.restaurante_id === rest1d.id);
      expect(resItem).toBeDefined();
      expect(resItem.procesado).toBe(false);
      expect(resItem.error).toMatch(/Fallo de conexión simulado/i);

      // Verificar que el fallo NO fue silencioso: está registrado en log_auditoria
      const log = await db.query.logAuditoria.findFirst({
        where: and(
          eq(logAuditoria.restaurante_id, rest1d.id),
          eq(logAuditoria.accion, "FALLO_ENVIO_RECORDATORIO_TRIAL")
        ),
      });

      expect(log).toBeDefined();
      expect((log?.valores_nuevos as any)?.dias_restantes).toBe(1);

      spyNotif.mockRestore();
    });
  });

  describe("3. Bloqueo en Día 15+ (Paywall)", () => {
    it("Un restaurante en día 15+ (trial expirado) es evaluado como bloqueado con motivo 'trial_vencido'", () => {
      const ahora = new Date();
      const ayer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);

      const evaluacion = evaluarEstadoMembresia({
        estado_suscripcion: "trial",
        fecha_fin_trial: ayer,
      });

      expect(evaluacion.bloqueado).toBe(true);
      expect(evaluacion.motivoBloqueo).toBe("trial_vencido");
      expect(evaluacion.debeMostrarRecordatorio).toBe(false);
      expect(evaluacion.diasRestantesTrial).toBe(0);
    });
  });
});

