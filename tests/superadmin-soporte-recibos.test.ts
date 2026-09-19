import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  ticketsSoporte,
  logAuditoria,
  mesas,
  platillos,
  categoriasMenu,
  ordenes,
  ordenItems,
  pagos,
  recordatoriosTrialEnviados,
} from "@/db/schema";

import { eq, and } from "drizzle-orm";
import {
  validarSuperAdmin,
  obtenerMetricasGlobalesAction,
  obtenerRestaurantesSuperAdminAction,
  extenderTrialAction,
  responderTicketAction,
  obtenerTodosTicketsAction,
} from "@/lib/superadmin-actions";
import {
  crearTicketSoporteAction,
  obtenerTicketsRestauranteAction,
} from "@/lib/soporte-actions";
import { obtenerDatosReciboAction } from "@/lib/recibo-actions";
import { UnauthorizedError } from "@/lib/errors";

// Variables de control dinámico de sesión para los tests
let mockAuthUserId = "";
let mockUserEmail = "";
let mockRestauranteActivoId = "";

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: mockAuthUserId
            ? { id: mockAuthUserId, email: mockUserEmail }
            : null,
        },
        error: null,
      })),
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((key: string) => {
      if (key === "restaurante_activo") return { value: mockRestauranteActivoId };
      return undefined;
    }),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock de notificaciones
vi.mock("@/lib/notificaciones", () => ({
  notificarNuevoTicketSoporte: vi.fn(async () => {}),
}));

describe("Suite: Comandas KDS, Recibos Térmicos, Soporte y Panel Super-Admin", () => {
  const ts = Date.now();
  let restTest: any;
  let duenoUser: any;
  let meseroUser: any;
  let adminUser: any;
  let ordenTest: any;

  beforeAll(async () => {
    process.env.SUPER_ADMIN_EMAILS = "superadmin@restauracore.com,admin@restauracore.com";

    // 1. Crear restaurante de prueba
    const [rest] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Test SaaS ${ts}`,
        plan: "basico",
        estado_suscripcion: "activa",
        fecha_fin_trial: null,
      })
      .returning();
    restTest = rest;


    // 2. Crear dueño del restaurante
    const [dueno] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_dueno_${ts}`,
        email: `dueno_${ts}@restauratest.com`,
        nombre: "Dueño Restaurante Test",
      })
      .returning();
    duenoUser = dueno;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: dueno.id,
      restaurante_id: rest.id,
      rol: "dueno",
      activo: true,
    });

    // 3. Crear mesero del restaurante
    const [mesero] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_mesero_${ts}`,
        email: `mesero_${ts}@restauratest.com`,
        nombre: "Mesero Test",
      })
      .returning();
    meseroUser = mesero;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: mesero.id,
      restaurante_id: rest.id,
      rol: "mesero",
      activo: true,
    });

    // 4. Crear usuario Super-Admin
    const [admin] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_admin_${ts}`,
        email: "superadmin@restauracore.com",
        nombre: "Super Admin Plataforma",
      })
      .returning();
    adminUser = admin;


    // 5. Crear mesa, platillo, orden y pagos para prueba de recibo
    const [mesa] = await db
      .insert(mesas)
      .values({
        restaurante_id: rest.id,
        numero: 12,
        qr_token: `qr_mesa_${ts}`,
      })
      .returning();

    const [cat] = await db
      .insert(categoriasMenu)
      .values({
        restaurante_id: rest.id,
        nombre: `Bebidas ${ts}`,
        orden: 1,
      })
      .returning();

    const [plat] = await db
      .insert(platillos)
      .values({
        restaurante_id: rest.id,
        categoria_id: cat.id,
        nombre: "Cerveza Artesanal",
        precio: "85.00",
        disponible: true,
      })
      .returning();

    const [ord] = await db
      .insert(ordenes)
      .values({
        restaurante_id: rest.id,
        mesa_id: mesa.id,
        total: "170.00",
        estado: "pagado",
      })
      .returning();
    ordenTest = ord;

    await db.insert(ordenItems).values({
      orden_id: ord.id,
      platillo_id: plat.id,
      cantidad: 2,
      precio_unitario_congelado: "85.00",
      notas: "Bien frías",
    });


    // Pago dividido: Efectivo $100 con $10 propina, Tarjeta $70 con $15 propina
    await db.insert(pagos).values([
      {
        restaurante_id: rest.id,
        orden_id: ord.id,
        metodo_pago: "efectivo",
        monto: "100.00",
        propina_monto: "10.00",
        creado_por: dueno.id,
      },
      {
        restaurante_id: rest.id,
        orden_id: ord.id,
        metodo_pago: "tarjeta",
        monto: "70.00",
        propina_monto: "15.00",
        creado_por: dueno.id,
      },
    ]);
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (restTest) {
      await db.delete(pagos).where(eq(pagos.restaurante_id, restTest.id));
      await db.delete(ordenItems).where(eq(ordenItems.orden_id, ordenTest.id));
      await db.delete(ordenes).where(eq(ordenes.restaurante_id, restTest.id));
      await db.delete(platillos).where(eq(platillos.restaurante_id, restTest.id));
      await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restTest.id));
      await db.delete(mesas).where(eq(mesas.restaurante_id, restTest.id));
      await db.delete(ticketsSoporte).where(eq(ticketsSoporte.restaurante_id, restTest.id));
      await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restTest.id));
      await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restTest.id));
      await db.delete(recordatoriosTrialEnviados).where(eq(recordatoriosTrialEnviados.restaurante_id, restTest.id));
      await db.delete(restaurantes).where(eq(restaurantes.id, restTest.id));

    }
    if (duenoUser) await db.delete(usuarios).where(eq(usuarios.id, duenoUser.id));
    if (meseroUser) await db.delete(usuarios).where(eq(usuarios.id, meseroUser.id));
    if (adminUser) await db.delete(usuarios).where(eq(usuarios.id, adminUser.id));
  });

  describe("1. Seguridad RBAC & Autenticación de Super-Admin", () => {
    it("Rechaza el acceso a /superadmin si el usuario no ha iniciado sesión", async () => {
      mockAuthUserId = "";
      mockUserEmail = "";
      await expect(validarSuperAdmin()).rejects.toThrow(UnauthorizedError);
    });

    it("Rechaza el acceso a /superadmin si el usuario es dueño de restaurante pero su email NO está en SUPER_ADMIN_EMAILS", async () => {
      mockAuthUserId = duenoUser.auth_id;
      mockUserEmail = duenoUser.email; // dueno_ts@restauratest.com (NO es superadmin)
      await expect(validarSuperAdmin()).rejects.toThrow(
        "Acceso denegado: Se requieren credenciales de Super-Admin."
      );
    });

    it("Permite el acceso a /superadmin a usuarios autorizados en SUPER_ADMIN_EMAILS", async () => {
      mockAuthUserId = adminUser.auth_id;
      mockUserEmail = "superadmin@restauracore.com"; // En lista blanca
      const adminInfo = await validarSuperAdmin();
      expect(adminInfo.email).toBe("superadmin@restauracore.com");
    });
  });

  describe("2. Métricas Globales y Gestión de Restaurantes (Super-Admin)", () => {
    beforeAll(() => {
      mockAuthUserId = adminUser.auth_id;
      mockUserEmail = "superadmin@restauracore.com";
    });

    it("Calcula métricas globales de restaurantes y MRR correctamente", async () => {
      const metricas = await obtenerMetricasGlobalesAction();
      expect(metricas.totalRestaurantes).toBeGreaterThanOrEqual(1);
      expect(typeof metricas.mrrEstimado).toBe("number");
      expect(typeof metricas.ticketsAbiertos).toBe("number");
    });

    it("Lista el directorio de restaurantes filtrable", async () => {
      const lista = await obtenerRestaurantesSuperAdminAction({
        busqueda: `Restaurante Test SaaS ${ts}`,
      });
      expect(lista.length).toBe(1);
      expect(lista[0].id).toBe(restTest.id);
      expect(lista[0].dueno?.email).toBe(duenoUser.email);
    });
  });

  describe("3. Función Centralizada de Extensión de Trial con Validaciones", () => {
    beforeAll(() => {
      mockAuthUserId = adminUser.auth_id;
      mockUserEmail = "superadmin@restauracore.com";
    });

    it("Bloquea terminantemente la extensión si el restaurante está en estado 'cancelada'", async () => {
      // Marcar restaurante temporalmente como cancelado
      await db
        .update(restaurantes)
        .set({ estado_suscripcion: "cancelada" })
        .where(eq(restaurantes.id, restTest.id));

      await expect(
        extenderTrialAction({
          restauranteId: restTest.id,
          diasAdicionales: 7,
        })
      ).rejects.toThrow("No es posible extender el trial de un restaurante con suscripción cancelada.");

      // Restaurar estado a trial
      await db
        .update(restaurantes)
        .set({ estado_suscripcion: "trial" })
        .where(eq(restaurantes.id, restTest.id));
    });

    it("Bloquea la extensión si se intenta fijar una fecha en el pasado", async () => {
      const fechaPasada = new Date(Date.now() - 10000).toISOString();
      await expect(
        extenderTrialAction({
          restauranteId: restTest.id,
          nuevaFechaFin: fechaPasada,
        })
      ).rejects.toThrow("La nueva fecha de finalización del trial debe ser estrictamente en el futuro.");
    });

    it("Extiende exitosamente el trial, actualiza BD y asienta en log_auditoria", async () => {
      const res = await extenderTrialAction({
        restauranteId: restTest.id,
        diasAdicionales: 14,
        motivo: "Prueba automatizada de extensión",
      });

      expect(res.success).toBe(true);
      expect(new Date(res.nuevaFechaFin).getTime()).toBeGreaterThan(Date.now());

      // Verificar en base de datos
      const [restActualizado] = await db
        .select()
        .from(restaurantes)
        .where(eq(restaurantes.id, restTest.id));

      expect(restActualizado.estado_suscripcion).toBe("trial");
      expect(restActualizado.fecha_fin_trial).toBeDefined();

      // Verificar registro inmutable en log de auditoría
      const auditoria = await db
        .select()
        .from(logAuditoria)
        .where(
          and(
            eq(logAuditoria.restaurante_id, restTest.id),
            eq(logAuditoria.accion, "SUPERADMIN_EXTENDER_TRIAL")
          )
        );

      expect(auditoria.length).toBeGreaterThanOrEqual(1);
      expect((auditoria[0].valores_nuevos as any).motivo).toContain("Prueba automatizada");

      // Resetear estado a 'activa' para aislamiento entre suites concurrentes
      await db
        .update(restaurantes)
        .set({ estado_suscripcion: "activa", fecha_fin_trial: null })
        .where(eq(restaurantes.id, restTest.id));
    });


  });

  describe("4. Sistema Simple de Soporte (/soporte)", () => {
    let ticketCreadoId = "";

    it("Rechaza el acceso y creación de tickets a roles no autorizados (mesero)", async () => {
      mockAuthUserId = meseroUser.auth_id;
      mockUserEmail = meseroUser.email;
      mockRestauranteActivoId = restTest.id;

      await expect(
        crearTicketSoporteAction({
          asunto: "Ayuda con mesa",
          mensaje: "No puedo asignar comanda",
        })
      ).rejects.toThrow("Solo gerentes y dueños pueden gestionar soporte.");
    });

    it("Permite a Dueño o Gerente levantar un ticket de soporte", async () => {
      mockAuthUserId = duenoUser.auth_id;
      mockUserEmail = duenoUser.email;
      mockRestauranteActivoId = restTest.id;

      const res = await crearTicketSoporteAction({
        asunto: "Configuración de comandera térmica",
        mensaje: "Requiero asistencia para calibrar papel térmico de 80mm",
      });

      expect(res.success).toBe(true);
      expect(res.ticketId).toBeDefined();
      ticketCreadoId = res.ticketId;

      // Verificar consulta de tickets por restaurante
      const tickets = await obtenerTicketsRestauranteAction();
      expect(tickets.length).toBeGreaterThanOrEqual(1);
      expect(tickets[0].asunto).toBe("Configuración de comandera térmica");
      expect(tickets[0].estado).toBe("abierto");
    });

    it("Super-Admin puede ver y responder tickets en el inbox global", async () => {
      mockAuthUserId = adminUser.auth_id;
      mockUserEmail = "superadmin@restauracore.com";

      const todos = await obtenerTodosTicketsAction("abierto");
      const ticket = todos.find((t) => t.id === ticketCreadoId);
      expect(ticket).toBeDefined();
      expect(ticket?.restaurante_nombre).toContain("Restaurante Test SaaS");

      // Responder ticket
      const resResp = await responderTicketAction({
        ticketId: ticketCreadoId,
        respuesta: "Hemos habilitado el margen de 80mm automático en tu KDS.",
        nuevoEstado: "resuelto",
      });

      expect(resResp.success).toBe(true);

      // Verificar ticket actualizado en BD
      const [ticketActualizado] = await db
        .select()
        .from(ticketsSoporte)
        .where(eq(ticketsSoporte.id, ticketCreadoId));

      expect(ticketActualizado.estado).toBe("resuelto");
      expect(ticketActualizado.respuesta).toContain("margen de 80mm");
      expect(ticketActualizado.respondido_en).toBeDefined();
    });
  });

  describe("5. Recibo de Cobro para el Cliente (Formato 80mm)", () => {
    it("Calcula desglose de platillos, propinas por método y leyenda no fiscal", async () => {
      mockAuthUserId = duenoUser.auth_id;
      mockUserEmail = duenoUser.email;
      mockRestauranteActivoId = restTest.id;

      const recibo = await obtenerDatosReciboAction(ordenTest.id);

      expect(recibo.folio).toBe(`ORD-${ordenTest.id.slice(0, 8).toUpperCase()}`);
      expect(recibo.mesa).toBe("Mesa 12");
      expect(recibo.items.length).toBe(1);
      expect(recibo.items[0].platillo).toBe("Cerveza Artesanal");
      expect(recibo.items[0].cantidad).toBe(2);
      expect(recibo.items[0].total).toBe(170);

      // Desglose de propinas
      expect(recibo.propinaTotal).toBe(25); // $10 efectivo + $15 tarjeta
      expect(recibo.propinaPorMetodo.efectivo).toBe(10);
      expect(recibo.propinaPorMetodo.tarjeta).toBe(15);

      // Total con propinas
      expect(recibo.subtotal).toBe(170);
      expect(recibo.total).toBe(195); // 170 + 25

      // Métodos de pago registrados
      expect(recibo.pagos.length).toBe(2);
    });
  });
});

