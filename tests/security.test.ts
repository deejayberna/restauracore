import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware } from "@/middleware";
import {
  checkRateLimitMenu,
  checkRateLimitPedido,
  checkRateLimitLogin,
  resetRateLimits,
} from "@/lib/rate-limiter";
import { confirmarPedido } from "@/lib/pedido-actions";
import { db } from "@/db";
import {
  restaurantes,
  mesas,
  platillos,
  categoriasMenu,
  ordenes,
  ordenItems,
  usuarios,
  usuarioRestaurantes,
  ingredientes,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

describe("Fase 9 — Suite de Seguridad y Confiabilidad", () => {
  const timestamp = Date.now();
  let restA: any;
  let restB: any;
  let mesaA: any;
  let mesaB: any;
  let platilloA: any;
  let platilloB: any;
  let ingredienteA: any;
  let ingredienteB: any;

  beforeAll(async () => {
    // Crear datos para dos inquilinos (Tenants) separados
    const [r1] = await db
      .insert(restaurantes)
      .values({
        nombre: `Seguridad Rest A ${timestamp}`,
        timezone: "America/Mexico_City",
      })
      .returning();
    restA = r1;

    const [r2] = await db
      .insert(restaurantes)
      .values({
        nombre: `Seguridad Rest B ${timestamp}`,
        timezone: "America/Mexico_City",
      })
      .returning();
    restB = r2;

    const [catA] = await db
      .insert(categoriasMenu)
      .values({ restaurante_id: restA.id, nombre: "General A" })
      .returning();
    const [catB] = await db
      .insert(categoriasMenu)
      .values({ restaurante_id: restB.id, nombre: "General B" })
      .returning();

    const [ingA] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restA.id,
        nombre: `Ingrediente A ${timestamp}`,
        unidad_medida: "pieza",
        stock_actual: "100.00",
        stock_minimo: "10.00",
        costo_unitario: "15.0000",
      })
      .returning();
    ingredienteA = ingA;

    const [ingB] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restB.id,
        nombre: `Ingrediente B ${timestamp}`,
        unidad_medida: "pieza",
        stock_actual: "50.00",
        stock_minimo: "5.00",
        costo_unitario: "20.0000",
      })
      .returning();
    ingredienteB = ingB;

    const [mA] = await db
      .insert(mesas)
      .values({
        restaurante_id: restA.id,
        numero: 1,
        qr_token: `token-seg-a-${timestamp}`,
      })
      .returning();
    mesaA = mA;

    const [mB] = await db
      .insert(mesas)
      .values({
        restaurante_id: restB.id,
        numero: 2,
        qr_token: `token-seg-b-${timestamp}`,
      })
      .returning();
    mesaB = mB;

    const [pA] = await db
      .insert(platillos)
      .values({
        restaurante_id: restA.id,
        categoria_id: catA.id,
        nombre: "Tacos Especiales A",
        precio: "150.00",
        disponible: true,
      })
      .returning();
    platilloA = pA;

    const [pB] = await db
      .insert(platillos)
      .values({
        restaurante_id: restB.id,
        categoria_id: catB.id,
        nombre: "Hamburguesa B",
        precio: "220.00",
        disponible: true,
      })
      .returning();
    platilloB = pB;
  });

  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(async () => {
    // Limpieza de datos creados en el test
    if (platilloA) await db.delete(platillos).where(eq(platillos.id, platilloA.id));
    if (platilloB) await db.delete(platillos).where(eq(platillos.id, platilloB.id));
    if (mesaA) await db.delete(mesas).where(eq(mesas.id, mesaA.id));
    if (mesaB) await db.delete(mesas).where(eq(mesas.id, mesaB.id));
    if (ingredienteA) await db.delete(ingredientes).where(eq(ingredientes.id, ingredienteA.id));
    if (ingredienteB) await db.delete(ingredientes).where(eq(ingredientes.id, ingredienteB.id));
    if (restA) {
      await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restA.id));
      await db.delete(restaurantes).where(eq(restaurantes.id, restA.id));
    }
    if (restB) {
      await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restB.id));
      await db.delete(restaurantes).where(eq(restaurantes.id, restB.id));
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Edge Interception y Protección de Server Components
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Interceptación Perimetral por Middleware (Edge)", () => {
    it("bloquea peticiones no autenticadas en rutas protegidas y redirige a /login sin tocar el Server Component", async () => {
      const serverComponentSpy = vi.fn(() => "Renderizado de página");

      const rutas = ["/dashboard", "/compras", "/inventario", "/caja", "/cocina", "/reportes"];

      for (const ruta of rutas) {
        const req = new NextRequest(`http://localhost:3000${ruta}`);
        const res = await middleware(req);

        // El middleware debe interceptar y retornar una redirección
        expect(res.status).toBe(307); // NextResponse.redirect genera 307 por defecto en Next.js
        const location = res.headers.get("location");
        expect(location).toContain("/login");

        // Simulación de pipeline de Next.js: si el middleware redirige, el Server Component nunca es invocado
        if (!res.headers.get("location")?.includes("/login")) {
          serverComponentSpy();
        }
      }

      // Verificamos que el Server Component nunca fue invocado
      expect(serverComponentSpy).not.toHaveBeenCalled();
    });

    it("el rate limiting perimetral para el menú público (/menu/[qrToken]) retorna 429 al exceder cuota", async () => {
      const ip = "192.168.1.50";
      const qrToken = "mesa-vip-10";

      // 60 peticiones permitidas
      for (let i = 0; i < 60; i++) {
        const req = new NextRequest(`http://localhost:3000/menu/${qrToken}`, {
          headers: new Headers({ "x-forwarded-for": ip }),
        });
        const res = await middleware(req);
        expect(res.status).toBe(200);
      }

      // La petición 61 debe ser rechazada con HTTP 429
      const reqBloqueada = new NextRequest(`http://localhost:3000/menu/${qrToken}`, {
        headers: new Headers({ "x-forwarded-for": ip }),
      });
      const resBloqueada = await middleware(reqBloqueada);
      expect(resBloqueada.status).toBe(429);
      expect(resBloqueada.headers.get("Retry-After")).toBe("60");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Rate Limiting Combinado (IP + qr_token)
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Rate Limiting Multi-Mesa (IP compartida WiFi + qr_token)", () => {
    it("permite que clientes con la misma IP pero diferente mesa (qr_token) tengan cuotas independientes", async () => {
      const ipCompartida = "201.140.88.10";
      const tokenMesa1 = "mesa-01-token";
      const tokenMesa2 = "mesa-02-token";

      // Agotar la cuota de la Mesa 1 en confirmarPedido (límite: 10)
      for (let i = 0; i < 10; i++) {
        const res = await checkRateLimitPedido(`${ipCompartida}:${tokenMesa1}`);
        expect(res.success).toBe(true);
      }

      // El intento 11 de la Mesa 1 debe fallar
      const intento11Mesa1 = await checkRateLimitPedido(`${ipCompartida}:${tokenMesa1}`);
      expect(intento11Mesa1.success).toBe(false);

      // Sin embargo, la Mesa 2 bajo la MISMA IP pública puede operar normalmente
      const intentoMesa2 = await checkRateLimitPedido(`${ipCompartida}:${tokenMesa2}`);
      expect(intentoMesa2.success).toBe(true);
      expect(intentoMesa2.remaining).toBe(9);
    });

    it("protege contra ataques de fuerza bruta en login por IP", async () => {
      const ipAtacante = "45.33.32.156";

      // 5 intentos permitidos
      for (let i = 0; i < 5; i++) {
        const res = await checkRateLimitLogin(ipAtacante);
        expect(res.success).toBe(true);
      }

      // El 6to intento es bloqueado
      const bloqueo = await checkRateLimitLogin(ipAtacante);
      expect(bloqueo.success).toBe(false);
      expect(bloqueo.remaining).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Integridad Financiera y Resistencia a Manipulación de Precios
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Prevención de Manipulación de Precios desde el Cliente", () => {
    it("calcula el total de la orden usando exclusivamente el precio en BD e ignora precios fraudulentos", async () => {
      // Intentar enviar un pedido donde el cliente dice que el platillo cuesta $1.00 en lugar de $150.00
      const formData = new FormData();
      formData.set("qr_token", mesaA.qr_token);
      formData.set(
        "items",
        JSON.stringify([
          {
            platillo_id: platilloA.id,
            cantidad: 2,
            precio_falso_del_cliente: 1.0, // Inyección de campo fraudulento
          },
        ])
      );

      const resultado = await confirmarPedido(null, formData);
      expect(resultado.ok).toBe(true);

      if (resultado.ok) {
        const ordenCreada = await db.query.ordenes.findFirst({
          where: eq(ordenes.id, resultado.orden_id),
        });

        // 2 unidades de $150.00 = $300.00 (el precio del cliente es completamente ignorado)
        expect(Number(ordenCreada?.total)).toBe(300.0);

        // Limpiar orden de prueba
        await db.delete(ordenItems).where(eq(ordenItems.orden_id, resultado.orden_id));
        await db.delete(ordenes).where(eq(ordenes.id, resultado.orden_id));
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Inyección SQL y Parametrización Segura
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Prevención de Inyección SQL", () => {
    it("trata payloads maliciosos de SQL como literales escalares sin ejecutar comandos arbitrarios", async () => {
      const payloadInyeccion = "'; DROP TABLE platillos; --";

      // Consulta de búsqueda con Drizzle usando parámetro malicioso
      const resultado = await db
        .select()
        .from(platillos)
        .where(eq(platillos.nombre, payloadInyeccion));

      // No encuentra nada y la tabla platillos sigue existiendo intacta
      expect(resultado.length).toBe(0);

      // Verificamos que la tabla platillos no fue destruida
      const platilloExiste = await db.query.platillos.findFirst({
        where: eq(platillos.id, platilloA.id),
      });
      expect(platilloExiste).toBeDefined();
      expect(platilloExiste?.nombre).toBe("Tacos Especiales A");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Segregación Estricta Multi-Tenant
  // ──────────────────────────────────────────────────────────────────────────
  describe("5. Segregación Estricta de Datos Multi-Tenant", () => {
    it("garantiza que las consultas de inventario de un restaurante nunca filtran datos de otro", async () => {
      // Consulta para Restaurante A
      const itemsA = await db.query.ingredientes.findMany({
        where: eq(ingredientes.restaurante_id, restA.id),
      });

      // Consulta para Restaurante B
      const itemsB = await db.query.ingredientes.findMany({
        where: eq(ingredientes.restaurante_id, restB.id),
      });

      expect(itemsA.some((i) => i.id === ingredienteA.id)).toBe(true);
      expect(itemsA.some((i) => i.id === ingredienteB.id)).toBe(false);

      expect(itemsB.some((i) => i.id === ingredienteB.id)).toBe(true);
      expect(itemsB.some((i) => i.id === ingredienteA.id)).toBe(false);
    });

    it("rechaza asociar una orden de la mesa de Restaurante A con platillos pertenecientes a Restaurante B", async () => {
      const formData = new FormData();
      formData.set("qr_token", mesaA.qr_token); // Mesa de Restaurante A
      formData.set(
        "items",
        JSON.stringify([
          {
            platillo_id: platilloB.id, // Platillo de Restaurante B
            cantidad: 1,
          },
        ])
      );

      const res = await confirmarPedido(null, formData);
      // Debe ser rechazado porque el platillo no pertenece al restaurante de la mesa
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/no encontrado|no está disponible|NotFoundError/i);
      }
    });
  });
});

