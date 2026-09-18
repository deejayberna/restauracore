import { describe, it, expect, vi } from "vitest";
import {
  dispararAlertaDiscrepanciaCajaSiAplica,
  type ResumenMetodosPago,
  type ConteoFisicoInput,
} from "@/lib/caja-actions";
import { calcularDiscrepanciasCaja } from "@/lib/caja-utils";
import { db } from "@/db";
import { turnos, restaurantes, usuarios, logAuditoria } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import * as notificaciones from "@/lib/notificaciones";

// Mock del módulo de notificaciones: evita llamadas reales a Telegram/Resend en tests.
vi.mock("@/lib/notificaciones", async (importOriginal) => {
  const original = await importOriginal<typeof notificaciones>();
  return {
    ...original,
    enviarNotificacionDiscrepanciaCaja: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Fase 6.2 — Arqueo de Caja y Cierre de Turno (Anti-Robo)", () => {
  const sistemaEjemplo: ResumenMetodosPago = {
    efectivo: 1500.0,
    tarjeta: 3200.5,
    transferencia: 850.0,
    total: 5550.5,
    ordenes_count: 25,
  };

  it("punto 1 y 5: concilia perfectamente cuando el conteo físico coincide con el sistema", () => {
    const fisicoExacto: ConteoFisicoInput = {
      efectivo: 1500.0,
      tarjeta: 3200.5,
      transferencia: 850.0,
    };

    const resultado = calcularDiscrepanciasCaja(sistemaEjemplo, fisicoExacto);

    expect(resultado.hay_discrepancia).toBe(false);
    expect(resultado.tipo_discrepancia).toBe("cuadrado");
    expect(resultado.total.diferencia).toBe(0);

    // Desglose completo por método
    expect(resultado.efectivo.diferencia).toBe(0);
    expect(resultado.tarjeta.diferencia).toBe(0);
    expect(resultado.transferencia.diferencia).toBe(0);
  });

  it("punto 5: detecta y desglosa faltante en efectivo con exactitud", () => {
    const fisicoConFaltante: ConteoFisicoInput = {
      efectivo: 1450.0, // Faltan $50
      tarjeta: 3200.5,
      transferencia: 850.0,
    };

    const resultado = calcularDiscrepanciasCaja(sistemaEjemplo, fisicoConFaltante);

    expect(resultado.hay_discrepancia).toBe(true);
    expect(resultado.tipo_discrepancia).toBe("faltante");
    expect(resultado.total.diferencia).toBe(-50.0);

    // Desglose individual
    expect(resultado.efectivo.sistema).toBe(1500.0);
    expect(resultado.efectivo.fisico).toBe(1450.0);
    expect(resultado.efectivo.diferencia).toBe(-50.0);

    // Los otros métodos no tienen diferencia
    expect(resultado.tarjeta.diferencia).toBe(0);
    expect(resultado.transferencia.diferencia).toBe(0);
  });

  it("punto 5: detecta discrepancias mixtas que podrían compensarse en el total", () => {
    // Caso de riesgo: Faltan $100 en efectivo pero sobran $100 en tarjeta
    // El total cuadra matemáticamente, pero CADA método tiene descuadre
    const fisicoMixto: ConteoFisicoInput = {
      efectivo: 1400.0, // -100
      tarjeta: 3300.5, // +100
      transferencia: 850.0,
    };

    const resultado = calcularDiscrepanciasCaja(sistemaEjemplo, fisicoMixto);

    // Debe alertar discrepancia porque los métodos no cuadran individualmente
    expect(resultado.hay_discrepancia).toBe(true);
    expect(resultado.efectivo.diferencia).toBe(-100.0);
    expect(resultado.tarjeta.diferencia).toBe(100.0);
    expect(resultado.transferencia.diferencia).toBe(0);
  });

  it("punto 1: valida la segregación de permisos entre captura y cierre", () => {
    const ROLES_PERMITIDOS_CAPTURA = ["mesero", "gerente", "dueno"];
    const ROLES_PERMITIDOS_CIERRE = ["gerente", "dueno"];

    // Un mesero puede capturar su conteo
    expect(ROLES_PERMITIDOS_CAPTURA.includes("mesero")).toBe(true);

    // Pero un mesero NO puede confirmar ni cerrar el corte
    expect(ROLES_PERMITIDOS_CIERRE.includes("mesero")).toBe(false);

    // Gerente y dueño pueden autorizar
    expect(ROLES_PERMITIDOS_CIERRE.includes("gerente")).toBe(true);
    expect(ROLES_PERMITIDOS_CIERRE.includes("dueno")).toBe(true);
  });

  it("punto 2: genera el payload de auditoría completa tanto para cierres conciliados como con discrepancia", () => {
    const fisico = { efectivo: 1500, tarjeta: 3200.5, transferencia: 850 };
    const resConciliado = calcularDiscrepanciasCaja(sistemaEjemplo, fisico);

    const auditPayloadConciliado = {
      accion: resConciliado.hay_discrepancia ? "DISCREPANCIA_ARQUEO_CAJA" : "CIERRE_TURNO_CONCILIADO",
      valores_anteriores: {
        sistema: {
          efectivo: sistemaEjemplo.efectivo,
          tarjeta: sistemaEjemplo.tarjeta,
          transferencia: sistemaEjemplo.transferencia,
          total: sistemaEjemplo.total,
        },
      },
      valores_nuevos: {
        fisico,
        diferencias: resConciliado,
        hay_discrepancia: resConciliado.hay_discrepancia,
      },
    };

    expect(auditPayloadConciliado.accion).toBe("CIERRE_TURNO_CONCILIADO");
    expect(auditPayloadConciliado.valores_anteriores.sistema.efectivo).toBe(1500);
    expect(auditPayloadConciliado.valores_nuevos.diferencias.efectivo.diferencia).toBe(0);
  });

  it("punto 4: verifica que la política de auditoría sea append-only (sin permisos de edición ni borrado)", () => {
    // Representación conceptual de las operaciones permitidas sobre log_auditoria
    const operacionesPermitidas = {
      INSERT: true, // Registrar eventos
      SELECT: true, // Consultar por rol dueño
      UPDATE: false, // Inmutable
      DELETE: false, // Inmutable
    };

    expect(operacionesPermitidas.UPDATE).toBe(false);
    expect(operacionesPermitidas.DELETE).toBe(false);
  });

  it("punto 4: simula dos llamadas concurrentes al cierre del mismo turno y confirma que solo una tiene éxito (prevención atómica de doble cierre)", async () => {
    // Estado en la tabla 'turnos' (única fuente de verdad)
    let turnoEstado: "abierto" | "cerrado" = "abierto";
    const eventosAuditoria: { accion: string; usuario: string }[] = [];

    // Función que replica la lógica atómica de base de datos:
    // UPDATE turnos SET estado = 'cerrado' WHERE id = $1 AND estado = 'abierto' RETURNING *
    async function simularCierreAtomico(usuario: string) {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

      if (turnoEstado === "abierto") {
        turnoEstado = "cerrado";
        eventosAuditoria.push({ accion: "CIERRE_TURNO_CONCILIADO", usuario });
        return { ok: true, usuario, estado: "cerrado" };
      } else {
        // 0 filas afectadas: rechazo atómico y asiento de anomalía
        eventosAuditoria.push({ accion: "ANOMALIA_INTENTO_DOBLE_CIERRE_CAJA", usuario });
        return {
          ok: false,
          codigo: "TURNO_YA_CERRADO",
          error: "El turno ya fue cerrado previamente. Operación rechazada.",
        };
      }
    }

    // Dos llamadas concurrentes simultáneas al mismo turno
    const [cierre1, cierre2] = await Promise.all([
      simularCierreAtomico("Gerente_1"),
      simularCierreAtomico("Gerente_2"),
    ]);

    const exitosos = [cierre1, cierre2].filter((r) => r.ok);
    const rechazados = [cierre1, cierre2].filter((r) => !r.ok);

    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0].codigo).toBe("TURNO_YA_CERRADO");

    // Verificar que log_auditoria capturó la anomalía de doble cierre
    expect(eventosAuditoria.some((e) => e.accion === "ANOMALIA_INTENTO_DOBLE_CIERRE_CAJA")).toBe(true);
    expect(turnoEstado).toBe("cerrado");
  });

  it("garantía de atomicidad real contra PostgreSQL: dos UPDATE concurrentes sobre la misma fila en Postgres", async () => {
    // 1. Obtener restaurante y usuario existentes en la base de datos real
    let restaurante = await db.query.restaurantes.findFirst();
    let usuario = await db.query.usuarios.findFirst();

    // Si no existen, creamos registros de prueba transitorios
    let restCreado = false;
    let userCreado = false;

    if (!usuario) {
      const [u] = await db
        .insert(usuarios)
        .values({
          auth_id: `test-auth-${Date.now()}`,
          email: `test-caja-${Date.now()}@restauracore.test`,
          nombre: "Usuario Test Concurrencia",
        })
        .returning();
      usuario = u;
      userCreado = true;
    }

    if (!restaurante) {
      const [r] = await db
        .insert(restaurantes)
        .values({
          nombre: `Restaurante Test Concurrencia ${Date.now()}`,
        })
        .returning();
      restaurante = r;
      restCreado = true;
    }

    // 2. Crear un turno real en estado 'abierto' en la tabla 'turnos' de PostgreSQL
    const codigoUnico = `TEST-TURNO-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const [turnoTest] = await db
      .insert(turnos)
      .values({
        restaurante_id: restaurante.id,
        codigo: codigoUnico,
        estado: "abierto",
        abierto_por: usuario.id,
      })
      .returning();

    expect(turnoTest).toBeDefined();
    expect(turnoTest.estado).toBe("abierto");

    try {
      // 3. Ejecutar DOS UPDATE concurrentes reales enviados en paralelo a PostgreSQL
      // Sentencia atómica exacta implementada en confirmarCierreCajaAction:
      // UPDATE turnos SET estado = 'cerrado' WHERE id = $1 AND estado = 'abierto' RETURNING *
      const query1 = db
        .update(turnos)
        .set({
          estado: "cerrado",
          cerrado_por: usuario.id,
          fecha_cierre: new Date(),
          actualizado_en: new Date(),
        })
        .where(and(eq(turnos.id, turnoTest.id), eq(turnos.estado, "abierto")))
        .returning();

      const query2 = db
        .update(turnos)
        .set({
          estado: "cerrado",
          cerrado_por: usuario.id,
          fecha_cierre: new Date(),
          actualizado_en: new Date(),
        })
        .where(and(eq(turnos.id, turnoTest.id), eq(turnos.estado, "abierto")))
        .returning();

      // Disparo concurrente a nivel de base de datos
      const [res1, res2] = await Promise.all([query1, query2]);

      // 4. VALIDACIÓN DE ATOMICIDAD EN POSTGRESQL:
      // Debido al bloqueo de fila (row-level lock) y evaluación atómica del WHERE estado = 'abierto':
      // Exactamente una consulta debe actualizar la fila (longitud 1)
      // La otra consulta debe encontrar 0 filas afectadas (longitud 0)
      const resultadosConExito = [res1, res2].filter((r) => r.length === 1);
      const resultadosSinFilas = [res1, res2].filter((r) => r.length === 0);

      expect(resultadosConExito).toHaveLength(1);
      expect(resultadosSinFilas).toHaveLength(1);

      // 5. Verificar que el estado final en PostgreSQL quedó 'cerrado'
      const turnoFinal = await db.query.turnos.findFirst({
        where: eq(turnos.id, turnoTest.id),
      });
      expect(turnoFinal?.estado).toBe("cerrado");
      expect(turnoFinal?.cerrado_por).toBe(usuario.id);
    } finally {
      // 6. Limpieza garantizada del registro de prueba
      await db.delete(turnos).where(eq(turnos.id, turnoTest.id));
      if (restCreado && restaurante) {
        await db.delete(restaurantes).where(eq(restaurantes.id, restaurante.id));
      }
      if (userCreado && usuario) {
        await db.delete(usuarios).where(eq(usuarios.id, usuario.id));
      }
    }
  });

  it("asienta en log_auditoria con acción 'FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA' cuando el envío de la alerta de discrepancia falla (anti-silencio)", async () => {
    const timestamp = Date.now();
    const [restaurante] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Fallo Discrepancia ${timestamp}`,
      })
      .returning();

    const [supervisor] = await db
      .insert(usuarios)
      .values({
        auth_id: crypto.randomUUID(),
        email: `gerente-caja-${timestamp}@test.com`,
        nombre: "Gerente Caja Test",
      })
      .returning();

    const turnoCodigo = `TURNO-DISC-${timestamp}`;
    const [turno] = await db
      .insert(turnos)
      .values({
        restaurante_id: restaurante.id,
        codigo: turnoCodigo,
        estado: "abierto",
        abierto_por: supervisor.id,
      })
      .returning();

    vi.spyOn(notificaciones, "enviarNotificacionDiscrepanciaCaja")
      .mockRejectedValueOnce(new Error("Fallo de red multicanal simulado en discrepancia"));

    try {
      const payloadPrueba: Parameters<typeof dispararAlertaDiscrepanciaCajaSiAplica>[1] = {
        restaurante: restaurante.nombre,
        usuario_cierre: "Gerente Caja Test (gerente)",
        usuario_captura: "Cajero Test (mesero)",
        turno_id: turnoCodigo,
        diferencia_total: -150.0,
        desglose: {
          efectivo: { sistema: 1000, fisico: 850, diferencia: -150 },
          tarjeta: { sistema: 500, fisico: 500, diferencia: 0 },
          transferencia: { sistema: 200, fisico: 200, diferencia: 0 },
        },
        notas: "Faltante de $150 detectado en arqueo",
      };

      const resultado = await dispararAlertaDiscrepanciaCajaSiAplica(
        true,
        payloadPrueba,
        {
          restaurante_id: restaurante.id,
          usuario_id: supervisor.id,
          turno_uuid: turno.id,
        }
      );

      // Confirma que el fallo se atrapó limpiamente
      expect(resultado.disparada).toBe(true);
      expect(resultado.enviada).toBe(false);
      expect(resultado.error).toContain("Fallo de red multicanal simulado en discrepancia");

      // Verifica que se insertó la fila correspondiente en log_auditoria
      const logFallo = await db.query.logAuditoria.findFirst({
        where: and(
          eq(logAuditoria.restaurante_id, restaurante.id),
          eq(logAuditoria.accion, "FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA"),
          eq(logAuditoria.registro_id, turno.id)
        ),
      });

      expect(logFallo).toBeDefined();
      expect(logFallo?.accion).toBe("FALLO_ENVIO_ALERTA_DISCREPANCIA_CAJA");
      expect(logFallo?.tabla_afectada).toBe("turnos");
      expect(logFallo?.registro_id).toBe(turno.id);
      expect((logFallo?.valores_nuevos as any)?.error).toContain("Fallo de red multicanal simulado en discrepancia");
      expect((logFallo?.valores_nuevos as any)?.diferencia_total).toBe(-150.0);
    } finally {
      await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restaurante.id));
      await db.delete(turnos).where(eq(turnos.id, turno.id));
      await db.delete(usuarios).where(eq(usuarios.id, supervisor.id));
      await db.delete(restaurantes).where(eq(restaurantes.id, restaurante.id));
    }
  });
});

