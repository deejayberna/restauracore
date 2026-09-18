import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  registrosPendientes,
  stripeEventosProcesados,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  tienePermisoPlan,
  evaluarAccesoMultiSucursal,
  PLANES_DETALLE,
} from "@/lib/planes";
import { POST as stripeWebhookPOST } from "@/app/api/webhooks/stripe/route";
import { NextRequest } from "next/server";
import { activarRestaurantePorSesion } from "@/lib/registro-actions";

// Mock de Stripe Client y Supabase Admin
const mockCheckoutSessionsRetrieve = vi.fn();
const mockWebhooksConstructEvent = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        retrieve: mockCheckoutSessionsRetrieve,
      },
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  })),
  STRIPE_PRICES: {
    basico: "price_test_basico",
    pro: "price_test_pro",
    enterprise: "price_test_enterprise",
  },
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

// Mock de cookies de Next.js
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
  })),
}));

describe("Fase 11 — Membresías, Registro Self-Service y Webhooks Stripe", () => {
  const testEmailPrefix = `test_stripe_${Date.now()}`;
  let creadoRestauranteId: string | null = null;
  let creadoUsuarioId: string | null = null;
  let creadoRegistroPendienteId: string | null = null;

  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_key_12345";
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (creadoRegistroPendienteId) {
      await db
        .delete(registrosPendientes)
        .where(eq(registrosPendientes.id, creadoRegistroPendienteId))
        .catch(() => {});
    }
    if (creadoRestauranteId) {
      await db
        .delete(usuarioRestaurantes)
        .where(eq(usuarioRestaurantes.restaurante_id, creadoRestauranteId))
        .catch(() => {});
      await db
        .delete(restaurantes)
        .where(eq(restaurantes.id, creadoRestauranteId))
        .catch(() => {});
    }
    if (creadoUsuarioId) {
      await db
        .delete(usuarios)
        .where(eq(usuarios.id, creadoUsuarioId))
        .catch(() => {});
    }
  });

  describe("1. Feature Gating por Plan (Plan-Financiero-RestauraCore.md)", () => {
    it("Plan Básico solo permite menú, QR, KDS y cuenta abierta", () => {
      expect(tienePermisoPlan("basico", "menu_digital")).toBe(true);
      expect(tienePermisoPlan("basico", "pedido_qr")).toBe(true);
      expect(tienePermisoPlan("basico", "cocina_kds")).toBe(true);
      expect(tienePermisoPlan("basico", "cuenta_abierta")).toBe(true);

      // Bloquea Pro y Enterprise
      expect(tienePermisoPlan("basico", "arqueo_caja")).toBe(false);
      expect(tienePermisoPlan("basico", "inventario_automatico")).toBe(false);
      expect(tienePermisoPlan("basico", "alertas_stock")).toBe(false);
      expect(tienePermisoPlan("basico", "ia_prediccion")).toBe(false);
      expect(tienePermisoPlan("basico", "ia_anomalias")).toBe(false);
      expect(tienePermisoPlan("basico", "dashboard_multisucursal")).toBe(false);
    });

    it("Plan Pro desbloquea inventario, food cost, caja, mermas pero NO IA ni multi-sucursal", () => {
      expect(tienePermisoPlan("pro", "arqueo_caja")).toBe(true);
      expect(tienePermisoPlan("pro", "inventario_automatico")).toBe(true);
      expect(tienePermisoPlan("pro", "alertas_stock")).toBe(true);
      expect(tienePermisoPlan("pro", "food_cost")).toBe(true);
      expect(tienePermisoPlan("pro", "mermas_evidencia")).toBe(true);
      expect(tienePermisoPlan("pro", "control_cancelaciones")).toBe(true);

      // Bloquea Enterprise
      expect(tienePermisoPlan("pro", "ia_prediccion")).toBe(false);
      expect(tienePermisoPlan("pro", "ia_anomalias")).toBe(false);
      expect(tienePermisoPlan("pro", "ia_menu_engineering")).toBe(false);
      expect(tienePermisoPlan("pro", "dashboard_multisucursal")).toBe(false);
      expect(tienePermisoPlan("pro", "compras_proveedores")).toBe(false);
      expect(tienePermisoPlan("pro", "auditoria_avanzada")).toBe(false);
    });

    it("Plan Enterprise desbloquea todas las funcionalidades", () => {
      expect(tienePermisoPlan("enterprise", "ia_prediccion")).toBe(true);
      expect(tienePermisoPlan("enterprise", "ia_anomalias")).toBe(true);
      expect(tienePermisoPlan("enterprise", "ia_menu_engineering")).toBe(true);
      expect(tienePermisoPlan("enterprise", "dashboard_multisucursal")).toBe(true);
      expect(tienePermisoPlan("enterprise", "compras_proveedores")).toBe(true);
      expect(tienePermisoPlan("enterprise", "auditoria_avanzada")).toBe(true);
    });

    it("Regla Multi-Sucursal (Opción A): Se activa si AL MENOS una sucursal es Enterprise y filtra las demás", () => {
      // Dueño con 1 Enterprise y 1 Básico
      const resultadoA = evaluarAccesoMultiSucursal([
        { id: "rest-ent-1", nombre: "Sucursal Insurgentes", plan: "enterprise" },
        { id: "rest-bas-1", nombre: "Sucursal Condesa", plan: "basico" },
      ]);

      expect(resultadoA.permitido).toBe(true);
      expect(resultadoA.sucursalesConsolidadas).toHaveLength(1);
      expect(resultadoA.sucursalesConsolidadas[0].id).toBe("rest-ent-1");
      expect(resultadoA.sucursalesPendientesUpgrade).toHaveLength(1);
      expect(resultadoA.sucursalesPendientesUpgrade[0].id).toBe("rest-bas-1");

      // Dueño con solo sucursales Básicas o Pro
      const resultadoB = evaluarAccesoMultiSucursal([
        { id: "rest-pro-1", nombre: "Sucursal Norte", plan: "pro" },
        { id: "rest-bas-2", nombre: "Sucursal Sur", plan: "basico" },
      ]);

      expect(resultadoB.permitido).toBe(false);
      expect(resultadoB.sucursalesConsolidadas).toHaveLength(0);
      expect(resultadoB.sucursalesPendientesUpgrade).toHaveLength(2);
    });
  });

  describe("2. Webhook Stripe: Rechazo de firmas inválidas y seguridad", () => {
    it("Rechaza peticiones sin header stripe-signature con HTTP 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });

      const res = await stripeWebhookPOST(req);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("stripe-signature");
    });

    it("Rechaza peticiones con firma HMAC inválida con HTTP 400", async () => {
      mockWebhooksConstructEvent.mockImplementationOnce(() => {
        throw new Error("No signatures found matching the expected signature for payload");
      });

      const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "t=12345,v1=bad_signature",
        },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });

      const res = await stripeWebhookPOST(req);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("Firma de webhook inválida");
    });
  });

  describe("3. Arquitectura Webhook-First y Creación Condicional", () => {
    const emailTest = `${testEmailPrefix}@restauracore.com`;
    const restNombreTest = `Tacos Test Stripe ${Date.now()}`;
    const sessionIdTest = `cs_test_${Date.now()}`;
    const customerIdTest = `cus_test_${Date.now()}`;
    const subIdTest = `sub_test_${Date.now()}`;

    it("Registro pendiente NO crea usuarios ni restaurantes antes de la confirmación de pago", async () => {
      // Simulamos la inserción temporal en registros_pendientes con password_hash
      const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [reg] = await db
        .insert(registrosPendientes)
        .values({
          email: emailTest,
          password_hash: "pbkdf2_hashed_secret_test",
          nombre_dueno: "Carlos Dueño Test",
          nombre_restaurante: restNombreTest,
          plan: "pro",
          stripe_session_id: sessionIdTest,
          expira_en: expiraEn,
        })
        .returning();

      creadoRegistroPendienteId = reg.id;

      // Verificamos que NO existe en usuarios ni en restaurantes
      const usuarioEncontrado = await db.query.usuarios.findFirst({
        where: eq(usuarios.email, emailTest),
      });
      const restauranteEncontrado = await db.query.restaurantes.findFirst({
        where: eq(restaurantes.nombre, restNombreTest),
      });

      expect(usuarioEncontrado).toBeUndefined();
      expect(restauranteEncontrado).toBeUndefined();
    });

    it("El webhook/activación atómica crea usuario, restaurante y vínculo 'dueno' al confirmarse el pago", async () => {
      // Mockeamos la sesión de Stripe completada
      mockCheckoutSessionsRetrieve.mockResolvedValueOnce({
        id: sessionIdTest,
        status: "complete",
        customer: customerIdTest,
        subscription: subIdTest,
        client_reference_id: creadoRegistroPendienteId,
      });

      const res = await activarRestaurantePorSesion(sessionIdTest);
      expect(res.status).toBe("completado");
      expect(res.restauranteId).toBeDefined();
      expect(res.duenoId).toBeDefined();

      creadoRestauranteId = res.restauranteId!;
      creadoUsuarioId = res.duenoId!;

      // Verificar que el restaurante existe y tiene sus datos de suscripción correctos
      const rest = await db.query.restaurantes.findFirst({
        where: eq(restaurantes.id, creadoRestauranteId),
      });
      expect(rest).toBeDefined();
      expect(rest?.nombre).toBe(restNombreTest);
      expect(rest?.plan).toBe("pro");
      expect(rest?.estado_suscripcion).toBe("trial");
      expect(rest?.stripe_customer_id).toBe(customerIdTest);
      expect(rest?.stripe_subscription_id).toBe(subIdTest);

      // Verificar que el usuario existe y tiene rol 'dueno'
      const vinculo = await db.query.usuarioRestaurantes.findFirst({
        where: and(
          eq(usuarioRestaurantes.usuario_id, creadoUsuarioId),
          eq(usuarioRestaurantes.restaurante_id, creadoRestauranteId)
        ),
      });
      expect(vinculo).toBeDefined();
      expect(vinculo?.rol).toBe("dueno");
      expect(vinculo?.activo).toBe(true);

      // Verificar que registros_pendientes quedó marcado como completado
      const regActualizado = await db.query.registrosPendientes.findFirst({
        where: eq(registrosPendientes.id, creadoRegistroPendienteId!),
      });
      expect(regActualizado?.completado).toBe(true);
    });

    it("Idempotencia del webhook: eventos repetidos devuelven 200 sin duplicar registros", async () => {
      const eventoId = `evt_test_idempotency_${Date.now()}`;

      // Insertar el evento en la tabla de procesados
      await db.insert(stripeEventosProcesados).values({
        id: eventoId,
        tipo: "checkout.session.completed",
      });

      mockWebhooksConstructEvent.mockReturnValueOnce({
        id: eventoId,
        type: "checkout.session.completed",
        data: { object: { id: sessionIdTest } },
      });

      const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "t=123,v1=valid_sig",
        },
        body: JSON.stringify({ id: eventoId }),
      });

      const res = await stripeWebhookPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.yaProcesado).toBe(true);

      // Limpiar evento de prueba
      await db
        .delete(stripeEventosProcesados)
        .where(eq(stripeEventosProcesados.id, eventoId));
    });

    it("Manejo de invoice.payment_failed: marca estado_suscripcion como pago_fallido sin revocar datos", async () => {
      const eventoFalloId = `evt_test_fail_${Date.now()}`;

      mockWebhooksConstructEvent.mockReturnValueOnce({
        id: eventoFalloId,
        type: "invoice.payment_failed",
        data: {
          object: {
            id: `in_fail_${Date.now()}`,
            customer: customerIdTest,
            amount_due: 149900,
            attempt_count: 1,
          },
        },
      });

      const req = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "t=123,v1=valid_sig",
        },
        body: JSON.stringify({ id: eventoFalloId }),
      });

      const res = await stripeWebhookPOST(req);
      expect(res.status).toBe(200);

      // Verificar que el restaurante pasó a 'pago_fallido'
      const rest = await db.query.restaurantes.findFirst({
        where: eq(restaurantes.id, creadoRestauranteId!),
      });
      expect(rest?.estado_suscripcion).toBe("pago_fallido");

      // Limpiar evento
      await db
        .delete(stripeEventosProcesados)
        .where(eq(stripeEventosProcesados.id, eventoFalloId));
    });
  });
});

