import { describe, it, expect, vi, afterEach } from "vitest";
import {
  validarStockParaMerma,
  validarArchivoEvidencia,
  mermaSchema,
  MAX_FILE_SIZE,
} from "@/lib/merma-utils";
import { dispararAlertaRoboSiAplica } from "@/lib/merma-actions";
import { db } from "@/db";
import {
  alertasInventario,
  ingredientes,
  logAuditoria,
  movimientosInventario,
  restaurantes,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import * as notificaciones from "@/lib/notificaciones";

// Mock del módulo de notificaciones: evita llamadas reales a Telegram/Resend en tests.
// vi.mock se eleva automáticamente al inicio del módulo por Vitest.
vi.mock("@/lib/notificaciones", async (importOriginal) => {
  const original = await importOriginal<typeof notificaciones>();
  return {
    ...original,
    enviarNotificacionRoboSospechoso: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Fase 6.3 — Registro de Mermas con Evidencia Fotográfica", () => {
  describe("Validación de Stock (Anti-Fraude)", () => {
    it("permite registrar una merma cuando la cantidad es menor o igual al stock actual", () => {
      const resMenor = validarStockParaMerma(5.5, 10.0);
      expect(resMenor.valido).toBe(true);
      expect(resMenor.error).toBeUndefined();

      const resIgual = validarStockParaMerma(10.0, 10.0);
      expect(resIgual.valido).toBe(true);
      expect(resIgual.error).toBeUndefined();
    });

    it("rechaza de forma estricta cantidades mayores al stock disponible", () => {
      const resExcedido = validarStockParaMerma(12.5, 10.0);
      expect(resExcedido.valido).toBe(false);
      expect(resExcedido.error).toContain("no puede exceder el stock actual disponible");
    });

    it("rechaza cantidades negativas o cero", () => {
      const resCero = validarStockParaMerma(0, 10.0);
      expect(resCero.valido).toBe(false);

      const resNegativo = validarStockParaMerma(-2.5, 10.0);
      expect(resNegativo.valido).toBe(false);
    });
  });

  describe("Validación de Archivos de Evidencia (Storage)", () => {
    it("acepta si no se envía archivo (la evidencia fotográfica es opcional)", () => {
      const resNull = validarArchivoEvidencia(null);
      expect(resNull.valido).toBe(true);

      const resUndefined = validarArchivoEvidencia(undefined);
      expect(resUndefined.valido).toBe(true);
    });

    it("acepta formatos válidos: JPG, PNG, WebP", () => {
      const resJpg = validarArchivoEvidencia({ size: 1024 * 500, type: "image/jpeg" });
      expect(resJpg.valido).toBe(true);
      expect(resJpg.extension).toBe("jpg");

      const resPng = validarArchivoEvidencia({ size: 1024 * 800, type: "image/png" });
      expect(resPng.valido).toBe(true);
      expect(resPng.extension).toBe("png");

      const resWebp = validarArchivoEvidencia({ size: 1024 * 300, type: "image/webp" });
      expect(resWebp.valido).toBe(true);
      expect(resWebp.extension).toBe("webp");
    });

    it("rechaza formatos no permitidos como HEIC, GIF o PDF con mensaje claro", () => {
      const resHeic = validarArchivoEvidencia({ size: 1024 * 500, type: "image/heic" });
      expect(resHeic.valido).toBe(false);
      expect(resHeic.error).toContain("Solo se aceptan imágenes en formato JPG, PNG o WebP");

      const resGif = validarArchivoEvidencia({ size: 1024 * 500, type: "image/gif" });
      expect(resGif.valido).toBe(false);

      const resPdf = validarArchivoEvidencia({ size: 1024 * 500, type: "application/pdf" });
      expect(resPdf.valido).toBe(false);
    });

    it("rechaza archivos mayores a 5 MB", () => {
      const archivoGigante = {
        size: MAX_FILE_SIZE + 1024, // 5MB + 1KB
        type: "image/jpeg",
      };
      const res = validarArchivoEvidencia(archivoGigante);
      expect(res.valido).toBe(false);
      expect(res.error).toContain("supera el tamaño máximo permitido de 5 MB");
    });
  });

  describe("Esquema Zod de Entrada", () => {
    it("valida exitosamente un payload correcto", () => {
      const valido = mermaSchema.safeParse({
        ingrediente_id: crypto.randomUUID(),
        cantidad: 3.5,
        motivo: "Merma por descongelamiento defectuoso en cámara fría",
      });
      expect(valido.success).toBe(true);
    });

    it("falla si el ingrediente_id no es un UUID válido", () => {
      const invalido = mermaSchema.safeParse({
        ingrediente_id: "not-a-uuid",
        cantidad: 2.0,
        motivo: "Expiración de producto",
      });
      expect(invalido.success).toBe(false);
    });

    it("falla si el motivo es demasiado corto", () => {
      const invalido = mermaSchema.safeParse({
        ingrediente_id: crypto.randomUUID(),
        cantidad: 1.0,
        motivo: "no",
      });
      expect(invalido.success).toBe(false);
      if (!invalido.success) {
        expect(invalido.error.issues[0].path).toContain("motivo");
      }
    });
  });

  describe("Persistencia e Integridad Transaccional en Base de Datos Real", () => {
    it("descuenta el stock, crea el movimiento_inventario con foto_path interno y asienta la auditoría", async () => {
      const timestamp = Date.now();

      // 1. Crear restaurante y supervisor de prueba
      const [restaurante] = await db
        .insert(restaurantes)
        .values({
          nombre: `Restaurante Merma Test ${timestamp}`,
        })
        .returning();

      const [supervisor] = await db
        .insert(usuarios)
        .values({
          auth_id: crypto.randomUUID(),
          email: `gerente-${timestamp}@test.com`,
          nombre: "Gerente Merma Test",
        })
        .returning();

      await db.insert(usuarioRestaurantes).values({
        usuario_id: supervisor.id,
        restaurante_id: restaurante.id,
        rol: "gerente",
        activo: true,
      });

      // 2. Crear ingrediente con stock inicial conocido
      const [ingrediente] = await db
        .insert(ingredientes)
        .values({
          restaurante_id: restaurante.id,
          nombre: `Carne para Hamburguesa Test ${timestamp}`,
          unidad_medida: "kg",
          costo_unitario: "120.5000",
          stock_actual: "25.000",
          stock_minimo: "5.000",
        })
        .returning();

      const cantidadMermar = 4.5;
      const motivoMerma = "Ruptura de empaque al vacío con contaminación de aire";
      const fotoPathInterno = `${restaurante.id}/${crypto.randomUUID()}.jpg`;

      try {
        // 3. Ejecutar la operación transaccional idéntica al Server Action
        const stockActualInicial = parseFloat(ingrediente.stock_actual);
        const nuevoStockEsperado = stockActualInicial - cantidadMermar;

        const movimientoId = await db.transaction(async (tx) => {
          // Descontar stock
          await tx
            .update(ingredientes)
            .set({
              stock_actual: nuevoStockEsperado.toFixed(3),
              actualizado_en: new Date(),
            })
            .where(eq(ingredientes.id, ingrediente.id));

          // Insertar en movimientos_inventario
          const [mov] = await tx
            .insert(movimientosInventario)
            .values({
              ingrediente_id: ingrediente.id,
              tipo: "merma",
              cantidad: (-cantidadMermar).toFixed(3),
              motivo: motivoMerma,
              foto_path: fotoPathInterno,
              creado_por: supervisor.id,
            })
            .returning({ id: movimientosInventario.id });

          // Asentar en log_auditoria
          await tx.insert(logAuditoria).values({
            restaurante_id: restaurante.id,
            usuario_id: supervisor.id,
            accion: "REGISTRO_MERMA",
            tabla_afectada: "movimientos_inventario",
            registro_id: mov.id,
            valores_anteriores: { stock_actual: stockActualInicial },
            valores_nuevos: {
              cantidad_mermada: cantidadMermar,
              nuevo_stock: nuevoStockEsperado,
              motivo: motivoMerma,
              foto_path: fotoPathInterno,
            },
          });

          return mov.id;
        });

        // 4. Verificaciones de integridad en base de datos
        // a) El ingrediente tiene el stock descontado
        const ingredienteDb = await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ingrediente.id),
        });
        expect(parseFloat(ingredienteDb!.stock_actual)).toBe(20.5);

        // b) El movimiento se registró correctamente con foto_path interno (sin URL ni token)
        const movimientoDb = await db.query.movimientosInventario.findFirst({
          where: eq(movimientosInventario.id, movimientoId),
        });
        expect(movimientoDb).toBeDefined();
        expect(movimientoDb!.tipo).toBe("merma");
        expect(parseFloat(movimientoDb!.cantidad)).toBe(-4.5);
        expect(movimientoDb!.motivo).toBe(motivoMerma);
        expect(movimientoDb!.foto_path).toBe(fotoPathInterno);
        // Garantía #4 del usuario: nunca guardar una URL completa con protocolo ni query string
        expect(movimientoDb!.foto_path).not.toContain("http://");
        expect(movimientoDb!.foto_path).not.toContain("https://");
        expect(movimientoDb!.foto_path).not.toContain("token=");

        // c) log_auditoria contiene el registro inmutable del evento
        const auditoriaDb = await db.query.logAuditoria.findFirst({
          where: and(
            eq(logAuditoria.registro_id, movimientoId),
            eq(logAuditoria.accion, "REGISTRO_MERMA")
          ),
        });
        expect(auditoriaDb).toBeDefined();
        expect(auditoriaDb!.usuario_id).toBe(supervisor.id);
        expect(auditoriaDb!.restaurante_id).toBe(restaurante.id);
        const valoresNuevos = auditoriaDb!.valores_nuevos as any;
        expect(valoresNuevos.cantidad_mermada).toBe(4.5);
        expect(valoresNuevos.foto_path).toBe(fotoPathInterno);
      } finally {
        // Limpieza garantizada de entidades creadas en el test
        await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restaurante.id));
        await db.delete(movimientosInventario).where(eq(movimientosInventario.ingrediente_id, ingrediente.id));
        await db.delete(ingredientes).where(eq(ingredientes.id, ingrediente.id));
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restaurante.id));
        await db.delete(usuarios).where(eq(usuarios.id, supervisor.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restaurante.id));
      }
    });

    it("garantía de atomicidad contra PostgreSQL: rechaza la operación si stock_actual >= cantidad no se cumple en concurrencia (0 filas afectadas)", async () => {
      const timestamp = Date.now();
      const [restaurante] = await db
        .insert(restaurantes)
        .values({ nombre: `Restaurante Concurrencia Merma ${timestamp}` })
        .returning();

      const [ingrediente] = await db
        .insert(ingredientes)
        .values({
          restaurante_id: restaurante.id,
          nombre: `Queso Manchego Concurrente ${timestamp}`,
          unidad_medida: "kg",
          costo_unitario: "95.0000",
          stock_actual: "5.000",
          stock_minimo: "2.000",
        })
        .returning();

      try {
        // Lanzamos dos mermas concurrentes de 4.0 kg cada una.
        // Como solo hay 5.0 kg en stock, solo UNA debe tener éxito.
        // La segunda DEBE retornar 0 filas afectadas y ser rechazada.
        const operacionMerma = async (cantidad: number) => {
          return db.transaction(async (tx) => {
            const [actualizado] = await tx
              .update(ingredientes)
              .set({
                stock_actual: sql`${ingredientes.stock_actual} - ${cantidad}::decimal`,
                actualizado_en: new Date(),
              })
              .where(
                and(
                  eq(ingredientes.id, ingrediente.id),
                  eq(ingredientes.restaurante_id, restaurante.id),
                  sql`${ingredientes.stock_actual} >= ${cantidad}::decimal`
                )
              )
              .returning();

            if (!actualizado) {
              return { exito: false, razon: "0 filas afectadas (stock insuficiente por condición de carrera)" };
            }
            return { exito: true, nuevoStock: parseFloat(actualizado.stock_actual) };
          });
        };

        // Ejecución concurrente real contra PostgreSQL
        const [res1, res2] = await Promise.all([
          operacionMerma(4.0),
          operacionMerma(4.0),
        ]);

        const exitosas = [res1, res2].filter((r) => r.exito);
        const fallidas = [res1, res2].filter((r) => !r.exito);

        expect(exitosas).toHaveLength(1);
        expect(fallidas).toHaveLength(1);
        expect(fallidas[0].razon).toContain("0 filas afectadas");

        // El stock final en PostgreSQL debe ser exactamente 1.0 (5.0 - 4.0), nunca negativo ni inconsistente
        const ingredienteFinal = await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ingrediente.id),
        });
        expect(parseFloat(ingredienteFinal!.stock_actual)).toBe(1.0);
      } finally {
        await db.delete(alertasInventario).where(eq(alertasInventario.ingrediente_id, ingrediente.id));
        await db.delete(ingredientes).where(eq(ingredientes.id, ingrediente.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restaurante.id));
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Alerta inmediata anti-robo (Fase 6.3 — control anti-fraude)
  // Valida que enviarNotificacionRoboSospechoso se invoca si y solo si
  // el motivo de la merma es "robo sospechado" (comparación case-insensitive).
  // ─────────────────────────────────────────────────────────────────────────
  describe("Alerta de Robo Sospechado", () => {
    // Payload base de ejemplo: representa un movimiento ya confirmado en BD.
    const payloadBase = {
      restaurante: "Restaurante Prueba",
      ingrediente: "Jamón serrano",
      cantidad: 2.5,
      unidad: "kg",
      registrado_por_nombre: "Carlos Sánchez",
      registrado_por_email: "carlos@restaurante.com",
      registrado_por_rol: "gerente",
      movimiento_id: "mov-test-uuid-001",
    };

    afterEach(() => {
      vi.clearAllMocks(); // Resetea contadores del spy entre tests sin desmontarlo
    });

    it("dispara la notificación exactamente una vez cuando motivo = 'robo sospechado'", async () => {
      const spy = vi.spyOn(notificaciones, "enviarNotificacionRoboSospechoso");

      dispararAlertaRoboSiAplica("robo sospechado", payloadBase);

      // Dar un tick para que la promesa interna del mock se resuelva
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

      expect(spy).toHaveBeenCalledWith({
        restaurante: "Restaurante Prueba",
        ingrediente: "Jamón serrano",
        cantidad: 2.5,
        unidad: "kg",
        registrado_por_nombre: "Carlos Sánchez",
        registrado_por_email: "carlos@restaurante.com",
        registrado_por_rol: "gerente",
        movimiento_id: "mov-test-uuid-001",
      });
    });

    it("dispara la notificación con motivo en mayúsculas ('ROBO SOSPECHADO') — comparación case-insensitive", async () => {
      const spy = vi.spyOn(notificaciones, "enviarNotificacionRoboSospechoso");

      dispararAlertaRoboSiAplica("ROBO SOSPECHADO", payloadBase);

      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    });

    it("NO dispara la notificación para motivos normales: dañado, caducado, error de conteo", () => {
      const spy = vi.spyOn(notificaciones, "enviarNotificacionRoboSospechoso");

      const motivosNormales = ["dañado", "caducado", "error de conteo", "error", "Desperdicio", ""];

      for (const motivo of motivosNormales) {
        dispararAlertaRoboSiAplica(motivo, payloadBase);
      }

      // El spy no debe haber sido llamado en ningún caso
      expect(spy).not.toHaveBeenCalled();
    });

    it("asienta en log_auditoria con acción 'FALLO_ENVIO_ALERTA_ROBO' cuando el envío de la alerta falla (anti-silencio)", async () => {
      const timestamp = Date.now();
      const [restaurante] = await db
        .insert(restaurantes)
        .values({
          nombre: `Restaurante Fallo Notif ${timestamp}`,
        })
        .returning();

      const [supervisor] = await db
        .insert(usuarios)
        .values({
          auth_id: crypto.randomUUID(),
          email: `supervisor-${timestamp}@test.com`,
          nombre: "Supervisor Fallo Test",
        })
        .returning();

      vi.spyOn(notificaciones, "enviarNotificacionRoboSospechoso")
        .mockRejectedValueOnce(new Error("Fallo de conexión multicanal simulado"));

      const movimientoIdPrueba = crypto.randomUUID();

      try {
        const resultado = await dispararAlertaRoboSiAplica(
          "robo sospechado",
          {
            ...payloadBase,
            movimiento_id: movimientoIdPrueba,
          },
          {
            restaurante_id: restaurante.id,
            usuario_id: supervisor.id,
          }
        );

        // Confirma que se intentó disparar y que reportó el fallo sin lanzar excepción no capturada
        expect(resultado.disparada).toBe(true);
        expect(resultado.enviada).toBe(false);
        expect(resultado.error).toContain("Fallo de conexión multicanal simulado");

        // Verifica que se insertó la fila correspondiente en log_auditoria
        const logFallo = await db.query.logAuditoria.findFirst({
          where: and(
            eq(logAuditoria.restaurante_id, restaurante.id),
            eq(logAuditoria.accion, "FALLO_ENVIO_ALERTA_ROBO"),
            eq(logAuditoria.registro_id, movimientoIdPrueba)
          ),
        });

        expect(logFallo).toBeDefined();
        expect(logFallo?.accion).toBe("FALLO_ENVIO_ALERTA_ROBO");
        expect(logFallo?.tabla_afectada).toBe("movimientos_inventario");
        expect(logFallo?.registro_id).toBe(movimientoIdPrueba);
        expect((logFallo?.valores_nuevos as any)?.error).toContain("Fallo de conexión multicanal simulado");
        expect((logFallo?.valores_nuevos as any)?.motivo).toBe("robo sospechado");
      } finally {
        await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restaurante.id));
        await db.delete(usuarios).where(eq(usuarios.id, supervisor.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restaurante.id));
      }
    });
  });
});
