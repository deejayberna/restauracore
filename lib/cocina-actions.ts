"use server";

import { db } from "@/db";
import { ordenItems, ordenes, platillos, usuarios, usuarioRestaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { validateOrThrow, z } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError, NotFoundError } from "@/lib/errors";
import { notificarPedidoListoTelegram } from "@/lib/telegram-clientes";

const schema = z.object({
  item_id: z.string().uuid(),
  estado: z.enum(["en_preparacion", "listo", "entregado"]),
});

export async function actualizarEstadoItem(formData: FormData) {
  const { item_id, estado } = validateOrThrow(schema, {
    item_id: formData.get("item_id"),
    estado: formData.get("estado"),
  });

  // 1. Validar autenticación con Supabase
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError("Sesión no iniciada");
  }

  // 2. Resolver usuario en base de datos
  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) {
    throw new UnauthorizedError("Usuario no registrado en el sistema");
  }

  // 3. Obtener restaurante activo desde la cookie
  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) {
    throw new UnauthorizedError("No hay un restaurante activo seleccionado");
  }

  // 4. Validar vínculo activo del usuario con el restaurante
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

  // 5. Validar que el item existe y pertenece al restaurante activo
  const [itemConOrden] = await db
    .select({
      id: ordenItems.id,
      orden_id: ordenItems.orden_id,
      estado: ordenItems.estado,
      restaurante_id: ordenes.restaurante_id,
      estacion: platillos.estacion,
    })
    .from(ordenItems)
    .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
    .innerJoin(platillos, eq(platillos.id, ordenItems.platillo_id))
    .where(eq(ordenItems.id, item_id))
    .limit(1);

  if (!itemConOrden) {
    throw new NotFoundError("Item de orden");
  }

  if (itemConOrden.restaurante_id !== restaurante_id) {
    throw new UnauthorizedError("El item no pertenece al restaurante activo del usuario");
  }

  // 6. Validar permisos por rol y por estación
  const rol = vinculo.rol as string;
  const estacion = itemConOrden.estacion || "cocina";

  if (["gerente", "dueno"].includes(rol)) {
    // Gerente y dueño tienen control operativo total sobre cocina y barra
  } else if (rol === "food_runner" || rol === "mesero") {
    // food_runner y mesero solo pueden transicionar items de 'listo' a 'entregado'
    if (itemConOrden.estado !== "listo" || estado !== "entregado") {
      throw new UnauthorizedError(
        `El rol ${rol} solo tiene autorización para marcar platillos de 'listo' a 'entregado'`
      );
    }
  } else if (rol === "chef") {
    if (estacion === "bar") {
      throw new UnauthorizedError("El chef no puede gestionar platillos o bebidas de la barra");
    }
  } else if (rol === "bartender") {
    if (estacion === "cocina") {
      throw new UnauthorizedError("El bartender no puede gestionar platillos de cocina");
    }
  } else {
    throw new UnauthorizedError("Rol no autorizado para modificar items de cocina o barra");
  }

  // 7. Aplicar la actualización
  await db
    .update(ordenItems)
    .set({ estado })
    .where(eq(ordenItems.id, item_id));

  // 8. Si pasa a "listo", verificar si todos los items de la orden están listos para notificar al cliente vía Telegram
  if (estado === "listo") {
    try {
      const otrosItems = await db.query.ordenItems.findMany({
        where: eq(ordenItems.orden_id, itemConOrden.orden_id),
      });
      const todosListos = otrosItems.every(
        (it) => it.id === item_id || it.estado === "listo" || it.estado === "entregado" || it.estado === "cancelado"
      );
      if (todosListos) {
        notificarPedidoListoTelegram(itemConOrden.orden_id).catch(() => {});
      }
    } catch {
      // Notificación opcional no bloqueante
    }
  }

  return { exito: true };
}
