"use server";

import { db } from "@/db";
import { logAuditoria, ordenes, pagos, turnos, usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError, ValidationError } from "@/lib/errors";

async function obtenerUsuarioYRol() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError("Sesión no iniciada");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });
  if (!usuario) throw new UnauthorizedError("Usuario no registrado");

  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;
  if (!restaurante_id) throw new UnauthorizedError("Restaurante activo no seleccionado");

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });
  if (!vinculo) throw new UnauthorizedError("Sin vínculo activo con el restaurante");

  return { usuario, vinculo, restaurante_id };
}

export interface RegistroPagoInput {
  ordenId?: string;
  orden_id?: string;
  turnoId?: string;
  turno_id?: string;
  metodoPago?: "efectivo" | "tarjeta" | "transferencia";
  metodo_pago?: "efectivo" | "tarjeta" | "transferencia";
  monto: number;
  propinaMonto?: number;
  propina_monto?: number;
  propinaMetodo?: "efectivo" | "tarjeta" | "transferencia";
  propina_metodo?: "efectivo" | "tarjeta" | "transferencia";
}

export interface ResultadoRegistroPago {
  ok: boolean;
  saldo_restante?: number;
  restante?: number;
  total_acumulado?: number;
  orden_pagada?: boolean;
  pago_id?: string;
  error?: string;
}

/**
 * ACCIÓN: Registrar un pago parcial (o total) sobre una orden abierta o solicitada.
 * - Validación atómica mediante transacción Drizzle con FOR UPDATE.
 * - Solo cuando los pagos acumulados completan exactamente el total, la orden pasa a 'pagado'.
 */
export async function registrarPagoParcialAction(
  input: RegistroPagoInput
): Promise<ResultadoRegistroPago> {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRol();

  if (!["mesero", "cajero", "gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Rol no autorizado para registrar pagos.");
  }

  const ordenId = input.ordenId ?? input.orden_id;
  if (!ordenId) return { ok: false, error: "Identificador de orden obligatorio." };

  const metodoPago = input.metodoPago ?? input.metodo_pago;
  if (!metodoPago) return { ok: false, error: "Método de pago obligatorio." };

  const turnoId = input.turnoId ?? input.turno_id ?? null;

  if (input.monto <= 0) {
    return { ok: false, error: "El monto del pago debe ser mayor a 0." };
  }

  const propina = (input.propinaMonto ?? input.propina_monto ?? 0) > 0
    ? (input.propinaMonto ?? input.propina_monto ?? 0)
    : 0;

  try {
    const resultado = await db.transaction(async (tx) => {
      // 1. Bloqueo de concurrencia: SELECT ... FOR UPDATE en la orden
      const [orden] = await tx
        .select()
        .from(ordenes)
        .where(and(eq(ordenes.id, ordenId), eq(ordenes.restaurante_id, restaurante_id)))
        .for("update");

      if (!orden) throw new Error("ORDEN_NO_ENCONTRADA");

      if (orden.estado === "pagado") {
        throw new Error("ORDEN_YA_PAGADA");
      }

      if (orden.estado === "cancelado") {
        throw new Error("ORDEN_CANCELADA");
      }

      // 2. Sumar pagos acumulados previos
      const pagosPrevios = await tx
        .select({
          total_pagado: sql<string>`COALESCE(SUM(${pagos.monto}), 0)`,
          total_propina: sql<string>`COALESCE(SUM(${pagos.propina_monto}), 0)`,
        })
        .from(pagos)
        .where(eq(pagos.orden_id, orden.id));

      const pagadoAcumulado = parseFloat(pagosPrevios[0]?.total_pagado ?? "0");
      const propinaAcumulada = parseFloat(pagosPrevios[0]?.total_propina ?? "0");
      const totalOrden = parseFloat(orden.total);
      const nuevoTotalPagado = Math.round((pagadoAcumulado + input.monto) * 100) / 100;

      // 3. Validar que no exceda el total
      if (nuevoTotalPagado > Math.round(totalOrden * 100) / 100) {
        const saldoPendiente = Math.max(0, totalOrden - pagadoAcumulado);
        throw new Error(`MONTO_EXCEDIDO:${saldoPendiente.toFixed(2)}`);
      }

      // 4. Insertar fila en tabla pagos (append-only)
      const [nuevoPago] = await tx
        .insert(pagos)
        .values({
          restaurante_id,
          orden_id: orden.id,
          turno_id: turnoId,
          metodo_pago: metodoPago,
          monto: input.monto.toFixed(2),
          propina_monto: propina.toFixed(2),
          creado_por: usuario.id,
        })
        .returning();

      const saldoRestante = Math.max(0, totalOrden - nuevoTotalPagado);
      const estaCompletada = saldoRestante === 0;

      // 5. Si la suma coincide exactamente con el total de la orden, transicionar a 'pagado'
      if (estaCompletada) {
        const propinaTotal = propinaAcumulada + propina;
        await tx
          .update(ordenes)
          .set({
            estado: "pagado",
            propina: propinaTotal.toFixed(2),
            actualizado_en: new Date(),
          })
          .where(eq(ordenes.id, orden.id));

        await tx.insert(logAuditoria).values({
          restaurante_id,
          usuario_id: usuario.id,
          accion: "ORDEN_PAGADA_TOTAL",
          tabla_afectada: "ordenes",
          registro_id: orden.id,
          valores_nuevos: {
            total: orden.total,
            propina_total: propinaTotal.toFixed(2),
            metodo_cierre: metodoPago,
          },
        });
      } else {
        await tx.insert(logAuditoria).values({
          restaurante_id,
          usuario_id: usuario.id,
          accion: "PAGO_PARCIAL_REGISTRADO",
          tabla_afectada: "pagos",
          registro_id: nuevoPago.id,
          valores_nuevos: {
            orden_id: orden.id,
            monto: input.monto,
            metodo_pago: metodoPago,
            saldo_restante: saldoRestante.toFixed(2),
          },
        });
      }

      return {
        ok: true,
        pago_id: nuevoPago.id,
        saldo_restante: saldoRestante,
        restante: saldoRestante,
        total_acumulado: Number(nuevoTotalPagado.toFixed(2)),
        orden_pagada: estaCompletada,
      };
    });

    return resultado;
  } catch (err: any) {
    if (err?.message === "ORDEN_NO_ENCONTRADA") {
      return { ok: false, error: "La orden especificada no existe." };
    }
    if (err?.message === "ORDEN_YA_PAGADA") {
      return { ok: false, error: "Esta orden ya se encuentra completamente pagada." };
    }
    if (err?.message === "ORDEN_CANCELADA") {
      return { ok: false, error: "Esta orden fue cancelada. No admite pagos." };
    }
    if (err?.message?.startsWith("MONTO_EXCEDIDO:")) {
      const saldo = err.message.split(":")[1];
      return {
        ok: false,
        error: `El monto ingresado excede el total de la cuenta. Saldo pendiente: $${saldo}.`,
      };
    }
    return { ok: false, error: err?.message ?? "Error interno al procesar el pago." };
  }
}

export interface ResumenPropinaMesero {
  mesero_id: string;
  mesero_nombre: string;
  propina_efectivo: number;
  propina_tarjeta: number;
  propina_transferencia: number;
  total_propina: number;
}

export interface ReportePropinasTurno {
  turno_id: string;
  meseros: ResumenPropinaMesero[];
  totales: {
    efectivo: number;
    tarjeta: number;
    transferencia: number;
    global: number;
  };
}

/**
 * ACCIÓN: Reporte de propinas por mesero desglosado por método de pago para corte de turno.
 */
export async function obtenerReportePropinasTurnoAction(
  turnoId: string
): Promise<{ ok: boolean; reporte?: ReportePropinasTurno; error?: string }> {
  const { restaurante_id } = await obtenerUsuarioYRol();

  const registros = await db
    .select({
      mesero_id: ordenes.mesero_id,
      mesero_nombre: usuarios.nombre,
      metodo_pago: pagos.metodo_pago,
      propina_monto: pagos.propina_monto,
    })
    .from(pagos)
    .innerJoin(ordenes, eq(ordenes.id, pagos.orden_id))
    .leftJoin(usuarios, eq(usuarios.id, ordenes.mesero_id))
    .where(and(eq(pagos.turno_id, turnoId), eq(pagos.restaurante_id, restaurante_id)));

  const meserosMap = new Map<string, ResumenPropinaMesero>();
  let totalEfectivo = 0;
  let totalTarjeta = 0;
  let totalTransferencia = 0;

  for (const r of registros) {
    const meseroId = r.mesero_id ?? "sin_mesero";
    const meseroNombre = r.mesero_nombre ?? "Sin asignar";
    const monto = parseFloat(r.propina_monto);

    if (!meserosMap.has(meseroId)) {
      meserosMap.set(meseroId, {
        mesero_id: meseroId,
        mesero_nombre: meseroNombre,
        propina_efectivo: 0,
        propina_tarjeta: 0,
        propina_transferencia: 0,
        total_propina: 0,
      });
    }

    const item = meserosMap.get(meseroId)!;
    if (r.metodo_pago === "efectivo") {
      item.propina_efectivo += monto;
      totalEfectivo += monto;
    } else if (r.metodo_pago === "tarjeta") {
      item.propina_tarjeta += monto;
      totalTarjeta += monto;
    } else if (r.metodo_pago === "transferencia") {
      item.propina_transferencia += monto;
      totalTransferencia += monto;
    }
    item.total_propina += monto;
  }

  // Redondear a 2 decimales
  const meserosList = Array.from(meserosMap.values()).map((m) => ({
    ...m,
    propina_efectivo: Number(m.propina_efectivo.toFixed(2)),
    propina_tarjeta: Number(m.propina_tarjeta.toFixed(2)),
    propina_transferencia: Number(m.propina_transferencia.toFixed(2)),
    total_propina: Number(m.total_propina.toFixed(2)),
  }));

  return {
    ok: true,
    reporte: {
      turno_id: turnoId,
      meseros: meserosList,
      totales: {
        efectivo: Number(totalEfectivo.toFixed(2)),
        tarjeta: Number(totalTarjeta.toFixed(2)),
        transferencia: Number(totalTransferencia.toFixed(2)),
        global: Number((totalEfectivo + totalTarjeta + totalTransferencia).toFixed(2)),
      },
    },
  };
}

