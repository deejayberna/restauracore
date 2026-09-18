import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  mesas,
  categoriasMenu,
  platillos,
  ingredientes,
  recetas,
  ordenes,
  ordenItems,
  solicitudesCancelacionItem,
  movimientosInventario,
  turnos,
  pagos,
  logAuditoria,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  cancelarItemAction,
  aprobarCancelacionItemAction,
  rechazarCancelacionItemAction,
  editarItemPendienteAction,
} from "@/lib/cancelaciones-actions";
import {
  registrarPagoParcialAction,
  obtenerReportePropinasTurnoAction,
} from "@/lib/pagos-actions";
import { regenerarTokenMesaAction } from "@/lib/mesas-actions";
import { confirmarPedido, solicitarCuentaAction } from "@/lib/pedido-actions";
import { capturarConteoFisicoAction, obtenerResumenCajaSistema } from "@/lib/caja-actions";
import { NextRequest } from "next/server";
import { GET as verifyRolHandler } from "@/app/api/auth/verify-rol/route";

// Control dinámico del usuario mockeado en la sesión
let mockAuthUserId = "";
let mockRestauranteActivoId = "";

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockAuthUserId ? { id: mockAuthUserId } : null },
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

vi.mock("@/lib/notificaciones", async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    enviarNotificacionSolicitudCancelacion: vi.fn().mockResolvedValue(undefined),
    enviarNotificacionDiscrepanciaCaja: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Fase 9.3 — Cuenta Abierta, Cancelaciones Anti-Fraude y Pagos Divididos", () => {
  const timestamp = Date.now();

  let restTest: any;
  let mesaTest: any;
  let ingCarne: any;
  let ingQueso: any;
  let catMenu: any;
  let platHamburguesa: any;
  let platPapas: any;

  let uGerente: any;
  let uMesero: any;
  let uCajero: any;

  beforeAll(async () => {
    // 1. Crear restaurante de prueba
    const [r] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Fase 9.3 ${timestamp}`,
        timezone: "America/Mexico_City",
      })
      .returning();
    restTest = r;
    mockRestauranteActivoId = restTest.id;

    // 2. Crear usuarios
    const [g] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-g-${timestamp}`,
        nombre: "Gerente Ana",
        email: `gerente-${timestamp}@test.com`,
      })
      .returning();
    uGerente = g;

    const [m] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-m-${timestamp}`,
        nombre: "Mesero Carlos",
        email: `mesero-${timestamp}@test.com`,
      })
      .returning();
    uMesero = m;

    const [c] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-c-${timestamp}`,
        nombre: "Cajero Luis",
        email: `cajero-${timestamp}@test.com`,
      })
      .returning();
    uCajero = c;

    // Vincular roles
    await db.insert(usuarioRestaurantes).values([
      {
        usuario_id: uGerente.id,
        restaurante_id: restTest.id,
        rol: "gerente",
        activo: true,
      },
      {
        usuario_id: uMesero.id,
        restaurante_id: restTest.id,
        rol: "mesero",
        activo: true,
      },
      {
        usuario_id: uCajero.id,
        restaurante_id: restTest.id,
        rol: "cajero",
        activo: true,
      },
    ]);

    // 3. Crear mesa con qr_token
    const [mesa] = await db
      .insert(mesas)
      .values({
        restaurante_id: restTest.id,
        numero: 88,
        qr_token: `token-mesa-${timestamp}`,
      })
      .returning();
    mesaTest = mesa;

    // 4. Crear ingredientes
    const [ing1] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restTest.id,
        nombre: `Carne Res ${timestamp}`,
        unidad_medida: "kg",
        costo_unitario: "150.0000",
        stock_actual: "25.000",
        stock_minimo: "5.000",
      })
      .returning();
    ingCarne = ing1;

    const [ing2] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restTest.id,
        nombre: `Queso ${timestamp}`,
        unidad_medida: "kg",
        costo_unitario: "80.0000",
        stock_actual: "20.000",
        stock_minimo: "3.000",
      })
      .returning();
    ingQueso = ing2;

    // 5. Crear categoría y platillos
    const [cat] = await db
      .insert(categoriasMenu)
      .values({
        restaurante_id: restTest.id,
        nombre: `Platos Fuertes ${timestamp}`,
      })
      .returning();
    catMenu = cat;

    const [plat1] = await db
      .insert(platillos)
      .values({
        restaurante_id: restTest.id,
        categoria_id: catMenu.id,
        nombre: `Hamburguesa Especial ${timestamp}`,
        precio: "180.00",
        disponible: true,
      })
      .returning();
    platHamburguesa = plat1;

    const [plat2] = await db
      .insert(platillos)
      .values({
        restaurante_id: restTest.id,
        categoria_id: catMenu.id,
        nombre: `Papas Fritas ${timestamp}`,
        precio: "70.00",
        disponible: true,
      })
      .returning();
    platPapas = plat2;

    // Crear recetas (Hamburguesa lleva 0.2 kg de carne y 0.05 kg de queso)
    await db.insert(recetas).values([
      {
        platillo_id: platHamburguesa.id,
        ingrediente_id: ingCarne.id,
        cantidad_requerida: "0.200",
      },
      {
        platillo_id: platHamburguesa.id,
        ingrediente_id: ingQueso.id,
        cantidad_requerida: "0.050",
      },
    ]);
  });

  afterAll(async () => {
    // Limpieza de datos
    if (restTest) {
      await db.delete(solicitudesCancelacionItem).where(eq(solicitudesCancelacionItem.restaurante_id, restTest.id));
      await db.delete(pagos).where(eq(pagos.restaurante_id, restTest.id));
      await db.delete(movimientosInventario).where(
        sql`${movimientosInventario.ingrediente_id} IN (${ingCarne.id}, ${ingQueso.id})`
      );
      await db.delete(ordenItems).where(
        sql`${ordenItems.orden_id} IN (SELECT id FROM ${ordenes} WHERE restaurante_id = ${restTest.id})`
      );
      await db.delete(ordenes).where(eq(ordenes.restaurante_id, restTest.id));
      await db.delete(recetas).where(
        sql`${recetas.platillo_id} IN (${platHamburguesa.id}, ${platPapas.id})`
      );
      await db.delete(platillos).where(eq(platillos.restaurante_id, restTest.id));
      await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restTest.id));
      await db.delete(ingredientes).where(eq(ingredientes.restaurante_id, restTest.id));
      await db.delete(mesas).where(eq(mesas.restaurante_id, restTest.id));
      await db.delete(turnos).where(eq(turnos.restaurante_id, restTest.id));
      await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restTest.id));
      await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restTest.id));
      await db.delete(usuarios).where(
        sql`${usuarios.id} IN (${uGerente.id}, ${uMesero.id}, ${uCajero.id})`
      );
      await db.delete(restaurantes).where(eq(restaurantes.id, restTest.id));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Modelo de Cuenta Abierta (confirmarPedido acumula rondas en la misma orden)
  // ───────────────────────────────────────────────────────────────────────────
  it("1. Modelo de cuenta abierta: rondas sucesivas de la misma mesa se acumulan en una única orden", async () => {
    // Ronda 1: 1 hamburguesa ($180)
    const formData1 = new FormData();
    formData1.append("qr_token", mesaTest.qr_token);
    formData1.append("items", JSON.stringify([{ platillo_id: platHamburguesa.id, cantidad: 1 }]));

    const resRonda1 = await confirmarPedido(null, formData1);
    expect(resRonda1.ok).toBe(true);
    const ordenIdRonda1 = resRonda1.orden_id;

    // Verificar en BD
    const orden1 = await db.query.ordenes.findFirst({ where: eq(ordenes.id, ordenIdRonda1!) });
    expect(orden1?.estado).toBe("abierta");
    expect(Number(orden1?.total)).toBe(180.0);

    // Ronda 2: 1 papas ($70) pedidas 15 minutos después en la misma mesa
    const formData2 = new FormData();
    formData2.append("qr_token", mesaTest.qr_token);
    formData2.append("items", JSON.stringify([{ platillo_id: platPapas.id, cantidad: 1 }]));

    const resRonda2 = await confirmarPedido(null, formData2);
    expect(resRonda2.ok).toBe(true);
    // Debe reutilizar el mismo orden_id de la cuenta abierta
    expect(resRonda2.orden_id).toBe(ordenIdRonda1);

    const ordenAcumulada = await db.query.ordenes.findFirst({ where: eq(ordenes.id, ordenIdRonda1!) });
    expect(ordenAcumulada?.estado).toBe("abierta");
    expect(Number(ordenAcumulada?.total)).toBe(250.0); // 180 + 70 = 250

    // Solicitar cuenta
    mockAuthUserId = uMesero.auth_id;
    const resSolicitar = await solicitarCuentaAction(ordenIdRonda1!);
    expect(resSolicitar.ok).toBe(true);

    const ordenSolicitada = await db.query.ordenes.findFirst({ where: eq(ordenes.id, ordenIdRonda1!) });
    expect(ordenSolicitada?.estado).toBe("cuenta_solicitada");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Cancelación directa de item en 'pendiente' por mesero (sin merma)
  // ───────────────────────────────────────────────────────────────────────────
  it("2. Cancelación directa de item en 'pendiente': mesero cancela sin merma y descuenta total", async () => {
    mockAuthUserId = uMesero.auth_id;

    // Crear orden con 2 items
    const [ordenTest] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        estado: "abierta",
        subtotal: "360.00",
        total: "360.00",
      })
      .returning();

    const [item1] = await db
      .insert(ordenItems)
      .values({
        orden_id: ordenTest.id,
        platillo_id: platHamburguesa.id,
        cantidad: 1,
        precio_unitario_congelado: "180.00",
        estado: "pendiente",
      })
      .returning();

    const [item2] = await db
      .insert(ordenItems)
      .values({
        orden_id: ordenTest.id,
        platillo_id: platHamburguesa.id,
        cantidad: 1,
        precio_unitario_congelado: "180.00",
        estado: "pendiente",
      })
      .returning();

    // Mesero cancela item1 directamente
    const res = await cancelarItemAction({
      itemId: item1.id,
      motivo: "Cliente se equivocó al pedir",
    });

    expect(res.ok).toBe(true);
    expect(res.accion).toBe("cancelado_directo");

    // Verificar en BD
    const itemActualizado = await db.query.ordenItems.findFirst({ where: eq(ordenItems.id, item1.id) });
    expect(itemActualizado?.estado).toBe("cancelado");

    const ordenActualizada = await db.query.ordenes.findFirst({ where: eq(ordenes.id, ordenTest.id) });
    expect(Number(ordenActualizada?.total)).toBe(180.0); // 360 - 180 = 180

    // Verificar que NO se generó ninguna merma en movimientos_inventario
    const mermas = await db.query.movimientosInventario.findMany({
      where: and(
        eq(movimientosInventario.orden_id, ordenTest.id),
        eq(movimientosInventario.tipo, "merma")
      ),
    });
    expect(mermas).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Edición de variantes/notas solo permitida en 'pendiente'
  // ───────────────────────────────────────────────────────────────────────────
  it("3. Edición de notas/variantes: permitida en 'pendiente', bloqueada en 'en_preparacion'", async () => {
    mockAuthUserId = uMesero.auth_id;

    const [orden] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        estado: "abierta",
        subtotal: "180.00",
        total: "180.00",
      })
      .returning();

    const [item] = await db
      .insert(ordenItems)
      .values({
        orden_id: orden.id,
        platillo_id: platHamburguesa.id,
        cantidad: 1,
        precio_unitario_congelado: "180.00",
        estado: "pendiente",
      })
      .returning();

    // Editar en pendiente: éxito
    const resEdicion = await editarItemPendienteAction({
      itemId: item.id,
      notas: "Sin cebolla y extra mayonesa",
    });
    expect(resEdicion.ok).toBe(true);

    const itemEditado = await db.query.ordenItems.findFirst({ where: eq(ordenItems.id, item.id) });
    expect(itemEditado?.notas).toBe("Sin cebolla y extra mayonesa");

    // Mover item a 'en_preparacion'
    await db.update(ordenItems).set({ estado: "en_preparacion" }).where(eq(ordenItems.id, item.id));

    // Intentar editar ahora: debe ser rechazado
    const resEdicionBloqueada = await editarItemPendienteAction({
      itemId: item.id,
      notas: "Intento tardío",
    });
    expect(resEdicionBloqueada.ok).toBe(false);
    expect(resEdicionBloqueada.error).toContain("No se permite editar");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Solicitud de cancelación post-preparación (notificación anti-silencio y rechazo)
  // ───────────────────────────────────────────────────────────────────────────
  it("4. Solicitud de cancelación post-preparación y flujo de rechazo con preservación de estado", async () => {
    mockAuthUserId = uMesero.auth_id;

    const [orden] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        estado: "abierta",
        subtotal: "180.00",
        total: "180.00",
      })
      .returning();

    const [item] = await db
      .insert(ordenItems)
      .values({
        orden_id: orden.id,
        platillo_id: platHamburguesa.id,
        cantidad: 1,
        precio_unitario_congelado: "180.00",
        estado: "listo",
      })
      .returning();

    // Mesero solicita cancelación de item en 'listo'
    const resSolicitud = await cancelarItemAction({
      itemId: item.id,
      motivo: "Cliente canceló porque tardó mucho",
    });

    expect(resSolicitud.ok).toBe(true);
    expect(resSolicitud.accion).toBe("solicitud_creada");
    expect(resSolicitud.solicitud_id).toBeDefined();

    // El item original NO se ha cancelado todavía (sigue en 'listo')
    const itemPreResolucion = await db.query.ordenItems.findFirst({ where: eq(ordenItems.id, item.id) });
    expect(itemPreResolucion?.estado).toBe("listo");

    // Verificar que la solicitud existe en estado 'pendiente'
    const solicitud = await db.query.solicitudesCancelacionItem.findFirst({
      where: eq(solicitudesCancelacionItem.id, resSolicitud.solicitud_id!),
    });
    expect(solicitud?.estado).toBe("pendiente");

    // Flujo de RECHAZO por parte de Gerencia:
    mockAuthUserId = uGerente.auth_id;
    const resRechazo = await rechazarCancelacionItemAction({
      solicitudId: resSolicitud.solicitud_id!,
      motivoRechazo: "El platillo ya fue entregado a la mesa y se está consumiendo",
    });

    expect(resRechazo.ok).toBe(true);

    // Solicitud pasa a 'rechazada' con su motivo visible
    const solicitudRechazada = await db.query.solicitudesCancelacionItem.findFirst({
      where: eq(solicitudesCancelacionItem.id, resSolicitud.solicitud_id!),
    });
    expect(solicitudRechazada?.estado).toBe("rechazada");
    expect(solicitudRechazada?.motivo_resolucion).toContain("consumiendo");

    // Item sigue operativo en su estado anterior ('listo') y total intacto
    const itemPostRechazo = await db.query.ordenItems.findFirst({ where: eq(ordenItems.id, item.id) });
    expect(itemPostRechazo?.estado).toBe("listo");

    const ordenPostRechazo = await db.query.ordenes.findFirst({ where: eq(ordenes.id, orden.id) });
    expect(Number(ordenPostRechazo?.total)).toBe(180.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Exigencia de justificación obligatoria en items 'entregado'
  // ───────────────────────────────────────────────────────────────────────────
  it("5. Exige justificación detallada obligatoria (mínimo 10 caracteres) para cancelar items 'entregado'", async () => {
    mockAuthUserId = uMesero.auth_id;

    const [orden] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        estado: "abierta",
        total: "180.00",
      })
      .returning();

    const [item] = await db
      .insert(ordenItems)
      .values({
        orden_id: orden.id,
        platillo_id: platHamburguesa.id,
        cantidad: 1,
        precio_unitario_congelado: "180.00",
        estado: "entregado",
      })
      .returning();

    // Intento con justificación corta o vacía
    const resSolicitud = await cancelarItemAction({
      itemId: item.id,
      motivo: "error", // Menos de 10 caracteres
    });
    expect(resSolicitud.ok).toBe(false);
    expect(resSolicitud.error).toContain("mínimo 10 caracteres");

    // Con justificación válida
    const resValida = await cancelarItemAction({
      itemId: item.id,
      motivo: "Platillo entregado frío según queja del comensal",
    });
    expect(resValida.ok).toBe(true);
    expect(resValida.accion).toBe("solicitud_creada");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Concurrencia Real en PostgreSQL (Promise.all) en aprobación de cancelación
  // ───────────────────────────────────────────────────────────────────────────
  it("6. Garantía de atomicidad y concurrencia real contra PostgreSQL (Promise.all): dos gerentes aprobando la misma solicitud", async () => {
    mockAuthUserId = uMesero.auth_id;

    const [orden] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        estado: "abierta",
        subtotal: "180.00",
        total: "180.00",
      })
      .returning();

    const [item] = await db
      .insert(ordenItems)
      .values({
        orden_id: orden.id,
        platillo_id: platHamburguesa.id,
        cantidad: 1,
        precio_unitario_congelado: "180.00",
        estado: "listo",
      })
      .returning();

    const resSol = await cancelarItemAction({
      itemId: item.id,
      motivo: "Prueba concurrencia de cancelacion",
    });
    expect(resSol.ok).toBe(true);
    const solicitudId = resSol.solicitud_id!;

    // Dos llamadas concurrentes a aprobarCancelacionItemAction
    mockAuthUserId = uGerente.auth_id;

    const [res1, res2] = await Promise.all([
      aprobarCancelacionItemAction({ solicitudId, motivoResolucion: "Aprobación Gerente 1" }),
      aprobarCancelacionItemAction({ solicitudId, motivoResolucion: "Aprobación Gerente 2" }),
    ]);

    // Exactamente UNA debe tener ok: true y la otra ok: false
    const aprobadas = [res1, res2].filter((r) => r.ok === true);
    const rechazadas = [res1, res2].filter((r) => r.ok === false);

    expect(aprobadas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].error).toContain("ya fue resuelta previamente");

    // Verificar en BD que se generó EXACTAMENTE 1 merma por cada ingrediente (0 mermas duplicadas)
    const mermasCarne = await db.query.movimientosInventario.findMany({
      where: and(
        eq(movimientosInventario.ingrediente_id, ingCarne.id),
        eq(movimientosInventario.tipo, "merma"),
        eq(movimientosInventario.orden_id, orden.id)
      ),
    });
    expect(mermasCarne).toHaveLength(1);

    // Total de la orden descontado exactamente 1 sola vez
    const ordenFinal = await db.query.ordenes.findFirst({ where: eq(ordenes.id, orden.id) });
    expect(Number(ordenFinal?.total)).toBe(0.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Merma automática con flag 'revision_pendiente' cuando supera umbral
  // ───────────────────────────────────────────────────────────────────────────
  it("7. Merma automática marca 'revision_pendiente: true' cuando el monto supera el umbral", async () => {
    mockAuthUserId = uMesero.auth_id;

    // 5 hamburguesas = 5 * 0.2 kg carne = 1.0 kg * $150 = $150 MXN (supera umbral de $50)
    const [orden] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        estado: "abierta",
        total: "900.00",
      })
      .returning();

    const [item] = await db
      .insert(ordenItems)
      .values({
        orden_id: orden.id,
        platillo_id: platHamburguesa.id,
        cantidad: 5,
        precio_unitario_congelado: "180.00",
        estado: "listo",
      })
      .returning();

    const resSol = await cancelarItemAction({
      itemId: item.id,
      motivo: "Mesa numerosa canceló pedido completo",
    });
    const solicitudId = resSol.solicitud_id!;

    mockAuthUserId = uGerente.auth_id;
    const resAprob = await aprobarCancelacionItemAction({
      solicitudId,
      motivoResolucion: "Aprobada por gerencia general",
    });
    expect(resAprob.ok).toBe(true);

    // Buscar la merma generada
    const [mermaCarne] = await db.query.movimientosInventario.findMany({
      where: and(
        eq(movimientosInventario.ingrediente_id, ingCarne.id),
        eq(movimientosInventario.tipo, "merma"),
        eq(movimientosInventario.orden_id, orden.id)
      ),
    });

    expect(mermaCarne).toBeDefined();
    expect(mermaCarne.revision_pendiente).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Prohibición absoluta de cancelar items si la orden ya está pagada
  // ───────────────────────────────────────────────────────────────────────────
  it("8. Prohibición absoluta de cancelar items en orden pagada", async () => {
    mockAuthUserId = uMesero.auth_id;

    const [ordenPagada] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        estado: "pagado",
        total: "180.00",
      })
      .returning();

    const [item] = await db
      .insert(ordenItems)
      .values({
        orden_id: ordenPagada.id,
        platillo_id: platHamburguesa.id,
        cantidad: 1,
        precio_unitario_congelado: "180.00",
        estado: "pendiente",
      })
      .returning();

    const res = await cancelarItemAction({
      itemId: item.id,
      motivo: "Intento fraudulento post-cobro",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("cuenta ya pagada");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: Pagos divididos con propina desglosada y transición a 'pagado'
  // ───────────────────────────────────────────────────────────────────────────
  it("9. Pagos divididos con propina desglosada: orden pasa a 'pagado' solo al completar el total exacto", async () => {
    mockAuthUserId = uCajero.auth_id;

    // Crear turno activo para el cajero
    const [turno] = await db
      .insert(turnos)
      .values({
        restaurante_id: restTest.id,
        codigo: `TURNO-PAGOS-${timestamp}`,
        estado: "abierto",
        abierto_por: uCajero.id,
        responsable_id: uCajero.id,
      })
      .returning();

    // Orden de $500.00 atendida por Mesero Carlos
    const [orden] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restTest.id,
        mesa_id: mesaTest.id,
        mesero_id: uMesero.id,
        estado: "cuenta_solicitada",
        subtotal: "500.00",
        total: "500.00",
      })
      .returning();

    // Pago Parcial 1: $300.00 en efectivo + $30.00 propina en efectivo
    const resPago1 = await registrarPagoParcialAction({
      orden_id: orden.id,
      monto: 300.0,
      metodo_pago: "efectivo",
      propina_monto: 30.0,
      propina_metodo: "efectivo",
      turno_id: turno.id,
    });

    expect(resPago1.ok).toBe(true);
    expect(resPago1.total_acumulado).toBe(300.0);
    expect(resPago1.restante).toBe(200.0);
    expect(resPago1.orden_pagada).toBe(false);

    // Verificar que la orden sigue en 'cuenta_solicitada'
    const ordenTrasPago1 = await db.query.ordenes.findFirst({ where: eq(ordenes.id, orden.id) });
    expect(ordenTrasPago1?.estado).toBe("cuenta_solicitada");

    // Intento de sobrepago: pagar $250 cuando solo restan $200 -> debe rechazarse
    const resPagoExceso = await registrarPagoParcialAction({
      orden_id: orden.id,
      monto: 250.0,
      metodo_pago: "tarjeta",
      turno_id: turno.id,
    });
    expect(resPagoExceso.ok).toBe(false);
    expect(resPagoExceso.error).toContain("excede el total");

    // Pago Parcial 2: $200.00 exactos en tarjeta + $40.00 propina en tarjeta
    const resPago2 = await registrarPagoParcialAction({
      orden_id: orden.id,
      monto: 200.0,
      metodo_pago: "tarjeta",
      propina_monto: 40.0,
      propina_metodo: "tarjeta",
      turno_id: turno.id,
    });

    expect(resPago2.ok).toBe(true);
    expect(resPago2.total_acumulado).toBe(500.0);
    expect(resPago2.restante).toBe(0.0);
    expect(resPago2.orden_pagada).toBe(true);

    // Verificar que la orden transicionó a 'pagado'
    const ordenFinal = await db.query.ordenes.findFirst({ where: eq(ordenes.id, orden.id) });
    expect(ordenFinal?.estado).toBe("pagado");

    // Verificar que la tabla 'pagos' tiene los dos registros con sus propinas desglosadas
    const pagosRegistrados = await db.query.pagos.findMany({
      where: eq(pagos.orden_id, orden.id),
      orderBy: (pagos, { asc }) => [asc(pagos.creado_en)],
    });
    expect(pagosRegistrados).toHaveLength(2);
    expect(Number(pagosRegistrados[0].monto)).toBe(300.0);
    expect(Number(pagosRegistrados[0].propina_monto)).toBe(30.0);
    expect(pagosRegistrados[0].metodo_pago).toBe("efectivo");

    expect(Number(pagosRegistrados[1].monto)).toBe(200.0);
    expect(Number(pagosRegistrados[1].propina_monto)).toBe(40.0);
    expect(pagosRegistrados[1].metodo_pago).toBe("tarjeta");

    // Verificar reporte de propinas para el turno
    mockAuthUserId = uGerente.auth_id;
    const resReporte = await obtenerReportePropinasTurnoAction(turno.id);
    expect(resReporte.ok).toBe(true);
    expect(resReporte.reporte?.totales.global).toBe(70.0);
    expect(resReporte.reporte?.totales.efectivo).toBe(30.0);
    expect(resReporte.reporte?.totales.tarjeta).toBe(40.0);

    // Verificar desglose por mesero
    const reporteMesero = resReporte.reporte?.meseros.find((m: any) => m.mesero_id === uMesero.id);
    expect(reporteMesero).toBeDefined();
    expect(reporteMesero?.total_propina).toBe(70.0);

    // Verificar que el arqueo de caja (obtenerResumenCajaSistema) leyó de 'pagos'
    const resumenCaja = await obtenerResumenCajaSistema(restTest.id, { turno_id: turno.id });
    expect(resumenCaja.efectivo).toBe(300.0);
    expect(resumenCaja.tarjeta).toBe(200.0);
    expect(resumenCaja.total).toBe(500.0);
    expect(resumenCaja.ordenes_count).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 10: Regeneración de token QR de mesa con auditoría
  // ───────────────────────────────────────────────────────────────────────────
  it("10. Regeneración de token QR de mesa: invalida el QR anterior y registra auditoría", async () => {
    mockAuthUserId = uGerente.auth_id;

    const tokenAnterior = mesaTest.qr_token;
    const resRegen = await regenerarTokenMesaAction(mesaTest.id);

    expect(resRegen.ok).toBe(true);
    expect(resRegen.nuevo_token).toBeDefined();
    expect(resRegen.nuevo_token).not.toBe(tokenAnterior);

    // Verificar en BD que el token cambió
    const mesaActualizada = await db.query.mesas.findFirst({ where: eq(mesas.id, mesaTest.id) });
    expect(mesaActualizada?.qr_token).toBe(resRegen.nuevo_token);

    // Verificar auditoría
    const logRegen = await db.query.logAuditoria.findFirst({
      where: and(
        eq(logAuditoria.restaurante_id, restTest.id),
        eq(logAuditoria.accion, "REGENERACION_QR_MESA"),
        eq(logAuditoria.registro_id, mesaTest.id)
      ),
    });
    expect(logRegen).toBeDefined();
    expect((logRegen?.valores_anteriores as any)?.qr_token).toBe(tokenAnterior);
    expect((logRegen?.valores_nuevos as any)?.qr_token).toBe(resRegen.nuevo_token);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 11: Control de responsable_id en captura de caja: rechazo a usuario no asignado
  // ───────────────────────────────────────────────────────────────────────────
  it("11. Control de turnos por responsable_id: un mesero/cajero no asignado es rechazado y auditado", async () => {
    // 1. Crear turno con responsable_id asignado a uCajero
    const codigoTurno = `TURNO-RESP-${Date.now()}`;
    const [turnoResp] = await db
      .insert(turnos)
      .values({
        restaurante_id: restTest.id,
        codigo: codigoTurno,
        estado: "abierto",
        abierto_por: uGerente.id,
        responsable_id: uCajero.id,
      })
      .returning();

    // 2. Intentar capturar conteo con uMesero (rol 'mesero', no es el responsable asignado)
    mockAuthUserId = uMesero.auth_id;

    await expect(
      capturarConteoFisicoAction({
        turno_id: turnoResp.id,
        efectivo: 100,
        tarjeta: 0,
        transferencia: 0,
      })
    ).rejects.toThrow(
      "Control de turno: Solo el responsable asignado a este turno (o un gerente/dueño) puede capturar el conteo físico."
    );

    // 3. Verificar que se insertó registro en log_auditoria con 'INTENTO_NO_AUTORIZADO_CAPTURA_CAJA_TURNO_AJENO'
    const auditIntento = await db.query.logAuditoria.findFirst({
      where: and(
        eq(logAuditoria.restaurante_id, restTest.id),
        eq(logAuditoria.accion, "INTENTO_NO_AUTORIZADO_CAPTURA_CAJA_TURNO_AJENO"),
        eq(logAuditoria.registro_id, turnoResp.id)
      ),
    });

    expect(auditIntento).toBeDefined();
    expect(auditIntento?.usuario_id).toBe(uMesero.id);
    expect((auditIntento?.valores_nuevos as any)?.responsable_asignado_id).toBe(uCajero.id);

    // 4. Con uCajero (responsable legítimo), la captura tiene éxito
    mockAuthUserId = uCajero.auth_id;
    const resLegitimo = await capturarConteoFisicoAction({
      turno_id: turnoResp.id,
      efectivo: 100,
      tarjeta: 0,
      transferencia: 0,
    });
    expect(resLegitimo.ok).toBe(true);

    // 5. Con uGerente (override gerencial permitido), la captura también tiene éxito
    mockAuthUserId = uGerente.auth_id;
    const resGerente = await capturarConteoFisicoAction({
      turno_id: turnoResp.id,
      efectivo: 100,
      tarjeta: 0,
      transferencia: 0,
    });
    expect(resGerente.ok).toBe(true);

    // Limpieza
    await db.delete(logAuditoria).where(eq(logAuditoria.registro_id, turnoResp.id));
    await db.delete(turnos).where(eq(turnos.id, turnoResp.id));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 12: Alcance de rol 'cajero': rechazo HTTP 403 fuera de caja
  // ───────────────────────────────────────────────────────────────────────────
  it("12. Alcance del rol 'cajero': es rechazado con HTTP 403 al intentar acceder a rutas fuera de caja (/cocina, /compras, /compras/nueva, /inventario/merma, /dashboard, /reportes/rentabilidad, /reportes/menu-engineering)", async () => {
    mockAuthUserId = uCajero.auth_id;

    const rutasRestringidas = [
      "/cocina",
      "/compras",
      "/compras/nueva",
      "/inventario/merma",
      "/dashboard",
      "/reportes/rentabilidad",
      "/reportes/menu-engineering",
    ];

    for (const ruta of rutasRestringidas) {
      const req = new NextRequest(
        `http://localhost:3000/api/auth/verify-rol?restaurante_id=${restTest.id}&ruta=${encodeURIComponent(ruta)}`
      );
      const res = await verifyRolHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Rol insuficiente");
    }

    // Comprobar que en /caja SÍ tiene acceso permitido
    const reqCaja = new NextRequest(
      `http://localhost:3000/api/auth/verify-rol?restaurante_id=${restTest.id}&ruta=/caja`
    );
    const resCaja = await verifyRolHandler(reqCaja);
    expect(resCaja.status).toBe(200);
    const dataCaja = await resCaja.json();
    expect(dataCaja.ok).toBe(true);
    expect(dataCaja.rol).toBe("cajero");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 13: Camino de éxito de rol 'cajero' en conteo físico asignado
  // ───────────────────────────────────────────────────────────────────────────
  it("13. Camino de éxito de rol 'cajero': captura exitosamente el conteo físico de un turno donde es el responsable asignado", async () => {
    const codigoTurno = `TURNO-CAJERO-${Date.now()}`;
    const [turno] = await db
      .insert(turnos)
      .values({
        restaurante_id: restTest.id,
        codigo: codigoTurno,
        estado: "abierto",
        abierto_por: uGerente.id,
        responsable_id: uCajero.id,
      })
      .returning();

    mockAuthUserId = uCajero.auth_id;

    const res = await capturarConteoFisicoAction({
      turno_id: turno.id,
      efectivo: 350.0,
      tarjeta: 200.0,
      transferencia: 50.0,
      notas: "Cierre de turno cajero sin incidentes",
    });

    expect(res.ok).toBe(true);
    expect(res.discrepancias.hay_discrepancia).toBeDefined();

    // Validar en la base de datos real que el turno fue actualizado por uCajero
    const turnoActualizado = await db.query.turnos.findFirst({ where: eq(turnos.id, turno.id) });
    expect(turnoActualizado?.capturado_por).toBe(uCajero.id);
    expect((turnoActualizado?.monto_fisico as any)?.efectivo).toBe(350.0);
    expect((turnoActualizado?.monto_fisico as any)?.tarjeta).toBe(200.0);
    expect((turnoActualizado?.monto_fisico as any)?.transferencia).toBe(50.0);

    // Limpieza
    await db.delete(turnos).where(eq(turnos.id, turno.id));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 14: Preservación sin regresión de rol 'mesero' en conteo físico asignado
  // ───────────────────────────────────────────────────────────────────────────
  it("14. Preservación del rol 'mesero': sigue pudiendo capturar el conteo físico de su turno asignado sin regresión", async () => {
    const codigoTurno = `TURNO-MESERO-${Date.now()}`;
    const [turno] = await db
      .insert(turnos)
      .values({
        restaurante_id: restTest.id,
        codigo: codigoTurno,
        estado: "abierto",
        abierto_por: uGerente.id,
        responsable_id: uMesero.id,
      })
      .returning();

    mockAuthUserId = uMesero.auth_id;

    const res = await capturarConteoFisicoAction({
      turno_id: turno.id,
      efectivo: 400.0,
      tarjeta: 150.0,
      transferencia: 0.0,
      notas: "Conteo físico mesero turno matutino",
    });

    expect(res.ok).toBe(true);

    // Validar en la base de datos real que el turno fue actualizado por uMesero
    const turnoActualizado = await db.query.turnos.findFirst({ where: eq(turnos.id, turno.id) });
    expect(turnoActualizado?.capturado_por).toBe(uMesero.id);
    expect((turnoActualizado?.monto_fisico as any)?.efectivo).toBe(400.0);
    expect((turnoActualizado?.monto_fisico as any)?.tarjeta).toBe(150.0);

    // Limpieza
    await db.delete(turnos).where(eq(turnos.id, turno.id));
  });
});

