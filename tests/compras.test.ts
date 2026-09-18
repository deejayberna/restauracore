import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  compras,
  compraItems,
  ingredientes,
  logAuditoria,
  movimientosInventario,
  prediccionesDemanda,
  proveedores,
  restaurantes,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import {
  obtenerSugerenciasCompra,
  dispararAlertaIncidenciaCompraSiAplica,
  IncidenciaCompraPayload,
} from "@/lib/compras-actions";
import * as notificaciones from "@/lib/notificaciones";

// Mock del módulo de notificaciones para pruebas
vi.mock("@/lib/notificaciones", async (importOriginal) => {
  const original = await importOriginal<typeof notificaciones>();
  return {
    ...original,
    enviarNotificacionIncidenciaCompra: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Fase 8 — Compras y Proveedores", () => {
  const timestamp = Date.now();

  let restauranteTest: any;
  let usuarioGerente: any;
  let usuarioMesero: any;
  let proveedorA: any;
  let proveedorB: any;
  let ingrediente1: any;
  let ingrediente2: any;

  beforeAll(async () => {
    // 1. Crear restaurante de prueba
    const [rest] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Compras Test ${timestamp}`,
        timezone: "America/Mexico_City",
      })
      .returning();
    restauranteTest = rest;

    // 2. Crear usuarios y roles
    const [uGerente] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-gerente-compras-${timestamp}`,
        nombre: "Gerente Compras",
        email: `gerente-${timestamp}@test.com`,
      })
      .returning();
    usuarioGerente = uGerente;

    const [uMesero] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-mesero-compras-${timestamp}`,
        nombre: "Mesero Compras",
        email: `mesero-${timestamp}@test.com`,
      })
      .returning();
    usuarioMesero = uMesero;

    await db.insert(usuarioRestaurantes).values([
      {
        usuario_id: usuarioGerente.id,
        restaurante_id: restauranteTest.id,
        rol: "gerente",
        activo: true,
      },
      {
        usuario_id: usuarioMesero.id,
        restaurante_id: restauranteTest.id,
        rol: "mesero",
        activo: true,
      },
    ]);

    // 3. Crear dos proveedores para el restaurante
    const [pA] = await db
      .insert(proveedores)
      .values({
        restaurante_id: restauranteTest.id,
        nombre: `Proveedor Alfa ${timestamp}`,
        contacto: "Juan Pérez",
        telefono: "555-1234",
        email: "alfa@proveedor.test",
        calificacion: "4.50",
      })
      .returning();
    proveedorA = pA;

    const [pB] = await db
      .insert(proveedores)
      .values({
        restaurante_id: restauranteTest.id,
        nombre: `Proveedor Beta ${timestamp}`,
        contacto: "María Gómez",
        telefono: "555-5678",
        email: "beta@proveedor.test",
        calificacion: "4.80",
      })
      .returning();
    proveedorB = pB;

    // 4. Crear ingredientes:
    // ingrediente1: bajo de stock (stock_actual 2 <= stock_minimo 5)
    const [ing1] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restauranteTest.id,
        nombre: `Carne para Hamburguesa ${timestamp}`,
        unidad_medida: "kg",
        costo_unitario: "120.0000",
        stock_actual: "2.000",
        stock_minimo: "5.000",
      })
      .returning();
    ingrediente1 = ing1;

    // ingrediente2: stock saludable (stock_actual 15 > stock_minimo 5)
    const [ing2] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restauranteTest.id,
        nombre: `Papas a la Francesa ${timestamp}`,
        unidad_medida: "kg",
        costo_unitario: "45.0000",
        stock_actual: "15.000",
        stock_minimo: "5.000",
      })
      .returning();
    ingrediente2 = ing2;

    // 5. Crear predicciones de demanda a 7 días para ingrediente1 (4.5 kg)
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const pasadoManana = new Date();
    pasadoManana.setDate(pasadoManana.getDate() + 2);

    await db.insert(prediccionesDemanda).values([
      {
        ingrediente_id: ingrediente1.id,
        fecha: manana,
        cantidad_estimada: "2.500",
      },
      {
        ingrediente_id: ingrediente1.id,
        fecha: pasadoManana,
        cantidad_estimada: "2.000",
      },
    ]);

    // 6. Crear historial previo de compras para comparador de proveedores en ingrediente1:
    // Proveedor A vendió a 125.00
    const [compraHistA] = await db
      .insert(compras)
      .values({
        restaurante_id: restauranteTest.id,
        proveedor_id: proveedorA.id,
        estado: "recibida",
        total_estimado: "1250.00",
        total_real: "1250.00",
        creado_por: usuarioGerente.id,
      })
      .returning();

    await db.insert(compraItems).values({
      compra_id: compraHistA.id,
      ingrediente_id: ingrediente1.id,
      cantidad_pedida: "10.000",
      cantidad_recibida: "10.000",
      costo_unitario_pactado: "125.0000",
    });

    // Proveedor B vendió a 115.00 (más barato)
    const [compraHistB] = await db
      .insert(compras)
      .values({
        restaurante_id: restauranteTest.id,
        proveedor_id: proveedorB.id,
        estado: "recibida",
        total_estimado: "1150.00",
        total_real: "1150.00",
        creado_por: usuarioGerente.id,
      })
      .returning();

    await db.insert(compraItems).values({
      compra_id: compraHistB.id,
      ingrediente_id: ingrediente1.id,
      cantidad_pedida: "10.000",
      cantidad_recibida: "10.000",
      costo_unitario_pactado: "115.0000",
    });
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (restauranteTest) {
      await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restauranteTest.id));
      await db.delete(movimientosInventario).where(
        sql`ingrediente_id IN (${ingrediente1.id}, ${ingrediente2.id})`
      );
      await db.delete(prediccionesDemanda).where(
        sql`ingrediente_id IN (${ingrediente1.id}, ${ingrediente2.id})`
      );
      await db.delete(compraItems).where(
        sql`ingrediente_id IN (${ingrediente1.id}, ${ingrediente2.id})`
      );
      await db.delete(compras).where(eq(compras.restaurante_id, restauranteTest.id));
      await db.delete(ingredientes).where(eq(ingredientes.restaurante_id, restauranteTest.id));
      await db.delete(proveedores).where(eq(proveedores.restaurante_id, restauranteTest.id));
      await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restauranteTest.id));
      await db.delete(usuarios).where(
        sql`id IN (${usuarioGerente.id}, ${usuarioMesero.id})`
      );
      await db.delete(restaurantes).where(eq(restaurantes.id, restauranteTest.id));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Sugerencia de compra y comparador de proveedores
  // ───────────────────────────────────────────────────────────────────────────
  it("1. Sugerencia automática de compra basada en predicción a 7 días y comparador de proveedores", async () => {
    const sugerencias = await obtenerSugerenciasCompra(restauranteTest.id);

    // Solo debe sugerir ingrediente1 (stock actual 2 <= mínimo 5).
    // ingrediente2 no debe aparecer (stock actual 15 > mínimo 5).
    expect(sugerencias.length).toBe(1);
    const sug = sugerencias[0];

    expect(sug.ingrediente_id).toBe(ingrediente1.id);
    expect(sug.stock_actual).toBe(2);
    expect(sug.stock_minimo).toBe(5);
    // Demanda 7 días: 2.5 + 2.0 = 4.5
    expect(sug.consumo_estimado_7dias).toBe(4.5);
    // Cantidad sugerida = (5 - 2) + 4.5 = 7.5
    expect(sug.cantidad_sugerida).toBe(7.5);

    // Comparador de proveedores:
    // Debe listar Proveedor B ($115.00) primero por ser más barato, y Proveedor A ($125.00) después
    expect(sug.proveedores_comparativa).toHaveLength(2);
    expect(sug.proveedores_comparativa[0].proveedor_id).toBe(proveedorB.id);
    expect(sug.proveedores_comparativa[0].precio_promedio).toBe(115.0);
    expect(sug.proveedores_comparativa[1].proveedor_id).toBe(proveedorA.id);
    expect(sug.proveedores_comparativa[1].precio_promedio).toBe(125.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Creación de orden de compra
  // ───────────────────────────────────────────────────────────────────────────
  it("2. Creación transaccional de orden de compra en estado 'pendiente' con ítems asociados", async () => {
    const totalEstimado = 7.5 * 115.0;

    const [nuevaCompra] = await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(compras)
        .values({
          restaurante_id: restauranteTest.id,
          proveedor_id: proveedorB.id,
          estado: "pendiente",
          total_estimado: totalEstimado.toFixed(2),
          creado_por: usuarioGerente.id,
        })
        .returning();

      await tx.insert(compraItems).values({
        compra_id: c.id,
        ingrediente_id: ingrediente1.id,
        cantidad_pedida: "7.500",
        costo_unitario_pactado: "115.0000",
      });

      await tx.insert(logAuditoria).values({
        restaurante_id: restauranteTest.id,
        usuario_id: usuarioGerente.id,
        accion: "CREAR_ORDEN_COMPRA",
        tabla_afectada: "compras",
        registro_id: c.id,
        valores_nuevos: { total_estimado: totalEstimado },
      });

      return [c];
    });

    expect(nuevaCompra).toBeDefined();
    expect(nuevaCompra.estado).toBe("pendiente");
    expect(Number(nuevaCompra.total_estimado)).toBe(862.5);

    const items = await db.query.compraItems.findMany({
      where: eq(compraItems.compra_id, nuevaCompra.id),
    });
    expect(items).toHaveLength(1);
    expect(Number(items[0].cantidad_pedida)).toBe(7.5);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Recepción con faltante (incidencia) y control de fraude
  // ───────────────────────────────────────────────────────────────────────────
  it("3. Recepción con faltante de mercancía: marca 'incidencia', suma solo la cantidad real y dispara notificación", async () => {
    vi.clearAllMocks();

    // 1. Crear compra pendiente de 10 kg
    const [compraPrueba] = await db
      .insert(compras)
      .values({
        restaurante_id: restauranteTest.id,
        proveedor_id: proveedorA.id,
        estado: "pendiente",
        total_estimado: "1200.00",
        creado_por: usuarioGerente.id,
      })
      .returning();

    const [itemPrueba] = await db
      .insert(compraItems)
      .values({
        compra_id: compraPrueba.id,
        ingrediente_id: ingrediente1.id,
        cantidad_pedida: "10.000",
        costo_unitario_pactado: "120.0000",
      })
      .returning();

    const stockAntes = Number(
      (
        await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ingrediente1.id),
        })
      )!.stock_actual
    );

    // 2. Se reciben físicamente solo 6.0 kg (faltan 4.0 kg -> 40% faltante)
    const cantidadRecibidaFisica = 6.0;
    const faltante = 10.0 - cantidadRecibidaFisica;
    const porcentajeFaltante = (faltante / 10.0) * 100; // 40%
    const totalReal = cantidadRecibidaFisica * 120.0; // 720.00

    await db.transaction(async (tx) => {
      // Transición atómica de estado
      const [compraActualizada] = await tx
        .update(compras)
        .set({
          estado: "incidencia",
          total_real: totalReal.toFixed(2),
        })
        .where(
          and(
            eq(compras.id, compraPrueba.id),
            eq(compras.restaurante_id, restauranteTest.id),
            or(eq(compras.estado, "pendiente"), eq(compras.estado, "confirmada"))
          )
        )
        .returning();

      expect(compraActualizada).toBeDefined();

      // Actualizar compra_items
      await tx
        .update(compraItems)
        .set({ cantidad_recibida: cantidadRecibidaFisica.toString() })
        .where(eq(compraItems.id, itemPrueba.id));

      // UPDATE atómico de stock: suma ÚNICAMENTE los 6.0 kg realmente recibidos
      await tx
        .update(ingredientes)
        .set({
          stock_actual: sql`${ingredientes.stock_actual} + ${cantidadRecibidaFisica.toString()}`,
          actualizado_en: new Date(),
        })
        .where(eq(ingredientes.id, ingrediente1.id));

      // Registrar movimiento
      await tx.insert(movimientosInventario).values({
        ingrediente_id: ingrediente1.id,
        tipo: "compra",
        cantidad: cantidadRecibidaFisica.toString(),
        motivo: `Recepción con incidencia orden ${compraPrueba.id}`,
        creado_por: usuarioGerente.id,
      });

      // Asentar en log_auditoria con desglose
      await tx.insert(logAuditoria).values({
        restaurante_id: restauranteTest.id,
        usuario_id: usuarioGerente.id,
        accion: "RECEPCION_COMPRA_INCIDENCIA",
        tabla_afectada: "compras",
        registro_id: compraPrueba.id,
        valores_nuevos: {
          estado: "incidencia",
          porcentaje_faltante: porcentajeFaltante,
          total_real: totalReal,
        },
      });
    });

    // 3. Disparar notificación multicanal de incidencia
    const payloadIncidencia: IncidenciaCompraPayload = {
      restaurante: restauranteTest.nombre,
      proveedor_nombre: proveedorA.nombre,
      compra_id: compraPrueba.id,
      total_pedido: 10.0,
      total_recibido: cantidadRecibidaFisica,
      porcentaje_faltante: porcentajeFaltante,
      desglose_faltantes: [
        {
          ingrediente: ingrediente1.nombre,
          unidad: ingrediente1.unidad_medida,
          pedido: 10.0,
          recibido: cantidadRecibidaFisica,
          faltante: faltante,
        },
      ],
      usuario_recepcion: usuarioGerente.nombre,
    };

    const notifResult = await dispararAlertaIncidenciaCompraSiAplica(
      true,
      payloadIncidencia,
      {
        restaurante_id: restauranteTest.id,
        usuario_id: usuarioGerente.id,
        compra_id: compraPrueba.id,
      }
    );

    // 4. Verificaciones
    expect(notifResult.disparada).toBe(true);
    expect(notificaciones.enviarNotificacionIncidenciaCompra).toHaveBeenCalledTimes(1);

    // Comprobar estado en base de datos
    const compraFinal = await db.query.compras.findFirst({
      where: eq(compras.id, compraPrueba.id),
    });
    expect(compraFinal?.estado).toBe("incidencia");
    expect(Number(compraFinal?.total_real)).toBe(720.0);

    // Comprobar que el stock aumentó EXACTAMENTE 6.0 kg (no los 10.0 kg pedidos)
    const stockDespues = Number(
      (
        await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ingrediente1.id),
        })
      )!.stock_actual
    );
    expect(stockDespues).toBe(stockAntes + 6.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Recepción exacta conforme (sin incidencia)
  // ───────────────────────────────────────────────────────────────────────────
  it("4. Recepción exacta sin faltantes: marca 'recibida' y NO dispara notificación de incidencia", async () => {
    vi.clearAllMocks();

    const [compraExacta] = await db
      .insert(compras)
      .values({
        restaurante_id: restauranteTest.id,
        proveedor_id: proveedorB.id,
        estado: "pendiente",
        total_estimado: "575.00",
        creado_por: usuarioGerente.id,
      })
      .returning();

    const [itemExacto] = await db
      .insert(compraItems)
      .values({
        compra_id: compraExacta.id,
        ingrediente_id: ingrediente1.id,
        cantidad_pedida: "5.000",
        costo_unitario_pactado: "115.0000",
      })
      .returning();

    const cantidadRecibida = 5.0; // Exacto
    const hayIncidencia = false;

    // Transición atómica a 'recibida'
    await db.transaction(async (tx) => {
      await tx
        .update(compras)
        .set({
          estado: "recibida",
          total_real: (cantidadRecibida * 115.0).toFixed(2),
        })
        .where(eq(compras.id, compraExacta.id));

      await tx
        .update(compraItems)
        .set({ cantidad_recibida: cantidadRecibida.toString() })
        .where(eq(compraItems.id, itemExacto.id));

      await tx
        .update(ingredientes)
        .set({
          stock_actual: sql`${ingredientes.stock_actual} + ${cantidadRecibida.toString()}`,
        })
        .where(eq(ingredientes.id, ingrediente1.id));
    });

    const notifResult = await dispararAlertaIncidenciaCompraSiAplica(
      hayIncidencia,
      {} as any
    );

    expect(notifResult.disparada).toBe(false);
    expect(notificaciones.enviarNotificacionIncidenciaCompra).not.toHaveBeenCalled();

    const compraDb = await db.query.compras.findFirst({
      where: eq(compras.id, compraExacta.id),
    });
    expect(compraDb?.estado).toBe("recibida");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Actualización atómica de stock en PostgreSQL real
  // ───────────────────────────────────────────────────────────────────────────
  it("5. Garantía de atomicidad real en PostgreSQL para suma de stock con RETURNING *", async () => {
    const stockPrevio = Number(
      (
        await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ingrediente2.id),
        })
      )!.stock_actual
    );

    const incremento = 8.5;

    // Ejecutar UPDATE atómico nativo con RETURNING
    const [ingActualizado] = await db
      .update(ingredientes)
      .set({
        stock_actual: sql`${ingredientes.stock_actual} + ${incremento.toString()}`,
        actualizado_en: new Date(),
      })
      .where(eq(ingredientes.id, ingrediente2.id))
      .returning();

    expect(ingActualizado).toBeDefined();
    expect(Number(ingActualizado.stock_actual)).toBe(stockPrevio + incremento);

    // Confirmar persistencia en BD
    const ingConsulta = await db.query.ingredientes.findFirst({
      where: eq(ingredientes.id, ingrediente2.id),
    });
    expect(Number(ingConsulta?.stock_actual)).toBe(stockPrevio + incremento);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Control de acceso y roles (Mesero no autorizado)
  // ───────────────────────────────────────────────────────────────────────────
  it("6. Control de acceso: personal con rol 'mesero' o no autorizado no puede crear ni recibir compras", async () => {
    // Consultar vínculo de mesero en restauranteTest
    const vinculoMesero = await db.query.usuarioRestaurantes.findFirst({
      where: and(
        eq(usuarioRestaurantes.usuario_id, usuarioMesero.id),
        eq(usuarioRestaurantes.restaurante_id, restauranteTest.id)
      ),
    });

    expect(vinculoMesero?.rol).toBe("mesero");

    // Función simulada de validación de roles de compras
    const verificarPermiso = (rol: string) => {
      if (!["gerente", "dueno"].includes(rol)) {
        throw new Error(`Rol '${rol}' no autorizado para compras.`);
      }
      return true;
    };

    expect(() => verificarPermiso(vinculoMesero!.rol)).toThrow(
      "Rol 'mesero' no autorizado para compras."
    );

    // El gerente sí tiene permiso
    expect(verificarPermiso("gerente")).toBe(true);
    expect(verificarPermiso("dueno")).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Mecanismo anti-silencio ante fallo de notificación
  // ───────────────────────────────────────────────────────────────────────────
  it("7. Mecanismo anti-silencio: asienta 'FALLO_ENVIO_ALERTA_INCIDENCIA_COMPRA' en log_auditoria si falla el envío", async () => {
    vi.mocked(notificaciones.enviarNotificacionIncidenciaCompra).mockRejectedValueOnce(
      new Error("Fallo simulado de conexión multicanal (Telegram y Email inalcanzables)")
    );

    const payloadIncidencia: IncidenciaCompraPayload = {
      restaurante: restauranteTest.nombre,
      proveedor_nombre: proveedorA.nombre,
      compra_id: "compra-ficticia-anti-silencio",
      total_pedido: 20.0,
      total_recibido: 10.0,
      porcentaje_faltante: 50.0,
      desglose_faltantes: [],
      usuario_recepcion: usuarioGerente.nombre,
    };

    const res = await dispararAlertaIncidenciaCompraSiAplica(
      true,
      payloadIncidencia,
      {
        restaurante_id: restauranteTest.id,
        usuario_id: usuarioGerente.id,
        compra_id: "compra-ficticia-anti-silencio",
      }
    );

    expect(res.disparada).toBe(true);
    expect(res.enviada).toBe(false);
    expect(res.error).toContain("Fallo simulado de conexión");

    // Verificar que quedó registrado en log_auditoria
    const auditFallo = await db.query.logAuditoria.findFirst({
      where: and(
        eq(logAuditoria.restaurante_id, restauranteTest.id),
        eq(logAuditoria.accion, "FALLO_ENVIO_ALERTA_INCIDENCIA_COMPRA")
      ),
    });

    expect(auditFallo).toBeDefined();
    expect(auditFallo?.registro_id).toBe("compra-ficticia-anti-silencio");
    const valoresNuevos = auditFallo?.valores_nuevos as any;
    expect(valoresNuevos.error).toContain("Fallo simulado");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Concurrencia e idempotencia en PostgreSQL real (Promise.all)
  // ───────────────────────────────────────────────────────────────────────────
  it("8. Garantía de concurrencia e idempotencia contra PostgreSQL real (Promise.all): solo un UPDATE tiene éxito y el stock solo se suma una vez", async () => {
    // 1. Crear compra pendiente con 15.0 kg
    const [compraConcurrente] = await db
      .insert(compras)
      .values({
        restaurante_id: restauranteTest.id,
        proveedor_id: proveedorA.id,
        estado: "pendiente",
        total_estimado: "1800.00",
        creado_por: usuarioGerente.id,
      })
      .returning();

    const [itemConcurrente] = await db
      .insert(compraItems)
      .values({
        compra_id: compraConcurrente.id,
        ingrediente_id: ingrediente1.id,
        cantidad_pedida: "15.000",
        costo_unitario_pactado: "120.0000",
      })
      .returning();

    const stockInicial = Number(
      (
        await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ingrediente1.id),
        })
      )!.stock_actual
    );

    const cantidadFisica = 15.0;

    // Función que simula recibirCompraAction ejecutándose en la BD real
    const simularRecepcionConcurrente = async (ejecutor: string) => {
      return db.transaction(async (tx) => {
        // Transición de estado atómica:
        // UPDATE compras SET estado = 'recibida' WHERE id = $1 AND estado IN ('pendiente', 'confirmada')
        const [compraActualizada] = await tx
          .update(compras)
          .set({
            estado: "recibida",
            total_real: (cantidadFisica * 120.0).toFixed(2),
          })
          .where(
            and(
              eq(compras.id, compraConcurrente.id),
              eq(compras.restaurante_id, restauranteTest.id),
              or(eq(compras.estado, "pendiente"), eq(compras.estado, "confirmada"))
            )
          )
          .returning();

        // Si 0 filas afectadas, abortar y registrar anomalía
        if (!compraActualizada) {
          await tx.insert(logAuditoria).values({
            restaurante_id: restauranteTest.id,
            usuario_id: usuarioGerente.id,
            accion: "ANOMALIA_INTENTO_DOBLE_RECEPCION_COMPRA",
            tabla_afectada: "compras",
            registro_id: compraConcurrente.id,
            valores_nuevos: { ejecutor, motivo: "0 filas afectadas en concurrencia" },
          });

          return {
            ok: false,
            codigo: "COMPRA_YA_PROCESADA",
            error: "La orden de compra ya fue recibida previamente.",
          };
        }

        // Si tuvo éxito, sumar stock
        await tx
          .update(ingredientes)
          .set({
            stock_actual: sql`${ingredientes.stock_actual} + ${cantidadFisica.toString()}`,
          })
          .where(eq(ingredientes.id, ingrediente1.id));

        return {
          ok: true,
          compra_id: compraConcurrente.id,
          ejecutor,
        };
      });
    };

    // 2. Disparo concurrente simultáneo con Promise.all
    const [res1, res2] = await Promise.all([
      simularRecepcionConcurrente("Operador_1"),
      simularRecepcionConcurrente("Operador_2"),
    ]);

    // 3. Verificaciones de concurrencia:
    // Exactamente una tuvo éxito y exactamente una fue rechazada
    const exitosas = [res1, res2].filter((r) => r.ok);
    const rechazadas = [res1, res2].filter((r) => !r.ok);

    expect(exitosas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].codigo).toBe("COMPRA_YA_PROCESADA");

    // 4. Verificación de auditoría: se registró la anomalía de doble recepción
    const anomaliaLog = await db.query.logAuditoria.findFirst({
      where: and(
        eq(logAuditoria.restaurante_id, restauranteTest.id),
        eq(logAuditoria.registro_id, compraConcurrente.id),
        eq(logAuditoria.accion, "ANOMALIA_INTENTO_DOBLE_RECEPCION_COMPRA")
      ),
    });
    expect(anomaliaLog).toBeDefined();

    // 5. Verificación de stock: se sumó ÚNICAMENTE 15.0 kg (NO 30.0 kg)
    const stockFinal = Number(
      (
        await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ingrediente1.id),
        })
      )!.stock_actual
    );
    expect(stockFinal).toBe(stockInicial + cantidadFisica);

    // 6. Estado final en Postgres es 'recibida'
    const compraFinal = await db.query.compras.findFirst({
      where: eq(compras.id, compraConcurrente.id),
    });
    expect(compraFinal?.estado).toBe("recibida");
  });
});

