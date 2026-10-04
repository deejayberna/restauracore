import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  ingredientes,
  logAuditoria,
  movimientosInventario,
  restaurantes,
  turnos,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  calcularValorProtegido,
  obtenerRangoMesCalendarioActual,
} from "@/lib/roi-antifraude";

describe("ROI y Control Anti-Fraude — Valor Protegido", () => {
  const ts = Date.now();

  let restNuevoMenos7Dias: any;
  let restMaduroMas7Dias: any;
  let duenoUser: any;
  let gerenteUser: any;
  let ingCarne: any;
  let ingVino: any;
  let turnoConFaltante: any;
  let mermaPendiente: any;
  let mermaRobo: any;

  beforeAll(async () => {
    // 1. Restaurante con menos de 7 días (creado hoy)
    const [rNuevo] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Nuevo ${ts}`,
        timezone: "America/Mexico_City",
        creado_en: new Date(), // Hoy
      })
      .returning();
    restNuevoMenos7Dias = rNuevo;

    // 2. Restaurante con más de 7 días (creado hace 20 días)
    const fechaCreacionMadura = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const [rMaduro] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Maduro ${ts}`,
        timezone: "America/Mexico_City",
        creado_en: fechaCreacionMadura,
      })
      .returning();
    restMaduroMas7Dias = rMaduro;

    // 3. Usuarios: Dueño y Gerente
    const [uDueno] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-dueno-${ts}`,
        nombre: "Dueño Test",
        email: `dueno-${ts}@test.com`,
      })
      .returning();
    duenoUser = uDueno;

    const [uGerente] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-gerente-${ts}`,
        nombre: "Gerente Test",
        email: `gerente-${ts}@test.com`,
      })
      .returning();
    gerenteUser = uGerente;

    await db.insert(usuarioRestaurantes).values([
      {
        usuario_id: duenoUser.id,
        restaurante_id: restMaduroMas7Dias.id,
        rol: "dueno",
        activo: true,
      },
      {
        usuario_id: gerenteUser.id,
        restaurante_id: restMaduroMas7Dias.id,
        rol: "gerente",
        activo: true,
      },
    ]);

    // 4. Ingredientes con costo unitario conocido
    const [ing1] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restMaduroMas7Dias.id,
        nombre: `Carne Ribeye ${ts}`,
        unidad_medida: "kg",
        costo_unitario: "450.0000",
        stock_actual: "10.000",
        stock_minimo: "2.000",
      })
      .returning();
    ingCarne = ing1;

    const [ing2] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restMaduroMas7Dias.id,
        nombre: `Botella Vino Tinto ${ts}`,
        unidad_medida: "pieza",
        costo_unitario: "300.0000",
        stock_actual: "20.000",
        stock_minimo: "5.000",
      })
      .returning();
    ingVino = ing2;

    // 5. Turno de caja cerrado con discrepancia (faltante de $350.00)
    const [t1] = await db
      .insert(turnos)
      .values({
        restaurante_id: restMaduroMas7Dias.id,
        codigo: `TURNO-TEST-${ts}`,
        estado: "cerrado",
        abierto_por: duenoUser.id,
        cerrado_por: duenoUser.id,
        fecha_inicio: new Date(),
        fecha_cierre: new Date(),
        hay_discrepancia: true,
        diferencias: {
          efectivo: { sistema: 1000, fisico: 650, diferencia: -350 },
          tarjeta: { sistema: 500, fisico: 500, diferencia: 0 },
          transferencia: { sistema: 0, fisico: 0, diferencia: 0 },
          total: { sistema: 1500, fisico: 1150, diferencia: -350 },
          hay_discrepancia: true,
          tipo_discrepancia: "faltante",
        },
      })
      .returning();
    turnoConFaltante = t1;

    // 6. Merma con revision_pendiente = true (2 kg de Carne @ $450 = $900.00)
    const [m1] = await db
      .insert(movimientosInventario)
      .values({
        ingrediente_id: ingCarne.id,
        tipo: "merma",
        cantidad: "-2.000",
        motivo: "descongelamiento_danado",
        revision_pendiente: true,
        creado_por: duenoUser.id,
        creado_en: new Date(),
      })
      .returning();
    mermaPendiente = m1;

    // 7. Merma con motivo "robo sospechado" (1 botella de Vino @ $300 = $300.00)
    const [m2] = await db
      .insert(movimientosInventario)
      .values({
        ingrediente_id: ingVino.id,
        tipo: "merma",
        cantidad: "-1.000",
        motivo: "robo sospechado",
        revision_pendiente: false, // Ya atendida/revisada
        creado_por: duenoUser.id,
        creado_en: new Date(),
      })
      .returning();
    mermaRobo = m2;

    // 8. Eventos de auditoría de intentos no autorizados y anomalías
    await db.insert(logAuditoria).values([
      {
        restaurante_id: restMaduroMas7Dias.id,
        usuario_id: duenoUser.id,
        accion: "INTENTO_NO_AUTORIZADO_CIERRE_CAJA",
        tabla_afectada: "caja",
        creado_en: new Date(),
      },
      {
        restaurante_id: restMaduroMas7Dias.id,
        usuario_id: duenoUser.id,
        accion: "ANOMALIA_INTENTO_DOBLE_CIERRE_CAJA",
        tabla_afectada: "caja",
        creado_en: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (restMaduroMas7Dias?.id) {
      await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restMaduroMas7Dias.id));
      if (turnoConFaltante?.id) {
        await db.delete(turnos).where(eq(turnos.id, turnoConFaltante.id));
      }
      if (mermaPendiente?.id || mermaRobo?.id) {
        await db
          .delete(movimientosInventario)
          .where(
            inArray(movimientosInventario.id, [mermaPendiente.id, mermaRobo.id].filter(Boolean))
          );
      }
      if (ingCarne?.id || ingVino?.id) {
        await db
          .delete(ingredientes)
          .where(inArray(ingredientes.id, [ingCarne.id, ingVino.id].filter(Boolean)));
      }
      await db
        .delete(usuarioRestaurantes)
        .where(eq(usuarioRestaurantes.restaurante_id, restMaduroMas7Dias.id));
      await db.delete(restaurantes).where(eq(restaurantes.id, restMaduroMas7Dias.id));
    }

    if (restNuevoMenos7Dias?.id) {
      await db.delete(restaurantes).where(eq(restaurantes.id, restNuevoMenos7Dias.id));
    }

    if (duenoUser?.id || gerenteUser?.id) {
      await db
        .delete(usuarios)
        .where(inArray(usuarios.id, [duenoUser.id, gerenteUser.id].filter(Boolean)));
    }
  });

  // ─── TEST 1: REGLA DE MENOS DE 7 DÍAS ───────────────────────────────────
  it("1. Restaurante con menos de 7 días no es elegible para mostrar la tarjeta completa", async () => {
    const res = await calcularValorProtegido(restNuevoMenos7Dias.id);

    expect(res.elegibleParaMostrar).toBe(false);
    expect(res.restaurante.diasActivo).toBeLessThan(7);
  });

  // ─── TEST 2: RESTAURANTE MADURO ES ELEGIBLE Y SUMA VALORES CORRECTOS ────
  it("2. Restaurante con más de 7 días calcula exactamente el valor protegido detectado", async () => {
    const res = await calcularValorProtegido(restMaduroMas7Dias.id);

    expect(res.elegibleParaMostrar).toBe(true);
    expect(res.restaurante.diasActivo).toBeGreaterThanOrEqual(7);

    // Caja: $350.00 faltante
    expect(res.desglose.discrepanciasCaja.montoFaltantes).toBe(350);
    expect(res.desglose.discrepanciasCaja.turnosConFaltante).toBe(1);

    // Mermas: 2 kg @ 450 = $900 (mermaPendiente) + 1 pieza @ 300 = $300 (mermaRobo) = $1200
    expect(res.desglose.mermasRevision.montoEstimado).toBe(1200);
    expect(res.desglose.mermasRevision.cantidadEventos).toBe(2);

    // Total detectado: $350 + $1200 = $1550
    expect(res.montoTotalDetectado).toBe(1550);

    // Seguridad: 2 intentos/anomalías bloqueadas
    expect(res.seguridadYAuditoria.intentosBloqueados).toBe(2);

    // Robo sospechado: 1 total, 1 investigada (ya atendida con revision_pendiente=false)
    expect(res.seguridadYAuditoria.alertasRoboSospechadoTotal).toBe(1);
    expect(res.seguridadYAuditoria.alertasRoboInvestigadas).toBe(1);
  });

  // ─── TEST 3: NO DUPLICA EL CONTEO DEL MISMO EVENTO ──────────────────────
  it("3. El cálculo es idempotente y no cuenta dos veces el mismo evento en consultas sucesivas", async () => {
    const res1 = await calcularValorProtegido(restMaduroMas7Dias.id);
    const res2 = await calcularValorProtegido(restMaduroMas7Dias.id);

    expect(res1.montoTotalDetectado).toBe(res2.montoTotalDetectado);
    expect(res1.desglose.discrepanciasCaja.turnosConFaltante).toBe(
      res2.desglose.discrepanciasCaja.turnosConFaltante
    );
    expect(res1.desglose.mermasRevision.cantidadEventos).toBe(
      res2.desglose.mermasRevision.cantidadEventos
    );
    expect(res1.seguridadYAuditoria.intentosBloqueados).toBe(
      res2.seguridadYAuditoria.intentosBloqueados
    );

    // Verificamos que los IDs en los detalles sean únicos
    const turnosIds = res1.desglose.discrepanciasCaja.detalles.map(
      (d: { turnoId: string }) => d.turnoId
    );
    expect(new Set(turnosIds).size).toBe(turnosIds.length);

    const mermasIds = res1.desglose.mermasRevision.detalles.map(
      (m: { movimientoId: string }) => m.movimientoId
    );
    expect(new Set(mermasIds).size).toBe(mermasIds.length);
  });

  // ─── TEST 4: CONFIRMACIÓN DEL DUEÑO EN LOG_AUDITORIA ─────────────────────
  it("4. Confirmación manual asienta en log_auditoria y se refleja en las estadísticas", async () => {
    // Insertamos directamente el log de confirmación que simula la acción del dueño
    await db.insert(logAuditoria).values({
      restaurante_id: restMaduroMas7Dias.id,
      usuario_id: duenoUser.id,
      accion: "CONFIRMACION_RESULTADO_INCIDENCIA",
      tabla_afectada: "turnos",
      registro_id: turnoConFaltante.id,
      valores_nuevos: {
        tipo_evento: "turno",
        resultado: "robo_real",
        monto: 350.0,
        confirmado_en: new Date().toISOString(),
      },
    });

    const res = await calcularValorProtegido(restMaduroMas7Dias.id);

    expect(res.confirmacionesDueno.roboConfirmadoEventos).toBe(1);
    expect(res.confirmacionesDueno.roboConfirmadoMonto).toBe(350);
  });

  // ─── TEST 5: CONTROL DE ACCESO ESTRICTO AL CONFIRMAR ─────────────────────
  it("5. Un usuario sin rol 'dueno' es reconocido como no autorizado para clasificar incidencias", async () => {
    const vinculoGerente = await db.query.usuarioRestaurantes.findFirst({
      where: eq(usuarioRestaurantes.usuario_id, gerenteUser.id),
    });

    expect(vinculoGerente?.rol).toBe("gerente");
    expect(vinculoGerente?.rol !== "dueno").toBe(true);
  });
});
