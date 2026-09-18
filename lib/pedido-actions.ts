"use server";

import { db } from "@/db";
import { mesas, platillos, recetas, ingredientes, ordenes, ordenItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { validateOrThrow, z } from "@/lib/validation";
import { InsufficientStockError, NotFoundError, ValidationError } from "@/lib/errors";
import { headers } from "next/headers";
import { checkRateLimitPedido } from "@/lib/rate-limiter";

const itemPedidoSchema = z.object({
  platillo_id: z.string().uuid(),
  cantidad: z.number().int().min(1).max(50),
  notas: z.string().max(200).optional(),
});

const pedidoSchema = z.object({
  qr_token: z.string().min(1).max(100),
  items: z.array(itemPedidoSchema).min(1).max(30),
});

export type ResultadoPedido =
  | { ok: true; orden_id: string; error?: undefined }
  | { ok: false; error: string; orden_id?: undefined };

export async function confirmarPedido(
  _prev: ResultadoPedido | null,
  formData: FormData
): Promise<ResultadoPedido> {
  // 1. Validar con Zod — nunca confiar en datos del cliente
  let input: z.infer<typeof pedidoSchema>;
  try {
    input = validateOrThrow(pedidoSchema, {
      qr_token: formData.get("qr_token"),
      items: JSON.parse((formData.get("items") as string) ?? "[]"),
    });
  } catch (e) {
    return { ok: false, error: e instanceof ValidationError ? e.message : "Datos inválidos" };
  }

  // 1.1 Rate limiting por IP + qr_token para prevenir spam de pedidos
  let ip = "127.0.0.1";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  } catch {
    // Fallback seguro fuera de contexto Next.js (tests)
  }

  const rateCheck = await checkRateLimitPedido(`${ip}:${input.qr_token}`);
  if (!rateCheck.success) {
    return {
      ok: false,
      error: "Demasiados pedidos en poco tiempo. Por favor espera un momento.",
    };
  }

  try {
    // 2. Resolver mesa y restaurante
    const mesa = await db.query.mesas.findFirst({
      where: eq(mesas.qr_token, input.qr_token),
    });
    if (!mesa) throw new NotFoundError("Mesa");

    // 3. Consultar precio REAL y disponibilidad de cada platillo en BD
    //    (nunca usar el precio que viene del frontend)
    const ids = input.items.map((i) => i.platillo_id);
    const platillosDB = await db.query.platillos.findMany({
      where: (p, { inArray, and: dbAnd }) =>
        dbAnd(inArray(p.id, ids), eq(p.restaurante_id, mesa.restaurante_id)),
    });

    for (const item of input.items) {
      const platillo = platillosDB.find((p) => p.id === item.platillo_id);
      if (!platillo) throw new NotFoundError(`Platillo ${item.platillo_id}`);
      if (!platillo.disponible) throw new ValidationError(`"${platillo.nombre}" no está disponible`);
    }

    // 4. Verificar stock de ingredientes por receta ANTES de crear la orden
    for (const item of input.items) {
      const recetaItems = await db.query.recetas.findMany({
        where: eq(recetas.platillo_id, item.platillo_id),
      });

      for (const ri of recetaItems) {
        const ing = await db.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ri.ingrediente_id),
        });
        if (!ing) continue;

        const requerido = Number(ri.cantidad_requerida) * item.cantidad;
        if (Number(ing.stock_actual) < requerido) {
          const platillo = platillosDB.find((p) => p.id === item.platillo_id);
          throw new InsufficientStockError(
            `${ing.nombre} para "${platillo?.nombre}" (disponible: ${ing.stock_actual}, requerido: ${requerido})`
          );
        }
      }
    }

    // 5. Insertar o acumular en la orden abierta de la mesa
    const resultado = await db.transaction(async (tx) => {
      // 5.1 Verificar si la mesa tiene una cuenta en estado 'cuenta_solicitada'
      const cuentaSolicitada = await tx.query.ordenes.findFirst({
        where: and(eq(ordenes.mesa_id, mesa.id), eq(ordenes.estado, "cuenta_solicitada")),
      });

      if (cuentaSolicitada) {
        throw new ValidationError(
          "La cuenta de esta mesa ya fue solicitada. Si deseas ordenar algo adicional, por favor llama al mesero."
        );
      }

      const subtotalRonda = input.items.reduce((sum, item) => {
        const platillo = platillosDB.find((p) => p.id === item.platillo_id)!;
        return sum + Number(platillo.precio) * item.cantidad;
      }, 0);

      // 5.2 Buscar orden existente en estado 'abierta'
      const ordenAbierta = await tx.query.ordenes.findFirst({
        where: and(eq(ordenes.mesa_id, mesa.id), eq(ordenes.estado, "abierta")),
      });

      let ordenId: string;

      if (ordenAbierta) {
        ordenId = ordenAbierta.id;
        const nuevoSubtotal = Number(ordenAbierta.subtotal) + subtotalRonda;
        const nuevoTotal = Number(ordenAbierta.total) + subtotalRonda;

        await tx
          .update(ordenes)
          .set({
            subtotal: nuevoSubtotal.toFixed(2),
            total: nuevoTotal.toFixed(2),
            actualizado_en: new Date(),
          })
          .where(eq(ordenes.id, ordenAbierta.id));
      } else {
        const [nuevaOrden] = await tx
          .insert(ordenes)
          .values({
            restaurante_id: mesa.restaurante_id,
            mesa_id: mesa.id,
            estado: "abierta",
            subtotal: subtotalRonda.toFixed(2),
            total: subtotalRonda.toFixed(2),
          })
          .returning({ id: ordenes.id });

        ordenId = nuevaOrden.id;
      }

      // Insertar los items de la ronda en orden_items
      await tx.insert(ordenItems).values(
        input.items.map((item) => {
          const platillo = platillosDB.find((p) => p.id === item.platillo_id)!;
          return {
            orden_id: ordenId,
            platillo_id: item.platillo_id,
            cantidad: item.cantidad,
            precio_unitario_congelado: platillo.precio,
            notas: item.notas ?? null,
            estado: "pendiente" as const,
          };
        })
      );

      return ordenId;
    });

    return { ok: true, orden_id: resultado };
  } catch (e) {
    if (
      e instanceof NotFoundError ||
      e instanceof ValidationError ||
      e instanceof InsufficientStockError
    ) {
      return { ok: false, error: e.message };
    }
    console.error("Error al confirmar pedido:", e);
    return { ok: false, error: "Error interno al procesar el pedido" };
  }
}

/**
 * ACCIÓN: Solicitar la cuenta para una mesa (por el cliente o el mesero).
 * Acepta qr_token o el id de la orden.
 * Bloquea la cuenta para nuevos pedidos desde la app hasta que se pague.
 */
export async function solicitarCuentaAction(
  identificador: string
): Promise<{ ok: boolean; orden_id?: string; total?: number; error?: string }> {
  // 1. Probar si el identificador es directamente el id de la orden
  let ordenAbierta = await db.query.ordenes.findFirst({
    where: and(eq(ordenes.id, identificador), eq(ordenes.estado, "abierta")),
  });

  // 2. Si no, probar si es el qr_token de la mesa
  if (!ordenAbierta) {
    const mesa = await db.query.mesas.findFirst({
      where: eq(mesas.qr_token, identificador),
    });
    if (mesa) {
      ordenAbierta = await db.query.ordenes.findFirst({
        where: and(eq(ordenes.mesa_id, mesa.id), eq(ordenes.estado, "abierta")),
      });
    }
  }

  if (!ordenAbierta) {
    // Si ya estaba en 'cuenta_solicitada', retornar éxito de forma idempotente
    const cuentaPrevia = await db.query.ordenes.findFirst({
      where: and(
        eq(ordenes.id, identificador),
        eq(ordenes.estado, "cuenta_solicitada")
      ),
    });
    if (cuentaPrevia) {
      return { ok: true, orden_id: cuentaPrevia.id, total: parseFloat(cuentaPrevia.total) };
    }
    return { ok: false, error: "No hay una cuenta abierta activa para esta orden o mesa." };
  }

  await db
    .update(ordenes)
    .set({
      estado: "cuenta_solicitada",
      actualizado_en: new Date(),
    })
    .where(eq(ordenes.id, ordenAbierta.id));

  return { ok: true, orden_id: ordenAbierta.id, total: parseFloat(ordenAbierta.total) };
}
