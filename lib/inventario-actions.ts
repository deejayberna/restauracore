"use server";

import { db } from "@/db";
import { ordenItems, recetas, ingredientes, movimientosInventario, ordenes, usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateOrThrow, z } from "@/lib/validation";
import { InsufficientStockError, NotFoundError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const schema = z.object({
  item_id: z.string().uuid(),
});

export async function descontarInventarioPorOrden(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const { item_id } = validateOrThrow(schema, { item_id: formData.get("item_id") });

  // Obtener usuario actual para registrar el movimiento
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const usuarioActual = user
    ? await db.query.usuarios.findFirst({
        where: eq(usuarios.auth_id, user.id),
      })
    : null;

  if (!usuarioActual) return { error: "Usuario no autenticado" };

  try {
    await db.transaction(async (tx) => {
      // 1. Obtener el orden_item con su platillo
      const item = await tx.query.ordenItems.findFirst({
        where: eq(ordenItems.id, item_id),
      });
      if (!item) throw new NotFoundError("Orden item");

      // 2. Obtener la orden para tener el orden_id en movimientos
      const orden = await tx.query.ordenes.findFirst({
        where: eq(ordenes.id, item.orden_id),
      });
      if (!orden) throw new NotFoundError("Orden");

      // 3. Obtener receta del platillo
      const recetaItems = await tx.query.recetas.findMany({
        where: eq(recetas.platillo_id, item.platillo_id),
      });

      // 4. Doble verificación de stock antes de descontar
      for (const ri of recetaItems) {
        const ing = await tx.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ri.ingrediente_id),
        });
        if (!ing) continue;

        const requerido = Number(ri.cantidad_requerida) * item.cantidad;
        if (Number(ing.stock_actual) < requerido) {
          throw new InsufficientStockError(
            `${ing.nombre} (disponible: ${ing.stock_actual}, requerido: ${requerido})`
          );
        }
      }

      // 5. Descontar stock y registrar movimiento por cada ingrediente
      for (const ri of recetaItems) {
        const ing = await tx.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ri.ingrediente_id),
        });
        if (!ing) continue;

        const cantidad = Number(ri.cantidad_requerida) * item.cantidad;
        const nuevoStock = (Number(ing.stock_actual) - cantidad).toFixed(3);

        await tx
          .update(ingredientes)
          .set({ stock_actual: nuevoStock, actualizado_en: new Date() })
          .where(eq(ingredientes.id, ing.id));

        await tx.insert(movimientosInventario).values({
          ingrediente_id: ing.id,
          tipo: "venta",
          cantidad: (-cantidad).toFixed(3),
          orden_id: orden.id,
          creado_por: usuarioActual.id,
        });
      }

      // 6. Marcar el orden_item como listo
      await tx
        .update(ordenItems)
        .set({ estado: "listo" })
        .where(eq(ordenItems.id, item_id));
    });

    return null; // éxito
  } catch (e) {
    if (e instanceof InsufficientStockError || e instanceof NotFoundError) {
      return { error: e.message };
    }
    console.error("Error al descontar inventario:", e);
    return { error: "Error interno al procesar el descuento de inventario" };
  }
}
