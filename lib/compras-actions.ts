"use server";

import { db } from "@/db";
import {
  compras,
  compraItems,
  ingredientes,
  movimientosInventario,
  prediccionesDemanda,
  proveedores,
  restaurantes,
  logAuditoria,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  enviarNotificacionIncidenciaCompra,
  type IncidenciaCompraPayload,
} from "@/lib/notificaciones";
import { obtenerDestinatariosRestaurante } from "@/lib/notificaciones-destinatarios";

import { UnauthorizedError } from "@/lib/errors";

export type { IncidenciaCompraPayload };

// ─────────────────────────────────────────────────────────────────────────────
// 1. Verificación de Rol y Contexto Activo
// ─────────────────────────────────────────────────────────────────────────────

export async function validarAccesoCompras(
  rolesPermitidos: string[] = ["gerente", "dueno"]
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError("Usuario no autenticado");
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) {
    throw new UnauthorizedError("Usuario no registrado en el sistema");
  }

  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) {
    throw new UnauthorizedError("No hay un restaurante activo seleccionado");
  }

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) {
    throw new UnauthorizedError("No tienes un vínculo activo con este restaurante");
  }

  if (!rolesPermitidos.includes(vinculo.rol)) {
    throw new UnauthorizedError(
      `Rol '${vinculo.rol}' no autorizado. Módulo reservado para: ${rolesPermitidos.join(", ")}.`
    );
  }

  return { usuario, vinculo, restaurante_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sugerencias Automáticas de Compra y Comparador de Proveedores
// ─────────────────────────────────────────────────────────────────────────────

export interface ComparativaProveedorItem {
  proveedor_id: string;
  proveedor_nombre: string;
  precio_promedio: number;
  total_compras: number;
}

export interface SugerenciaCompraItem {
  ingrediente_id: string;
  nombre: string;
  unidad_medida: string;
  costo_unitario_actual: number;
  stock_actual: number;
  stock_minimo: number;
  consumo_estimado_7dias: number;
  cantidad_sugerida: number;
  proveedores_comparativa: ComparativaProveedorItem[];
}

export async function obtenerSugerenciasCompra(restauranteId: string) {
  // Ingredientes con stock bajo o igual al mínimo
  const todosIngredientes = await db.query.ingredientes.findMany({
    where: eq(ingredientes.restaurante_id, restauranteId),
    orderBy: [asc(ingredientes.nombre)],
  });

  // Consumo estimado en los próximos 7 días según predicciones_demanda
  const hoy = new Date();
  const en7Dias = new Date(hoy);
  en7Dias.setDate(en7Dias.getDate() + 7);

  const predicciones = await db
    .select({
      ingrediente_id: prediccionesDemanda.ingrediente_id,
      total_estimado: sql<number>`COALESCE(SUM(CAST(${prediccionesDemanda.cantidad_estimada} AS NUMERIC)), 0)`,
    })
    .from(prediccionesDemanda)
    .where(
      and(
        gte(prediccionesDemanda.fecha, hoy),
        lte(prediccionesDemanda.fecha, en7Dias)
      )
    )
    .groupBy(prediccionesDemanda.ingrediente_id);

  const prediccionMap = new Map(
    predicciones.map((p) => [p.ingrediente_id, Number(p.total_estimado)])
  );

  // Historial de precios por proveedor para cada ingrediente
  const historicoPrecios = await db
    .select({
      ingrediente_id: compraItems.ingrediente_id,
      proveedor_id: compras.proveedor_id,
      proveedor_nombre: proveedores.nombre,
      precio_promedio: sql<number>`AVG(CAST(${compraItems.costo_unitario_pactado} AS NUMERIC))`,
      total_compras: sql<number>`COUNT(${compras.id})`,
    })
    .from(compraItems)
    .innerJoin(compras, eq(compras.id, compraItems.compra_id))
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedor_id))
    .where(eq(compras.restaurante_id, restauranteId))
    .groupBy(
      compraItems.ingrediente_id,
      compras.proveedor_id,
      proveedores.nombre
    )
    .orderBy(asc(sql`AVG(CAST(${compraItems.costo_unitario_pactado} AS NUMERIC))`));

  const historicoMap = new Map<string, ComparativaProveedorItem[]>();
  for (const h of historicoPrecios) {
    const list = historicoMap.get(h.ingrediente_id) ?? [];
    list.push({
      proveedor_id: h.proveedor_id,
      proveedor_nombre: h.proveedor_nombre,
      precio_promedio: Number(Number(h.precio_promedio).toFixed(2)),
      total_compras: Number(h.total_compras),
    });
    historicoMap.set(h.ingrediente_id, list);
  }

  // Filtrar ingredientes que requieren reposición (stock_actual <= stock_minimo)
  const sugerencias: SugerenciaCompraItem[] = [];

  for (const ing of todosIngredientes) {
    const stockActual = Number(ing.stock_actual);
    const stockMinimo = Number(ing.stock_minimo);

    if (stockActual <= stockMinimo) {
      const faltanteMinimo = Math.max(0, stockMinimo - stockActual);
      const consumoEstimado = prediccionMap.get(ing.id) ?? 0;
      const sugerida = Number((faltanteMinimo + consumoEstimado).toFixed(3));

      sugerencias.push({
        ingrediente_id: ing.id,
        nombre: ing.nombre,
        unidad_medida: ing.unidad_medida,
        costo_unitario_actual: Number(ing.costo_unitario),
        stock_actual: stockActual,
        stock_minimo: stockMinimo,
        consumo_estimado_7dias: Number(consumoEstimado.toFixed(3)),
        cantidad_sugerida: sugerida > 0 ? sugerida : 1,
        proveedores_comparativa: historicoMap.get(ing.id) ?? [],
      });
    }
  }

  return sugerencias;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Creación de Orden de Compra (Server Action)
// ─────────────────────────────────────────────────────────────────────────────

const crearCompraItemSchema = z.object({
  ingrediente_id: z.string().uuid("ID de ingrediente inválido"),
  cantidad_pedida: z.number().positive("La cantidad pedida debe ser mayor a 0"),
  costo_unitario_pactado: z
    .number()
    .nonnegative("El costo unitario debe ser mayor o igual a 0"),
});

const crearCompraSchema = z.object({
  proveedor_id: z.string().uuid("ID de proveedor inválido"),
  items: z.array(crearCompraItemSchema).min(1, "Debe incluir al menos un ingrediente"),
});

export type CrearCompraInput = z.infer<typeof crearCompraSchema>;

export async function crearCompraAction(input: CrearCompraInput) {
  const { usuario, vinculo, restaurante_id } = await validarAccesoCompras();
  const validado = crearCompraSchema.parse(input);

  // Calcular total estimado de la compra
  const totalEstimado = validado.items.reduce(
    (sum, item) => sum + item.cantidad_pedida * item.costo_unitario_pactado,
    0
  );

  // Ejecutar dentro de una transacción atómica de Drizzle
  const resultado = await db.transaction(async (tx) => {
    // 1. Insertar orden de compra en estado 'pendiente'
    const [nuevaCompra] = await tx
      .insert(compras)
      .values({
        restaurante_id,
        proveedor_id: validado.proveedor_id,
        estado: "pendiente",
        total_estimado: totalEstimado.toFixed(2),
        creado_por: usuario.id,
      })
      .returning();

    // 2. Insertar los ítems asociados
    for (const item of validado.items) {
      await tx.insert(compraItems).values({
        compra_id: nuevaCompra.id,
        ingrediente_id: item.ingrediente_id,
        cantidad_pedida: item.cantidad_pedida.toString(),
        costo_unitario_pactado: item.costo_unitario_pactado.toString(),
      });
    }

    // 3. Asentar en log_auditoria
    await tx.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: "CREAR_ORDEN_COMPRA",
      tabla_afectada: "compras",
      registro_id: nuevaCompra.id,
      valores_nuevos: {
        compra_id: nuevaCompra.id,
        proveedor_id: validado.proveedor_id,
        total_estimado: totalEstimado,
        items_count: validado.items.length,
        creado_por: {
          usuario_id: usuario.id,
          nombre: usuario.nombre,
          rol: vinculo.rol,
        },
      },
    });

    return nuevaCompra;
  });

  return {
    ok: true,
    compra_id: resultado.id,
    total_estimado: Number(resultado.total_estimado),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Recepción de Mercancía con Control Anti-Fraude e Idempotencia
// ─────────────────────────────────────────────────────────────────────────────

const recibirCompraItemSchema = z.object({
  compra_item_id: z.string().uuid(),
  ingrediente_id: z.string().uuid(),
  cantidad_recibida: z
    .number()
    .nonnegative("La cantidad recibida no puede ser negativa"),
});

const recibirCompraSchema = z.object({
  compra_id: z.string().uuid("ID de compra inválido"),
  items: z.array(recibirCompraItemSchema).min(1, "Debe procesar al menos un ítem"),
});

export type RecibirCompraInput = z.infer<typeof recibirCompraSchema>;

export interface ResultadoRecepcionCompra {
  ok: boolean;
  codigo?: string;
  error?: string;
  compra_id?: string;
  estado?: "recibida" | "incidencia";
  total_real?: number;
  porcentaje_faltante?: number;
  items_con_faltante?: Array<{
    ingrediente_id: string;
    ingrediente_nombre: string;
    unidad: string;
    pedido: number;
    recibido: number;
    faltante: number;
  }>;
}

export async function recibirCompraAction(
  input: RecibirCompraInput
): Promise<ResultadoRecepcionCompra> {
  const { usuario, vinculo, restaurante_id } = await validarAccesoCompras();
  const validado = recibirCompraSchema.parse(input);

  // Consultar la compra y sus ítems para validar estado preliminar
  const compraDb = await db.query.compras.findFirst({
    where: and(
      eq(compras.id, validado.compra_id),
      eq(compras.restaurante_id, restaurante_id)
    ),
    with: {
      proveedor: true,
      items: {
        with: {
          ingrediente: true,
        },
      },
    },
  });

  if (!compraDb) {
    return {
      ok: false,
      codigo: "COMPRA_NO_ENCONTRADA",
      error: `No se encontró la orden de compra '${validado.compra_id}'.`,
    };
  }

  // Pre-evaluación de los ítems recibidos vs pedidos
  const itemsMap = new Map(validado.items.map((i) => [i.compra_item_id, i]));
  const itemsConFaltante: Array<{
    ingrediente_id: string;
    ingrediente_nombre: string;
    unidad: string;
    pedido: number;
    recibido: number;
    faltante: number;
  }> = [];

  let totalReal = 0;
  let sumaUnidadesPedidas = 0;
  let sumaUnidadesRecibidas = 0;

  for (const itemOriginal of compraDb.items) {
    const itemRecibido = itemsMap.get(itemOriginal.id);
    const cantRecibida = itemRecibido
      ? itemRecibido.cantidad_recibida
      : Number(itemOriginal.cantidad_pedida);

    const cantPedida = Number(itemOriginal.cantidad_pedida);
    const costoUnit = Number(itemOriginal.costo_unitario_pactado);

    sumaUnidadesPedidas += cantPedida;
    sumaUnidadesRecibidas += cantRecibida;
    totalReal += cantRecibida * costoUnit;

    if (cantRecibida < cantPedida) {
      itemsConFaltante.push({
        ingrediente_id: itemOriginal.ingrediente_id,
        ingrediente_nombre: itemOriginal.ingrediente.nombre,
        unidad: itemOriginal.ingrediente.unidad_medida,
        pedido: cantPedida,
        recibido: cantRecibida,
        faltante: Number((cantPedida - cantRecibida).toFixed(3)),
      });
    }
  }

  const hayIncidencia = itemsConFaltante.length > 0;
  const nuevoEstado: "incidencia" | "recibida" = hayIncidencia
    ? "incidencia"
    : "recibida";

  const totalFaltanteUnidades = Math.max(
    0,
    sumaUnidadesPedidas - sumaUnidadesRecibidas
  );
  const porcentajeFaltante =
    sumaUnidadesPedidas > 0
      ? Number(((totalFaltanteUnidades / sumaUnidadesPedidas) * 100).toFixed(2))
      : 0;

  // ───────────────────────────────────────────────────────────────────────────
  // TRANSACCIÓN ATÓMICA DE BASE DE DATOS
  // ───────────────────────────────────────────────────────────────────────────
  const txResult = await db.transaction(async (tx) => {
    // 1. TRANSICIÓN DE ESTADO ATÓMICA EN COMPRAS:
    // UPDATE compras SET estado = $nuevoEstado WHERE id = $1 AND estado NOT IN ('recibida', 'incidencia', 'cancelada')
    const [compraActualizada] = await tx
      .update(compras)
      .set({
        estado: nuevoEstado,
        total_real: totalReal.toFixed(2),
      })
      .where(
        and(
          eq(compras.id, validado.compra_id),
          eq(compras.restaurante_id, restaurante_id),
          or(eq(compras.estado, "pendiente"), eq(compras.estado, "confirmada"))
        )
      )
      .returning();

    // 2. DETECCIÓN DE DOBLE RECEPCIÓN / CONDICIÓN DE CARRERA:
    // Si 0 filas fueron afectadas, la compra ya fue procesada antes.
    if (!compraActualizada) {
      await tx.insert(logAuditoria).values({
        restaurante_id,
        usuario_id: usuario.id,
        accion: "ANOMALIA_INTENTO_DOBLE_RECEPCION_COMPRA",
        tabla_afectada: "compras",
        registro_id: validado.compra_id,
        valores_anteriores: {
          estado_actual: compraDb.estado,
          total_real_previo: compraDb.total_real,
        },
        valores_nuevos: {
          intento_por: {
            usuario_id: usuario.id,
            nombre: usuario.nombre,
            rol: vinculo.rol,
          },
          fecha_intento: new Date().toISOString(),
          motivo:
            "Actualización atómica fallida (0 filas afectadas): la orden de compra ya fue recibida o procesada previamente.",
        },
      });

      return {
        duplicado: true as const,
      };
    }

    // 3. ACTUALIZACIÓN ATÓMICA DE CADA ÍTEM Y DEL STOCK EN POSTGRESQL:
    for (const itemOriginal of compraDb.items) {
      const itemRecibido = itemsMap.get(itemOriginal.id);
      const cantRealRecibida = itemRecibido
        ? itemRecibido.cantidad_recibida
        : Number(itemOriginal.cantidad_pedida);

      // a) Actualizar cantidad_recibida en compra_items
      await tx
        .update(compraItems)
        .set({
          cantidad_recibida: cantRealRecibida.toString(),
        })
        .where(eq(compraItems.id, itemOriginal.id));

      // b) UPDATE atómico en ingredientes: suma ÚNICAMENTE la cantidad física real
      // UPDATE ingredientes SET stock_actual = stock_actual + $cantReal WHERE id = $id RETURNING *
      await tx
        .update(ingredientes)
        .set({
          stock_actual: sql`${ingredientes.stock_actual} + ${cantRealRecibida.toString()}`,
          actualizado_en: new Date(),
        })
        .where(eq(ingredientes.id, itemOriginal.ingrediente_id))
        .returning();

      // c) Registrar movimiento de inventario tipo 'compra'
      await tx.insert(movimientosInventario).values({
        ingrediente_id: itemOriginal.ingrediente_id,
        tipo: "compra",
        cantidad: cantRealRecibida.toString(),
        motivo: `Recepción de orden de compra ${validado.compra_id}`,
        creado_por: usuario.id,
      });
    }

    // 4. Asentar en log_auditoria
    const accionAuditoria = hayIncidencia
      ? "RECEPCION_COMPRA_INCIDENCIA"
      : "RECEPCION_COMPRA";

    await tx.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: accionAuditoria,
      tabla_afectada: "compras",
      registro_id: validado.compra_id,
      valores_anteriores: {
        estado: compraDb.estado,
        total_estimado: compraDb.total_estimado,
      },
      valores_nuevos: {
        estado: nuevoEstado,
        total_real: totalReal,
        hay_incidencia: hayIncidencia,
        porcentaje_faltante: porcentajeFaltante,
        desglose_faltantes: itemsConFaltante,
        recibido_por: {
          usuario_id: usuario.id,
          nombre: usuario.nombre,
          rol: vinculo.rol,
        },
      },
    });

    return {
      duplicado: false as const,
      compra: compraActualizada,
    };
  });

  // Manejo de rechazo por doble recepción
  if (txResult.duplicado) {
    return {
      ok: false,
      codigo: "COMPRA_YA_PROCESADA",
      error:
        "La orden de compra ya fue recibida previamente o está siendo procesada.",
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // NOTIFICACIÓN MULTICANAL CON PATRÓN ANTI-SILENCIO (SI HAY INCIDENCIA)
  // ───────────────────────────────────────────────────────────────────────────
  if (hayIncidencia) {
    const destinatarios = await obtenerDestinatariosRestaurante(restaurante_id);
    const restauranteNombre = destinatarios.restaurante_nombre || "Restaurante";

    const payloadIncidencia: IncidenciaCompraPayload = {
      restaurante: restauranteNombre,
      proveedor_nombre: compraDb.proveedor?.nombre ?? "Proveedor",
      compra_id: validado.compra_id,
      total_pedido: Number(sumaUnidadesPedidas.toFixed(2)),
      total_recibido: Number(sumaUnidadesRecibidas.toFixed(2)),
      porcentaje_faltante: porcentajeFaltante,
      desglose_faltantes: itemsConFaltante.map((i) => ({
        ingrediente: i.ingrediente_nombre,
        unidad: i.unidad,
        pedido: i.pedido,
        recibido: i.recibido,
        faltante: i.faltante,
      })),
      usuario_recepcion: `${usuario.nombre} (${vinculo.rol})`,
      chat_id: destinatarios.chat_id,
      destinatario_email: destinatarios.emails,
    };

    await dispararAlertaIncidenciaCompraSiAplica(true, payloadIncidencia, {
      restaurante_id,
      usuario_id: usuario.id,
      compra_id: validado.compra_id,
    });
  }

  return {
    ok: true,
    compra_id: validado.compra_id,
    estado: nuevoEstado,
    total_real: totalReal,
    porcentaje_faltante: porcentajeFaltante,
    items_con_faltante: itemsConFaltante,
  };
}

/**
 * Helper exportado para disparar alerta de incidencia con patrón anti-silencio.
 */
export async function dispararAlertaIncidenciaCompraSiAplica(
  hayIncidencia: boolean,
  payload: IncidenciaCompraPayload,
  contextoAuditoria?: {
    restaurante_id: string;
    usuario_id: string;
    compra_id: string;
  }
): Promise<{ disparada: boolean; enviada?: boolean; error?: string }> {
  if (!hayIncidencia) {
    return { disparada: false };
  }

  try {
    await enviarNotificacionIncidenciaCompra(payload);
    return { disparada: true, enviada: true };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[FALLO_ENVIO_ALERTA_INCIDENCIA_COMPRA] No se pudo entregar la alerta de incidencia para orden ${payload.compra_id}:`,
      errorMsg
    );

    // Registro inmutable en log_auditoria para evitar fallos silenciosos
    if (contextoAuditoria?.restaurante_id && contextoAuditoria?.usuario_id) {
      try {
        await db.insert(logAuditoria).values({
          restaurante_id: contextoAuditoria.restaurante_id,
          usuario_id: contextoAuditoria.usuario_id,
          accion: "FALLO_ENVIO_ALERTA_INCIDENCIA_COMPRA",
          tabla_afectada: "compras",
          registro_id: contextoAuditoria.compra_id,
          valores_nuevos: {
            proveedor: payload.proveedor_nombre,
            porcentaje_faltante: payload.porcentaje_faltante,
            desglose_faltantes: payload.desglose_faltantes,
            error: errorMsg,
            fallo_en: "alerta_inmediata_multicanal",
          },
        });
      } catch (auditErr) {
        console.error(
          "[FALLO_AUDITORIA_CRITICO] Error al asentar FALLO_ENVIO_ALERTA_INCIDENCIA_COMPRA en log_auditoria:",
          auditErr
        );
      }
    }

    return { disparada: true, enviada: false, error: errorMsg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Historial de Desempeño e Incidencias por Proveedor
// ─────────────────────────────────────────────────────────────────────────────

export interface ProveedorDesempenoItem {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  calificacion: number | null;
  total_compras: number;
  compras_recibidas: number;
  compras_incidencia: number;
  tasa_incidencia: number; // Porcentaje 0 - 100
}

export async function obtenerHistorialIncidenciasProveedores(
  restauranteId: string
): Promise<ProveedorDesempenoItem[]> {
  const todosProveedores = await db.query.proveedores.findMany({
    where: eq(proveedores.restaurante_id, restauranteId),
    orderBy: [asc(proveedores.nombre)],
  });

  const comprasList = await db.query.compras.findMany({
    where: eq(compras.restaurante_id, restauranteId),
  });

  const comprasPorProveedor = new Map<
    string,
    { total: number; recibidas: number; incidencias: number }
  >();

  for (const c of comprasList) {
    const stat = comprasPorProveedor.get(c.proveedor_id) ?? {
      total: 0,
      recibidas: 0,
      incidencias: 0,
    };
    stat.total += 1;
    if (c.estado === "recibida") stat.recibidas += 1;
    if (c.estado === "incidencia") stat.incidencias += 1;
    comprasPorProveedor.set(c.proveedor_id, stat);
  }

  return todosProveedores.map((p) => {
    const stats = comprasPorProveedor.get(p.id) ?? {
      total: 0,
      recibidas: 0,
      incidencias: 0,
    };
    const tasa =
      stats.total > 0
        ? Number(((stats.incidencias / stats.total) * 100).toFixed(1))
        : 0;

    return {
      id: p.id,
      nombre: p.nombre,
      contacto: p.contacto,
      telefono: p.telefono,
      email: p.email,
      calificacion: p.calificacion ? Number(p.calificacion) : null,
      total_compras: stats.total,
      compras_recibidas: stats.recibidas,
      compras_incidencia: stats.incidencias,
      tasa_incidencia: tasa,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Consultas para Vistas de Compras
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerListaCompras(restauranteId: string) {
  return db.query.compras.findMany({
    where: eq(compras.restaurante_id, restauranteId),
    with: {
      proveedor: true,
      items: {
        with: {
          ingrediente: true,
        },
      },
    },
    orderBy: [desc(compras.creado_en)],
  });
}

export async function obtenerDetalleCompra(
  compraId: string,
  restauranteId: string
) {
  return db.query.compras.findFirst({
    where: and(
      eq(compras.id, compraId),
      eq(compras.restaurante_id, restauranteId)
    ),
    with: {
      proveedor: true,
      items: {
        with: {
          ingrediente: true,
        },
      },
    },
  });
}

export async function obtenerProveedoresRestaurante(restauranteId: string) {
  return db.query.proveedores.findMany({
    where: eq(proveedores.restaurante_id, restauranteId),
    orderBy: [asc(proveedores.nombre)],
  });
}

