"use server";

import { db } from "@/db";
import {
  ingredientes,
  logAuditoria,
  mesas,
  movimientosInventario,
  ordenes,
  ordenItems,
  platillos,
  recetas,
  restaurantes,
  solicitudesCancelacionItem,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError, ValidationError, NotFoundError } from "@/lib/errors";
import { enviarNotificacionSolicitudCancelacion } from "./notificaciones";
import { obtenerDestinatariosRestaurante } from "./notificaciones-destinatarios";

// Helper para obtener usuario autenticado y rol activo
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

export type AccionCancelacion = "cancelado_directo" | "solicitud_creada";

export interface ResultadoCancelarItem {
  ok: boolean;
  accion?: AccionCancelacion;
  solicitud_id?: string;
  error?: string;
}

/**
 * ACCIÓN: Cancelar o solicitar cancelación de un orden_item.
 * - Si está en 'pendiente': el mesero cancela directamente (sin merma).
 * - Si está en 'en_preparacion', 'listo' o 'entregado': se crea solicitud pendiente de aprobación y notifica anti-silencio.
 * - REGLA ABSOLUTA: si la orden está 'pagado', se rechaza categóricamente.
 */
export async function cancelarItemAction(input: {
  itemId: string;
  motivo: string;
}): Promise<ResultadoCancelarItem> {
  if (!input.motivo || input.motivo.trim().length < 3) {
    return { ok: false, error: "El motivo de cancelación debe tener al menos 3 caracteres." };
  }

  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRol();

  const item = await db.query.ordenItems.findFirst({
    where: eq(ordenItems.id, input.itemId),
  });
  if (!item) return { ok: false, error: "Item de orden no encontrado." };

  const orden = await db.query.ordenes.findFirst({
    where: and(eq(ordenes.id, item.orden_id), eq(ordenes.restaurante_id, restaurante_id)),
  });
  if (!orden) return { ok: false, error: "Orden no encontrada o no pertenece a este restaurante." };

  // REGLA ABSOLUTA: Prohibido cancelar items si la cuenta ya está pagada
  if (orden.estado === "pagado") {
    return {
      ok: false,
      error: "No es posible cancelar items de una cuenta ya pagada. Operación rechazada.",
    };
  }

  if (item.estado === "cancelado") {
    return { ok: false, error: "El item ya se encuentra cancelado." };
  }

  // CASO 1: Item en estado 'pendiente' (cancelación directa sin merma)
  if (item.estado === "pendiente") {
    const itemTotal = Number(item.precio_unitario_congelado) * item.cantidad;

    await db.transaction(async (tx) => {
      await tx
        .update(ordenItems)
        .set({ estado: "cancelado" })
        .where(eq(ordenItems.id, item.id));

      const nuevoSubtotal = Math.max(0, Number(orden.subtotal) - itemTotal);
      const nuevoTotal = Math.max(0, Number(orden.total) - itemTotal);

      await tx
        .update(ordenes)
        .set({
          subtotal: nuevoSubtotal.toFixed(2),
          total: nuevoTotal.toFixed(2),
          actualizado_en: new Date(),
        })
        .where(eq(ordenes.id, orden.id));

      await tx.insert(logAuditoria).values({
        restaurante_id,
        usuario_id: usuario.id,
        accion: "CANCELACION_ITEM_DIRECTA",
        tabla_afectada: "orden_items",
        registro_id: item.id,
        valores_anteriores: { estado: "pendiente", total_orden: orden.total },
        valores_nuevos: {
          estado: "cancelado",
          motivo: input.motivo,
          monto_descontado: itemTotal,
          nuevo_total_orden: nuevoTotal.toFixed(2),
        },
      });
    });

    return { ok: true, accion: "cancelado_directo" };
  }

  // CASO 2: Item en 'en_preparacion', 'listo' o 'entregado' -> Solicitud de autorización a Gerencia
  if (item.estado === "entregado" && (!input.motivo || input.motivo.trim().length < 10)) {
    return {
      ok: false,
      error: "Para solicitar la cancelación de un platillo ya entregado al cliente, es obligatorio ingresar una explicación detallada (mínimo 10 caracteres).",
    };
  }

  const [solicitud] = await db
    .insert(solicitudesCancelacionItem)
    .values({
      restaurante_id,
      orden_item_id: item.id,
      orden_id: orden.id,
      solicitado_por: usuario.id,
      estado_item_al_solicitar: item.estado,
      motivo: input.motivo.trim(),
      estado: "pendiente",
    })
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "SOLICITUD_CANCELACION_ITEM",
    tabla_afectada: "solicitudes_cancelacion_item",
    registro_id: solicitud.id,
    valores_nuevos: {
      orden_id: orden.id,
      orden_item_id: item.id,
      estado_item: item.estado,
      motivo: input.motivo.trim(),
    },
  });

  // Notificación inmediata a gerente/dueño (anti-silencio)
  const mesa = await db.query.mesas.findFirst({ where: eq(mesas.id, orden.mesa_id) });
  const platillo = await db.query.platillos.findFirst({ where: eq(platillos.id, item.platillo_id) });
  const destinatarios = await obtenerDestinatariosRestaurante(restaurante_id);

  try {
    await enviarNotificacionSolicitudCancelacion({
      restaurante: destinatarios.restaurante_nombre,
      mesa_numero: mesa?.numero ?? 0,
      platillo_nombre: platillo?.nombre ?? "Platillo",
      cantidad: item.cantidad,
      estado_item: item.estado,
      motivo: input.motivo.trim(),
      solicitado_por: usuario.nombre,
      chat_id: destinatarios.chat_id,
      destinatario_email: destinatarios.emails,
    });
  } catch (err: any) {
    console.error("[FALLO_ENVIO_ALERTA_CANCELACION_ITEM]", err);
    await db.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: "FALLO_ENVIO_ALERTA_CANCELACION_ITEM",
      tabla_afectada: "solicitudes_cancelacion_item",
      registro_id: solicitud.id,
      valores_nuevos: { error: err?.message ?? String(err) },
    });
  }

  return { ok: true, accion: "solicitud_creada", solicitud_id: solicitud.id };
}

/**
 * ACCIÓN: Aprobar solicitud de cancelación (Exclusivo Gerente o Dueño).
 * Aplica transición atómica anti-doble aprobación, descuenta total y genera merma automática.
 */
export async function aprobarCancelacionItemAction(input: {
  solicitudId: string;
  motivoResolucion?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRol();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden aprobar cancelaciones post-preparación.");
  }

  const solicitud = await db.query.solicitudesCancelacionItem.findFirst({
    where: and(
      eq(solicitudesCancelacionItem.id, input.solicitudId),
      eq(solicitudesCancelacionItem.restaurante_id, restaurante_id)
    ),
  });
  if (!solicitud) return { ok: false, error: "Solicitud no encontrada." };

  const item = await db.query.ordenItems.findFirst({
    where: eq(ordenItems.id, solicitud.orden_item_id),
  });
  if (!item) return { ok: false, error: "Item asociado no encontrado." };

  const orden = await db.query.ordenes.findFirst({
    where: eq(ordenes.id, item.orden_id),
  });
  if (!orden) return { ok: false, error: "Orden no encontrada." };

  // REGLA ABSOLUTA: Si ya se pagó, bloqueo terminante
  if (orden.estado === "pagado") {
    return { ok: false, error: "La orden ya fue pagada. Cancelación imposible." };
  }

  // Si el item estaba 'entregado', requiere nota obligatoria de al menos 10 caracteres
  if (solicitud.estado_item_al_solicitar === "entregado") {
    if (!input.motivoResolucion || input.motivoResolucion.trim().length < 10) {
      return {
        ok: false,
        error: "Para cancelar un platillo ya entregado al cliente, es obligatorio ingresar una explicación detallada (mínimo 10 caracteres).",
      };
    }
  }

  const itemTotal = Number(item.precio_unitario_congelado) * item.cantidad;

  // Ejecución transaccional con actualización atómica de la solicitud
  try {
    await db.transaction(async (tx) => {
      // 1. Transición Atómica: UPDATE ... WHERE estado = 'pendiente' RETURNING *
      const [solicitudAprobada] = await tx
        .update(solicitudesCancelacionItem)
        .set({
          estado: "aprobada",
          aprobado_por: usuario.id,
          motivo_resolucion: input.motivoResolucion?.trim() ?? "Aprobada por gerencia",
          resuelto_en: new Date(),
        })
        .where(
          and(
            eq(solicitudesCancelacionItem.id, solicitud.id),
            eq(solicitudesCancelacionItem.estado, "pendiente")
          )
        )
        .returning();

      // Si 0 filas fueron afectadas, otro supervisor la resolvió concurrentemente
      if (!solicitudAprobada) {
        throw new Error("SOLICITUD_YA_RESUELTA_CONCURRENTEMENTE");
      }

      // 2. Marcar item como cancelado
      await tx
        .update(ordenItems)
        .set({ estado: "cancelado" })
        .where(eq(ordenItems.id, item.id));

      // 3. Restar del total de la orden
      const nuevoSubtotal = Math.max(0, Number(orden.subtotal) - itemTotal);
      const nuevoTotal = Math.max(0, Number(orden.total) - itemTotal);

      await tx
        .update(ordenes)
        .set({
          subtotal: nuevoSubtotal.toFixed(2),
          total: nuevoTotal.toFixed(2),
          actualizado_en: new Date(),
        })
        .where(eq(ordenes.id, orden.id));

      // 4. Generación AUTOMÁTICA de merma en movimientos_inventario por cada ingrediente
      const recetaItems = await tx.query.recetas.findMany({
        where: eq(recetas.platillo_id, item.platillo_id),
      });

      for (const ri of recetaItems) {
        const ing = await tx.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ri.ingrediente_id),
        });
        if (!ing) continue;

        const cantidadDescontar = Number(ri.cantidad_requerida) * item.cantidad;
        const costoIngrediente = cantidadDescontar * Number(ing.costo_unitario);

        // Umbral de revisión gerencial: costo >= $50 MXN o >= 20% del stock mínimo
        const revisionPendiente =
          costoIngrediente >= 50.0 ||
          cantidadDescontar >= Number(ing.stock_minimo) * 0.2;

        // Si estaba en 'en_preparacion', aún no se había descontado físicamente del stock_actual en BD
        if (solicitud.estado_item_al_solicitar === "en_preparacion") {
          await tx
            .update(ingredientes)
            .set({
              stock_actual: sql`GREATEST(0, ${ingredientes.stock_actual} - ${cantidadDescontar}::decimal)`,
              actualizado_en: new Date(),
            })
            .where(eq(ingredientes.id, ing.id));
        }

        await tx.insert(movimientosInventario).values({
          ingrediente_id: ing.id,
          tipo: "merma",
          cantidad: (-Math.abs(cantidadDescontar)).toFixed(3),
          orden_id: orden.id,
          motivo: "cancelacion_post_preparacion",
          revision_pendiente: revisionPendiente,
          creado_por: usuario.id,
        });
      }

      // 5. Asentar en log_auditoria
      await tx.insert(logAuditoria).values({
        restaurante_id,
        usuario_id: usuario.id,
        accion: "APROBACION_CANCELACION_ITEM",
        tabla_afectada: "solicitudes_cancelacion_item",
        registro_id: solicitud.id,
        valores_anteriores: { estado: "pendiente", total_orden: orden.total },
        valores_nuevos: {
          estado: "aprobada",
          motivo_resolucion: input.motivoResolucion ?? "Aprobada por gerencia",
          item_id: item.id,
          monto_descontado: itemTotal,
          nuevo_total_orden: nuevoTotal.toFixed(2),
        },
      });
    });

    return { ok: true };
  } catch (err: any) {
    if (err?.message === "SOLICITUD_YA_RESUELTA_CONCURRENTEMENTE") {
      return {
        ok: false,
        error: "La solicitud de cancelación ya fue resuelta previamente por otro supervisor.",
      };
    }
    return { ok: false, error: err?.message ?? "Error al procesar la aprobación." };
  }
}

/**
 * ACCIÓN: Rechazar solicitud de cancelación (Exclusivo Gerente o Dueño).
 * El item regresa a su estado operacional, no se genera merma, y se registra auditoría.
 */
export async function rechazarCancelacionItemAction(input: {
  solicitudId: string;
  motivoRechazo: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.motivoRechazo || input.motivoRechazo.trim().length < 3) {
    return { ok: false, error: "El motivo del rechazo debe tener al menos 3 caracteres." };
  }

  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRol();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden rechazar cancelaciones.");
  }

  const [solicitudRechazada] = await db
    .update(solicitudesCancelacionItem)
    .set({
      estado: "rechazada",
      aprobado_por: usuario.id,
      motivo_resolucion: input.motivoRechazo.trim(),
      resuelto_en: new Date(),
    })
    .where(
      and(
        eq(solicitudesCancelacionItem.id, input.solicitudId),
        eq(solicitudesCancelacionItem.restaurante_id, restaurante_id),
        eq(solicitudesCancelacionItem.estado, "pendiente")
      )
    )
    .returning();

  if (!solicitudRechazada) {
    return {
      ok: false,
      error: "La solicitud ya fue resuelta previamente o no existe.",
    };
  }

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "RECHAZO_CANCELACION_ITEM",
    tabla_afectada: "solicitudes_cancelacion_item",
    registro_id: input.solicitudId,
    valores_nuevos: {
      estado: "rechazada",
      motivo_rechazo: input.motivoRechazo.trim(),
      resuelto_por: usuario.id,
    },
  });

  return { ok: true };
}

/**
 * ACCIÓN: Editar notas o cantidad de un item antes de que entre a preparación.
 * Solo permitido mientras esté en 'pendiente'.
 */
export async function editarItemPendienteAction(input: {
  itemId: string;
  cantidad?: number;
  notas?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { usuario, restaurante_id } = await obtenerUsuarioYRol();

  const item = await db.query.ordenItems.findFirst({
    where: eq(ordenItems.id, input.itemId),
  });
  if (!item) return { ok: false, error: "Item no encontrado." };

  const orden = await db.query.ordenes.findFirst({
    where: and(eq(ordenes.id, item.orden_id), eq(ordenes.restaurante_id, restaurante_id)),
  });
  if (!orden) return { ok: false, error: "Orden no encontrada." };

  if (orden.estado === "pagado") {
    return { ok: false, error: "No se puede editar un item de una orden ya pagada." };
  }

  if (item.estado !== "pendiente") {
    return {
      ok: false,
      error: "No se permite editar un item que ya está en preparación o cocina. Solicita una cancelación a gerencia.",
    };
  }

  const nuevaCantidad = input.cantidad ?? item.cantidad;
  if (nuevaCantidad <= 0) {
    return { ok: false, error: "La cantidad debe ser mayor a 0." };
  }

  const difCantidad = nuevaCantidad - item.cantidad;
  const difPrecio = difCantidad * Number(item.precio_unitario_congelado);

  await db.transaction(async (tx) => {
    await tx
      .update(ordenItems)
      .set({
        cantidad: nuevaCantidad,
        notas: input.notas !== undefined ? input.notas : item.notas,
      })
      .where(eq(ordenItems.id, item.id));

    if (difCantidad !== 0) {
      const nuevoSubtotal = Math.max(0, Number(orden.subtotal) + difPrecio);
      const nuevoTotal = Math.max(0, Number(orden.total) + difPrecio);

      await tx
        .update(ordenes)
        .set({
          subtotal: nuevoSubtotal.toFixed(2),
          total: nuevoTotal.toFixed(2),
          actualizado_en: new Date(),
        })
        .where(eq(ordenes.id, orden.id));
    }

    await tx.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: "EDICION_ITEM_PENDIENTE",
      tabla_afectada: "orden_items",
      registro_id: item.id,
      valores_anteriores: { cantidad: item.cantidad, notas: item.notas },
      valores_nuevos: { cantidad: nuevaCantidad, notas: input.notas ?? item.notas },
    });
  });

  return { ok: true };
}

