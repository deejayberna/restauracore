"use server";

import { db } from "@/db";
import {
  ordenItems,
  recetas,
  ingredientes,
  movimientosInventario,
  ordenes,
  platillos,
  usuarios,
  usuarioRestaurantes,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { validateOrThrow, z } from "@/lib/validation";
import { InsufficientStockError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";

const schema = z.object({
  item_id: z.string().uuid(),
});

export async function descontarInventarioPorOrden(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const { item_id } = validateOrThrow(schema, { item_id: formData.get("item_id") });

  // 1. Obtener usuario actual para registrar el movimiento
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sesión no iniciada" };
  }

  const usuarioActual = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuarioActual) {
    return { error: "Usuario no registrado en el sistema" };
  }

  // 2. Obtener restaurante activo desde la cookie
  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) {
    return { error: "No hay un restaurante activo seleccionado" };
  }

  // 3. Validar vínculo activo con el restaurante
  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuarioActual.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) {
    return { error: "No tienes un vínculo activo con este restaurante" };
  }

  // 4. Validar rol autorizado (chef, bartender, gerente, dueno)
  const ROLES_PERMITIDOS = ["chef", "bartender", "gerente", "dueno"];
  if (!ROLES_PERMITIDOS.includes(vinculo.rol)) {
    return { error: "Rol no autorizado para gestionar inventario de cocina" };
  }

  try {
    await db.transaction(async (tx) => {
      // 5. Obtener el orden_item con su platillo
      const item = await tx.query.ordenItems.findFirst({
        where: eq(ordenItems.id, item_id),
      });
      if (!item) throw new NotFoundError("Orden item");

      const platillo = await tx.query.platillos.findFirst({
        where: eq(platillos.id, item.platillo_id),
      });

      if (vinculo.rol === "chef" && platillo?.estacion === "bar") {
        throw new UnauthorizedError("El chef no puede despachar inventario de la barra");
      }
      if (vinculo.rol === "bartender" && platillo?.estacion === "cocina") {
        throw new UnauthorizedError("El bartender no puede despachar inventario de cocina");
      }

      // 6. Obtener la orden y validar pertenencia al restaurante activo
      const orden = await tx.query.ordenes.findFirst({
        where: eq(ordenes.id, item.orden_id),
      });
      if (!orden) throw new NotFoundError("Orden");

      if (orden.restaurante_id !== restaurante_id) {
        throw new UnauthorizedError("La orden no pertenece al restaurante activo del usuario");
      }

      // 7. Obtener receta del platillo
      const recetaItems = await tx.query.recetas.findMany({
        where: eq(recetas.platillo_id, item.platillo_id),
      });

      // 8. Doble verificación de stock antes de descontar
      for (const ri of recetaItems) {
        const ing = await tx.query.ingredientes.findFirst({
          where: eq(ingredientes.id, ri.ingrediente_id),
        });
        if (!ing) continue;

        if (ing.restaurante_id !== restaurante_id) {
          throw new UnauthorizedError("Ingrediente no pertenece al restaurante");
        }

        const requerido = Number(ri.cantidad_requerida) * item.cantidad;
        if (Number(ing.stock_actual) < requerido) {
          throw new InsufficientStockError(
            `${ing.nombre} (disponible: ${ing.stock_actual}, requerido: ${requerido})`
          );
        }
      }

      // 9. Descontar stock y registrar movimiento por cada ingrediente
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

      // 10. Marcar el orden_item como listo
      await tx
        .update(ordenItems)
        .set({ estado: "listo" })
        .where(eq(ordenItems.id, item_id));
    });

    return null; // éxito
  } catch (e) {
    if (
      e instanceof InsufficientStockError ||
      e instanceof NotFoundError ||
      e instanceof UnauthorizedError
    ) {
      return { error: e.message };
    }
    console.error("Error al descontar inventario:", e);
    return { error: "Error interno al procesar el descuento de inventario" };
  }
}

