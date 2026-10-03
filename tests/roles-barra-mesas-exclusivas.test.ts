import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  categoriasMenu,
  platillos,
  mesas,
  ordenes,
  ordenItems,
  pagos,
  logAuditoria,
  turnos,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getItemsKDS } from "@/lib/kds-queries";
import { actualizarEstadoItem } from "@/lib/cocina-actions";
import {
  tomarMesaAction,
  liberarMesaAction,
  transferirMesaAction,
  obtenerMesasOperativasAction,
} from "@/lib/mesas-actions";
import { registrarPagoParcialAction } from "@/lib/pagos-actions";
import { cancelarOrdenAction } from "@/lib/cancelaciones-actions";
import { confirmarPedido } from "@/lib/pedido-actions";
import { UnauthorizedError } from "@/lib/errors";

// Mock de sesión de Supabase y cookies de Next.js
let mockAuthUserId: string | null = null;
let mockUserEmail: string | null = null;
let mockRestauranteActivoId: string | null = null;
let customGetUser: (() => { id: string; email: string } | null) | null = null;

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => {
        if (customGetUser) {
          const u = customGetUser();
          return { data: { user: u }, error: null };
        }
        return {
          data: {
            user: mockAuthUserId
              ? { id: mockAuthUserId, email: mockUserEmail }
              : null,
          },
          error: null,
        };
      }),
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((key: string) => {
      if (key === "restaurante_activo") {
        return mockRestauranteActivoId ? { value: mockRestauranteActivoId } : undefined;
      }
      return undefined;
    }),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

describe("Módulo de Nuevos Roles, Separación Barra/Cocina y Mesas Exclusivas", () => {
  let restId: string;
  let catId: string;

  // Usuarios con distintos roles
  let userDuenoId: string;
  let userChefId: string;
  let userBartenderId: string;
  let userFoodRunnerId: string;
  let userSupervisorId: string;
  let userMesero1Id: string;
  let userMesero2Id: string;
  let userAnfitrionId: string;

  let authDuenoId = "mock-auth-dueno-" + crypto.randomUUID();
  let authChefId = "mock-auth-chef-" + crypto.randomUUID();
  let authBartenderId = "mock-auth-bartender-" + crypto.randomUUID();
  let authFoodRunnerId = "mock-auth-foodrunner-" + crypto.randomUUID();
  let authSupervisorId = "mock-auth-supervisor-" + crypto.randomUUID();
  let authMesero1Id = "mock-auth-mesero1-" + crypto.randomUUID();
  let authMesero2Id = "mock-auth-mesero2-" + crypto.randomUUID();
  let authAnfitrionId = "mock-auth-anfitrion-" + crypto.randomUUID();

  let platilloComidaId: string;
  let platilloBebidaId: string;
  let mesaTestId: string;
  let mesa2TestId: string;
  let turnoActivoId: string;

  beforeAll(async () => {
    // 1. Crear Restaurante de Prueba
    const [r] = await db
      .insert(restaurantes)
      .values({
        nombre: "Test Rest Roles y Barra " + Date.now(),
        plan: "basico", // Probamos que opera en cualquier plan
      })
      .returning();
    restId = r.id;

    // 2. Crear Usuarios con sus roles respectivos
    async function crearUsuarioConRol(nombre: string, email: string, authId: string, rol: any) {
      const [u] = await db
        .insert(usuarios)
        .values({
          auth_id: authId,
          nombre,
          email,
          activo: true,
        })
        .returning();

      await db.insert(usuarioRestaurantes).values({
        usuario_id: u.id,
        restaurante_id: restId,
        rol,
        activo: true,
      });

      return u.id;
    }

    userDuenoId = await crearUsuarioConRol("Dueño Test", "dueno@test.com", authDuenoId, "dueno");
    userChefId = await crearUsuarioConRol("Chef Test", "chef@test.com", authChefId, "chef");
    userBartenderId = await crearUsuarioConRol("Bartender Test", "bartender@test.com", authBartenderId, "bartender");
    userFoodRunnerId = await crearUsuarioConRol("Runner Test", "runner@test.com", authFoodRunnerId, "food_runner");
    userSupervisorId = await crearUsuarioConRol("Supervisor Test", "supervisor@test.com", authSupervisorId, "supervisor_piso");
    userMesero1Id = await crearUsuarioConRol("Mesero 1 Test", "mesero1@test.com", authMesero1Id, "mesero");
    userMesero2Id = await crearUsuarioConRol("Mesero 2 Test", "mesero2@test.com", authMesero2Id, "mesero");
    userAnfitrionId = await crearUsuarioConRol("Anfitrion Test", "anfitrion@test.com", authAnfitrionId, "anfitrion");

    // 3. Crear Categoría y Platillos (Cocina y Bar)
    const [cat] = await db
      .insert(categoriasMenu)
      .values({
        restaurante_id: restId,
        nombre: "General",
        orden: 1,
        activo: true,
      })
      .returning();
    catId = cat.id;

    const [comida] = await db
      .insert(platillos)
      .values({
        restaurante_id: restId,
        categoria_id: catId,
        nombre: "Hamburguesa Gourmet",
        precio: "150.00",
        estacion: "cocina",
        disponible: true,
      })
      .returning();
    platilloComidaId = comida.id;

    const [bebida] = await db
      .insert(platillos)
      .values({
        restaurante_id: restId,
        categoria_id: catId,
        nombre: "Margarita Clásica",
        precio: "95.00",
        estacion: "bar",
        disponible: true,
      })
      .returning();
    platilloBebidaId = bebida.id;

    // 4. Crear Mesas de prueba
    const [m1] = await db
      .insert(mesas)
      .values({
        restaurante_id: restId,
        numero: 101,
        qr_token: crypto.randomUUID(),
      })
      .returning();
    mesaTestId = m1.id;

    const [m2] = await db
      .insert(mesas)
      .values({
        restaurante_id: restId,
        numero: 102,
        qr_token: crypto.randomUUID(),
      })
      .returning();
    mesa2TestId = m2.id;

    // 5. Crear Turno activo para pruebas de caja/pago
    const [t] = await db
      .insert(turnos)
      .values({
        restaurante_id: restId,
        codigo: "TURNO-TEST-" + Date.now(),
        abierto_por: userDuenoId,
        estado: "abierto",
      })
      .returning();
    turnoActivoId = t.id;
  });

  afterAll(async () => {
    // Limpieza
    await db.delete(pagos).where(eq(pagos.restaurante_id, restId));
    await db.delete(ordenItems).where(eq(ordenItems.platillo_id, platilloComidaId));
    await db.delete(ordenItems).where(eq(ordenItems.platillo_id, platilloBebidaId));
    await db.delete(ordenes).where(eq(ordenes.restaurante_id, restId));
    await db.delete(mesas).where(eq(mesas.restaurante_id, restId));
    await db.delete(platillos).where(eq(platillos.restaurante_id, restId));
    await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restId));
    await db.delete(turnos).where(eq(turnos.restaurante_id, restId));
    await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restId));
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restId));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authDuenoId));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authChefId));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authBartenderId));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authFoodRunnerId));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authSupervisorId));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authMesero1Id));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authMesero2Id));
    await db.delete(usuarios).where(eq(usuarios.auth_id, authAnfitrionId));
    await db.delete(restaurantes).where(eq(restaurantes.id, restId));
  });

  function setSesion(authId: string, email: string) {
    mockAuthUserId = authId;
    mockUserEmail = email;
    mockRestauranteActivoId = restId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SEPARACIÓN REAL COCINA / BARRA (DUAL KDS)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Dual KDS y Separación Cocina vs Barra", () => {
    let itemComidaId: string;
    let itemBebidaId: string;

    beforeAll(async () => {
      // Crear orden con 1 comida y 1 bebida
      const [ord] = await db
        .insert(ordenes)
        .values({
          restaurante_id: restId,
          mesa_id: mesaTestId,
          estado: "abierta",
          subtotal: "245.00",
          total: "245.00",
        })
        .returning();

      const [itComida] = await db
        .insert(ordenItems)
        .values({
          orden_id: ord.id,
          platillo_id: platilloComidaId,
          cantidad: 1,
          precio_unitario_congelado: "150.00",
          estado: "pendiente",
        })
        .returning();
      itemComidaId = itComida.id;

      const [itBebida] = await db
        .insert(ordenItems)
        .values({
          orden_id: ord.id,
          platillo_id: platilloBebidaId,
          cantidad: 1,
          precio_unitario_congelado: "95.00",
          estado: "pendiente",
        })
        .returning();
      itemBebidaId = itBebida.id;
    });

    it("getItemsKDS('cocina') solo devuelve comida, no bebidas del bar", async () => {
      const itemsCocina = await getItemsKDS(restId, "cocina");
      const ids = itemsCocina.map((i) => i.id);
      expect(ids).toContain(itemComidaId);
      expect(ids).not.toContain(itemBebidaId);
    });

    it("getItemsKDS('bar') solo devuelve bebidas, no comida de cocina", async () => {
      const itemsBarra = await getItemsKDS(restId, "bar");
      const ids = itemsBarra.map((i) => i.id);
      expect(ids).toContain(itemBebidaId);
      expect(ids).not.toContain(itemComidaId);
    });

    it("Chef puede avanzar item de cocina, pero es rechazado al intentar modificar item de barra", async () => {
      setSesion(authChefId, "chef@test.com");

      // 1. Chef avanza comida -> ÉXITO
      const fdComida = new FormData();
      fdComida.set("item_id", itemComidaId);
      fdComida.set("estado", "en_preparacion");
      const resCocina = await actualizarEstadoItem(fdComida);
      expect(resCocina.exito).toBe(true);

      // 2. Chef intenta avanzar bebida de barra -> BLOQUEADO
      const fdBebida = new FormData();
      fdBebida.set("item_id", itemBebidaId);
      fdBebida.set("estado", "en_preparacion");
      await expect(actualizarEstadoItem(fdBebida)).rejects.toThrow(
        "El chef no puede gestionar platillos o bebidas de la barra"
      );
    });

    it("Bartender puede avanzar item de barra, pero es rechazado al intentar modificar item de cocina", async () => {
      setSesion(authBartenderId, "bartender@test.com");

      // 1. Bartender avanza bebida -> ÉXITO
      const fdBebida = new FormData();
      fdBebida.set("item_id", itemBebidaId);
      fdBebida.set("estado", "en_preparacion");
      const resBarra = await actualizarEstadoItem(fdBebida);
      expect(resBarra.exito).toBe(true);

      // 2. Bartender intenta avanzar comida de cocina -> BLOQUEADO
      const fdComida = new FormData();
      fdComida.set("item_id", itemComidaId);
      fdComida.set("estado", "listo");
      await expect(actualizarEstadoItem(fdComida)).rejects.toThrow(
        "El bartender no puede gestionar platillos de cocina"
      );
    });

    it("Food runner NO puede mover de 'pendiente' a 'en_preparacion'", async () => {
      setSesion(authFoodRunnerId, "runner@test.com");

      // Devolver temporalmente comida a pendiente para probar
      await db.update(ordenItems).set({ estado: "pendiente" }).where(eq(ordenItems.id, itemComidaId));

      const fd = new FormData();
      fd.set("item_id", itemComidaId);
      fd.set("estado", "en_preparacion");

      await expect(actualizarEstadoItem(fd)).rejects.toThrow(
        "solo tiene autorización para marcar platillos de 'listo' a 'entregado'"
      );
    });

    it("Food runner SÍ puede mover de 'listo' a 'entregado'", async () => {
      setSesion(authFoodRunnerId, "runner@test.com");

      // Poner comida en 'listo'
      await db.update(ordenItems).set({ estado: "listo" }).where(eq(ordenItems.id, itemComidaId));

      const fd = new FormData();
      fd.set("item_id", itemComidaId);
      fd.set("estado", "entregado");

      const res = await actualizarEstadoItem(fd);
      expect(res.exito).toBe(true);

      const [it] = await db.select().from(ordenItems).where(eq(ordenItems.id, itemComidaId));
      expect(it.estado).toBe("entregado");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MESAS EXCLUSIVAS Y ROTACIÓN (CONCURRENCIA ATÓMICA)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Sistema de Mesas Exclusivas y Concurrencia", () => {
    beforeEach(async () => {
      // Liberar mesaTestId antes de cada test
      await db
        .update(mesas)
        .set({ mesero_actual_id: null, asignado_en: null })
        .where(eq(mesas.id, mesaTestId));
    });

    it("Mesero 1 toma mesa disponible -> Éxito, queda asignada exclusivamente a él", async () => {
      setSesion(authMesero1Id, "mesero1@test.com");

      const res = await tomarMesaAction(mesaTestId);
      expect(res.ok).toBe(true);
      expect(res.mesa?.mesero_actual_id).toBe(userMesero1Id);

      const [mesaDB] = await db.select().from(mesas).where(eq(mesas.id, mesaTestId));
      expect(mesaDB.mesero_actual_id).toBe(userMesero1Id);
      expect(mesaDB.asignado_en).not.toBeNull();
    });

    it("Mesero 2 intenta tomar mesa ya ocupada por Mesero 1 -> Rechazado indicando el nombre del mesero", async () => {
      // 1. Mesero 1 toma la mesa
      setSesion(authMesero1Id, "mesero1@test.com");
      await tomarMesaAction(mesaTestId);

      // 2. Mesero 2 intenta tomar la misma mesa
      setSesion(authMesero2Id, "mesero2@test.com");
      const res = await tomarMesaAction(mesaTestId);

      expect(res.ok).toBe(false);
      expect(res.error).toContain("esta mesa ya está siendo atendida por Mesero 1 Test");
    });

    it("Concurrencia real: Dos meseros intentan tomar la misma mesa simultáneamente -> Exactamente uno gana, otro es rechazado", async () => {
      let turn = 0;
      customGetUser = () => {
        turn++;
        if (turn % 2 === 1) {
          return { id: authMesero1Id, email: "mesero1@test.com" };
        } else {
          return { id: authMesero2Id, email: "mesero2@test.com" };
        }
      };
      mockRestauranteActivoId = restId;

      try {
        const [res1, res2] = await Promise.all([
          tomarMesaAction(mesaTestId),
          tomarMesaAction(mesaTestId),
        ]);

        const exitos = [res1, res2].filter((r) => r.ok);
        const fallos = [res1, res2].filter((r) => !r.ok);

        // Regla de exclusividad atómica: solo 1 ganador
        expect(exitos.length).toBe(1);
        expect(fallos.length).toBe(1);
        expect(fallos[0].error).toMatch(/esta mesa ya está siendo atendida por/);
      } finally {
        customGetUser = null;
      }
    });

    it("Mesero 2 NO puede liberar la mesa de Mesero 1", async () => {
      setSesion(authMesero1Id, "mesero1@test.com");
      await tomarMesaAction(mesaTestId);

      setSesion(authMesero2Id, "mesero2@test.com");
      await expect(liberarMesaAction(mesaTestId)).rejects.toThrow(
        "No puedes liberar una mesa atendida por otro mesero"
      );
    });

    it("Mesero 1 SÍ puede liberar su propia mesa", async () => {
      setSesion(authMesero1Id, "mesero1@test.com");
      await tomarMesaAction(mesaTestId);

      const res = await liberarMesaAction(mesaTestId);
      expect(res.ok).toBe(true);

      const [m] = await db.select().from(mesas).where(eq(mesas.id, mesaTestId));
      expect(m.mesero_actual_id).toBeNull();
      expect(m.asignado_en).toBeNull();
    });

    it("Mesero NO puede transferir mesas (exclusivo supervisor/gerente/dueño)", async () => {
      setSesion(authMesero1Id, "mesero1@test.com");
      await tomarMesaAction(mesaTestId);

      // Mesero 1 intenta transferir su mesa a Mesero 2 sin autorización
      await expect(transferirMesaAction(mesaTestId, userMesero2Id)).rejects.toThrow(
        "Solo supervisor de piso, gerente o dueño pueden transferir mesas"
      );
    });

    it("Supervisor de piso puede transferir mesa de Mesero 1 a Mesero 2", async () => {
      // 1. Mesero 1 tiene la mesa
      setSesion(authMesero1Id, "mesero1@test.com");
      await tomarMesaAction(mesaTestId);

      // 2. Supervisor de piso transfiere la mesa a Mesero 2
      setSesion(authSupervisorId, "supervisor@test.com");
      const res = await transferirMesaAction(mesaTestId, userMesero2Id);

      expect(res.ok).toBe(true);
      expect(res.mesa.mesero_actual_id).toBe(userMesero2Id);

      const [m] = await db.select().from(mesas).where(eq(mesas.id, mesaTestId));
      expect(m.mesero_actual_id).toBe(userMesero2Id);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AUTO-RELEASE AL PAGAR O CANCELAR ORDEN
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Auto-Release de Mesas en Pago y Cancelación", () => {
    it("Al pagar la orden completa, la mesa se auto-libera (mesero_actual_id = null)", async () => {
      // 1. Asignar mesa a Mesero 1
      setSesion(authMesero1Id, "mesero1@test.com");
      await tomarMesaAction(mesaTestId);

      // 2. Crear una orden para la mesa
      const [ord] = await db
        .insert(ordenes)
        .values({
          restaurante_id: restId,
          mesa_id: mesaTestId,
          estado: "abierta",
          subtotal: "100.00",
          total: "100.00",
        })
        .returning();

      // 3. Registrar pago total con el dueño/cajero
      setSesion(authDuenoId, "dueno@test.com");
      const pagoRes = await registrarPagoParcialAction({
        ordenId: ord.id,
        turnoId: turnoActivoId,
        monto: 100.0,
        metodoPago: "efectivo",
      });

      expect(pagoRes.ok).toBe(true);

      // 4. Verificar que la orden pasó a 'pagado'
      const [ordActualizada] = await db.select().from(ordenes).where(eq(ordenes.id, ord.id));
      expect(ordActualizada.estado).toBe("pagado");

      // 5. Verificar que la mesa fue AUTO-LIBERADA
      const [mesaDB] = await db.select().from(mesas).where(eq(mesas.id, mesaTestId));
      expect(mesaDB.mesero_actual_id).toBeNull();
      expect(mesaDB.asignado_en).toBeNull();
    });

    it("Al cancelar la orden completa con cancelarOrdenAction, la mesa se auto-libera", async () => {
      // 1. Asignar mesa a Mesero 2
      setSesion(authMesero2Id, "mesero2@test.com");
      await tomarMesaAction(mesa2TestId);

      // 2. Crear orden en mesa 2
      const [ord] = await db
        .insert(ordenes)
        .values({
          restaurante_id: restId,
          mesa_id: mesa2TestId,
          estado: "abierta",
          subtotal: "50.00",
          total: "50.00",
        })
        .returning();

      // 3. Supervisor cancela la orden
      setSesion(authSupervisorId, "supervisor@test.com");
      const cancRes = await cancelarOrdenAction({
        ordenId: ord.id,
        motivo: "Cliente se retiró por urgencia",
      });

      expect(cancRes.ok).toBe(true);

      // 4. Verificar que la orden está cancelada y la mesa auto-liberada
      const [ordDB] = await db.select().from(ordenes).where(eq(ordenes.id, ord.id));
      expect(ordDB.estado).toBe("cancelado");

      const [mesaDB] = await db.select().from(mesas).where(eq(mesas.id, mesa2TestId));
      expect(mesaDB.mesero_actual_id).toBeNull();
      expect(mesaDB.asignado_en).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. FLUJO QR DEL CLIENTE NUNCA BLOQUEADO POR TOMAR MESA
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Flujo QR de Pedidos del Cliente", () => {
    it("Cliente escanea QR y pide exitosamente en una mesa sin mesero asignado", async () => {
      // Limpiar órdenes anteriores en mesaTestId para verificar total exacto
      await db.delete(pagos).where(eq(pagos.restaurante_id, restId));
      await db.delete(ordenItems).where(eq(ordenItems.platillo_id, platilloComidaId));
      await db.delete(ordenItems).where(eq(ordenItems.platillo_id, platilloBebidaId));
      await db.delete(ordenes).where(eq(ordenes.mesa_id, mesaTestId));

      // Aseguramos mesa sin mesero asignado
      await db
        .update(mesas)
        .set({ mesero_actual_id: null, asignado_en: null })
        .where(eq(mesas.id, mesaTestId));

      const [m] = await db.select().from(mesas).where(eq(mesas.id, mesaTestId));
      expect(m.mesero_actual_id).toBeNull();

      // Cliente no tiene sesión de empleado: crea orden usando el token QR
      const fd = new FormData();
      fd.set("qr_token", m.qr_token);
      fd.set(
        "items",
        JSON.stringify([
          {
            platillo_id: platilloComidaId,
            cantidad: 2,
          },
        ])
      );

      const resPedido = await confirmarPedido(null, fd);
      expect(resPedido.ok).toBe(true);
      const ordenId = resPedido.orden_id!;

      expect(ordenId).toBeTruthy();

      // Validar que la orden existe en BD
      const [ordenDB] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));
      expect(ordenDB.estado).toBe("abierta");
      expect(Number(ordenDB.total)).toBe(300.0);

      // Validar que en obtenerMesasOperativasAction se reporta como pedido_sin_mesero = true
      setSesion(authMesero1Id, "mesero1@test.com");
      const operativas = await obtenerMesasOperativasAction();
      const mesaOp = operativas.mesas.find((mesa) => mesa.id === mesaTestId);

      expect(mesaOp?.pedido_sin_mesero).toBe(true);
      expect(mesaOp?.disponible_para_tomar).toBe(true);
    });
  });
});
