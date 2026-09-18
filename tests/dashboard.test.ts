import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  mesas,
  ordenes,
  reportesDiariosEnviados,
  restaurantes,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  obtenerMetricasMultiSucursal,
  obtenerRestaurantesDueno,
  obtenerMetricasRestaurante,
} from "@/lib/dashboard-actions";
import * as notificaciones from "@/lib/notificaciones";
import { NextRequest } from "next/server";
import { GET as cronReporteDiarioHandler } from "@/app/api/cron/reporte-diario/route";

// Mock de notificaciones para evitar llamadas reales en pruebas
vi.mock("@/lib/notificaciones", async (importOriginal) => {
  const original = await importOriginal<typeof notificaciones>();
  return {
    ...original,
    enviarNotificacionReporteDiario: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Fase 7 — Dashboard del Dueño (Multi-Sucursal)", () => {
  const timestamp = Date.now();

  let usuarioMesero: any;
  let usuarioGerente: any;
  let usuarioDueno: any;
  let restauranteA: any;
  let restauranteB: any;
  let mesaA: any;
  let mesaB: any;

  beforeAll(async () => {
    // 1. Crear dos restaurantes independientes (A y B)
    const [rA] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Alpha ${timestamp}`,
        timezone: "America/Mexico_City",
      })
      .returning();
    restauranteA = rA;

    const [rB] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Beta ${timestamp}`,
        timezone: "America/Mexico_City",
      })
      .returning();
    restauranteB = rB;

    // Mesas para órdenes
    const [mA] = await db
      .insert(mesas)
      .values({
        restaurante_id: restauranteA.id,
        numero: 1,
        qr_token: `qr-a-${timestamp}`,
      })
      .returning();
    mesaA = mA;

    const [mB] = await db
      .insert(mesas)
      .values({
        restaurante_id: restauranteB.id,
        numero: 1,
        qr_token: `qr-b-${timestamp}`,
      })
      .returning();
    mesaB = mB;

    // 2. Crear usuarios con distintos roles
    // Usuario solo Mesero
    const [uMesero] = await db
      .insert(usuarios)
      .values({
        auth_id: crypto.randomUUID(),
        email: `mesero-${timestamp}@test.com`,
        nombre: "Mesero Línea",
      })
      .returning();
    usuarioMesero = uMesero;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: usuarioMesero.id,
      restaurante_id: restauranteA.id,
      rol: "mesero",
      activo: true,
    });

    // Usuario solo Gerente
    const [uGerente] = await db
      .insert(usuarios)
      .values({
        auth_id: crypto.randomUUID(),
        email: `gerente-${timestamp}@test.com`,
        nombre: "Gerente Operativo",
      })
      .returning();
    usuarioGerente = uGerente;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: usuarioGerente.id,
      restaurante_id: restauranteA.id,
      rol: "gerente",
      activo: true,
    });

    // Usuario Dueño (vinculado a AMBOS restaurantes con rol 'dueno')
    const [uDueno] = await db
      .insert(usuarios)
      .values({
        auth_id: crypto.randomUUID(),
        email: `dueno-${timestamp}@test.com`,
        nombre: "Dueño Multi-Sucursal",
      })
      .returning();
    usuarioDueno = uDueno;

    await db.insert(usuarioRestaurantes).values([
      {
        usuario_id: usuarioDueno.id,
        restaurante_id: restauranteA.id,
        rol: "dueno",
        activo: true,
      },
      {
        usuario_id: usuarioDueno.id,
        restaurante_id: restauranteB.id,
        rol: "dueno",
        activo: true,
      },
    ]);
  });

  afterAll(async () => {
    // Limpieza en orden de dependencias
    await db.delete(reportesDiariosEnviados).where(eq(reportesDiariosEnviados.restaurante_id, restauranteA.id));
    await db.delete(reportesDiariosEnviados).where(eq(reportesDiariosEnviados.restaurante_id, restauranteB.id));
    await db.delete(ordenes).where(eq(ordenes.restaurante_id, restauranteA.id));
    await db.delete(ordenes).where(eq(ordenes.restaurante_id, restauranteB.id));
    await db.delete(mesas).where(eq(mesas.id, mesaA.id));
    await db.delete(mesas).where(eq(mesas.id, mesaB.id));
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.usuario_id, usuarioMesero.id));
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.usuario_id, usuarioGerente.id));
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.usuario_id, usuarioDueno.id));
    await db.delete(usuarios).where(eq(usuarios.id, usuarioMesero.id));
    await db.delete(usuarios).where(eq(usuarios.id, usuarioGerente.id));
    await db.delete(usuarios).where(eq(usuarios.id, usuarioDueno.id));
    await db.delete(restaurantes).where(eq(restaurantes.id, restauranteA.id));
    await db.delete(restaurantes).where(eq(restaurantes.id, restauranteB.id));
  });

  describe("1. Control de Acceso Estricto (Rol 'dueno')", () => {
    it("un usuario con rol 'mesero' no puede acceder a las métricas del dashboard", async () => {
      const res = await obtenerMetricasMultiSucursal(usuarioMesero.id);
      expect(res.autorizado).toBe(false);
      expect(res.sucursales).toHaveLength(0);
      expect(res.consolidado).toBeNull();
    });

    it("un usuario con rol 'gerente' sin vínculo 'dueno' no puede acceder al dashboard", async () => {
      const res = await obtenerMetricasMultiSucursal(usuarioGerente.id);
      expect(res.autorizado).toBe(false);
      expect(res.sucursales).toHaveLength(0);
    });

    it("un usuario con rol 'dueno' sí está autorizado y detecta sus restaurantes vinculados", async () => {
      const res = await obtenerMetricasMultiSucursal(usuarioDueno.id);
      expect(res.autorizado).toBe(true);
      expect(res.restaurantes_disponibles).toHaveLength(2);
      expect(res.sucursales).toHaveLength(2);
      expect(res.consolidado).not.toBeNull();
    });
  });

  describe("2. Segregación Estricta Multi-Sucursal e Integridad en PostgreSQL", () => {
    it("las ventas de Restaurante A y Restaurante B se mantienen completamente aisladas", async () => {
      // Insertar órdenes reales en PostgreSQL
      // En Restaurante A: 2 órdenes pagadas ($150.00 y $350.00) = $500.00
      // 1 orden cancelada ($200.00) que NO debe sumarse
      await db.insert(ordenes).values([
        {
          restaurante_id: restauranteA.id,
          mesa_id: mesaA.id,
          estado: "pagado",
          total: "150.00",
        },
        {
          restaurante_id: restauranteA.id,
          mesa_id: mesaA.id,
          estado: "pagado",
          total: "350.00",
        },
        {
          restaurante_id: restauranteA.id,
          mesa_id: mesaA.id,
          estado: "cancelado",
          total: "200.00",
        },
      ]);

      // En Restaurante B: 1 orden pagada ($750.00) y 1 orden pendiente ($400.00)
      await db.insert(ordenes).values([
        {
          restaurante_id: restauranteB.id,
          mesa_id: mesaB.id,
          estado: "pagado",
          total: "750.00",
        },
        {
          restaurante_id: restauranteB.id,
          mesa_id: mesaB.id,
          estado: "abierta",
          total: "400.00",
        },
      ]);

      const metricas = await obtenerMetricasMultiSucursal(usuarioDueno.id);

      const sucursalA = metricas.sucursales.find((s) => s.restaurante.id === restauranteA.id);
      const sucursalB = metricas.sucursales.find((s) => s.restaurante.id === restauranteB.id);

      expect(sucursalA).toBeDefined();
      expect(sucursalB).toBeDefined();

      // Validación matemática exacta contra PostgreSQL:
      // Sucursal A debe tener exactamente $500.00 y 2 órdenes pagadas
      expect(sucursalA?.ventas.hoy).toBe(500.0);
      expect(sucursalA?.ventas.ordenes_hoy).toBe(2);

      // Sucursal B debe tener exactamente $750.00 y 1 orden pagada
      expect(sucursalB?.ventas.hoy).toBe(750.0);
      expect(sucursalB?.ventas.ordenes_hoy).toBe(1);

      // Aserción explícita de NO mezcla de datos:
      expect(sucursalA?.ventas.hoy).not.toBe(sucursalB?.ventas.hoy);
      expect(sucursalA?.ventas.hoy).not.toBe(1250.0); // No debe contener el consolidado
      expect(sucursalB?.ventas.hoy).not.toBe(1250.0); // No debe contener el consolidado

      // El total consolidado debe ser exactamente $1250.00 y estar etiquetado explícitamente
      expect(metricas.consolidado?.ventas_hoy).toBe(1250.0);
      expect(metricas.consolidado?.etiqueta).toContain("Total consolidado de 2 restaurantes");
    });
  });

  describe("3. Idempotencia y Seguridad del Cron de Reporte Diario", () => {
    it("el endpoint cron rechaza con 401 Unauthorized llamadas sin el CRON_SECRET correcto", async () => {
      const reqSinAuth = new NextRequest("http://localhost:3000/api/cron/reporte-diario");
      const resSinAuth = await cronReporteDiarioHandler(reqSinAuth);
      expect(resSinAuth.status).toBe(401);

      const reqAuthInvalido = new NextRequest("http://localhost:3000/api/cron/reporte-diario", {
        headers: { authorization: "Bearer token_falso_incorrecto" },
      });
      const resAuthInvalido = await cronReporteDiarioHandler(reqAuthInvalido);
      expect(resAuthInvalido.status).toBe(401);
    });

    it("previene reportes duplicados mediante la restricción UNIQUE en reportes_diarios_enviados", async () => {
      const fechaHoy = new Date().toISOString().split("T")[0];

      // Primera inserción: tiene éxito
      const [primerEnvio] = await db
        .insert(reportesDiariosEnviados)
        .values({
          restaurante_id: restauranteA.id,
          fecha: fechaHoy,
          datos_resumen: { ventas: 500 },
        })
        .returning();

      expect(primerEnvio).toBeDefined();

      // Segunda inserción para el MISMO restaurante en la MISMA fecha:
      // PostgreSQL debe rechazarla con error de violación de clave única (code: 23505)
      let capturoDuplicado = false;
      try {
        await db.insert(reportesDiariosEnviados).values({
          restaurante_id: restauranteA.id,
          fecha: fechaHoy,
          datos_resumen: { ventas: 500 },
        });
      } catch (err: any) {
        capturoDuplicado = true;
        const codigoError = err?.code ?? err?.cause?.code;
        expect(codigoError).toBe("23505");
      }

      expect(capturoDuplicado).toBe(true);

      // Comprobar que en la base de datos solo quedó exactamente 1 registro para esa fecha
      const registros = await db
        .select()
        .from(reportesDiariosEnviados)
        .where(
          and(
            eq(reportesDiariosEnviados.restaurante_id, restauranteA.id),
            eq(reportesDiariosEnviados.fecha, fechaHoy)
          )
        );

      expect(registros).toHaveLength(1);
    });
  });
});
