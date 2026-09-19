"use server";

import { db } from "@/db";
import {
  categoriasMenu,
  platillos,
  recetas,
  ingredientes,
  ordenItems,
  usuarios,
  usuarioRestaurantes,
  logAuditoria,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { UnauthorizedError } from "@/lib/errors";

/**
 * Valida la sesión del usuario y que cuente con rol 'gerente' o 'dueno' en el restaurante activo.
 */
export async function validarSupervisorMenu() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError("Sesión no iniciada");
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) {
    throw new UnauthorizedError("Usuario no registrado en el sistema");
  }

  const cookieStore = await cookies();
  const restauranteId = cookieStore.get("restaurante_activo")?.value;

  if (!restauranteId) {
    throw new UnauthorizedError("No hay un restaurante activo seleccionado");
  }

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restauranteId),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) {
    throw new UnauthorizedError("No tienes un vínculo activo con este restaurante");
  }

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError(
      `Rol '${vinculo.rol}' no autorizado. Solo gerentes o dueños pueden gestionar el menú.`
    );
  }

  return { usuario, vinculo, restauranteId };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTAS DEL MENÚ
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerMenuAdminAction() {
  const { restauranteId } = await validarSupervisorMenu();

  // 1. Obtener todas las categorías (activas e inactivas) ordenadas
  const categorias = await db.query.categoriasMenu.findMany({
    where: eq(categoriasMenu.restaurante_id, restauranteId),
    orderBy: [asc(categoriasMenu.orden), asc(categoriasMenu.nombre)],
  });

  // 2. Obtener todos los platillos
  const listaPlatillos = await db.query.platillos.findMany({
    where: eq(platillos.restaurante_id, restauranteId),
    orderBy: [asc(platillos.nombre)],
  });

  // 3. Obtener todas las recetas del restaurante para saber qué platillos tienen receta
  const recetasExistentes = await db
    .select({
      platillo_id: recetas.platillo_id,
      ingrediente_id: recetas.ingrediente_id,
      cantidad_requerida: recetas.cantidad_requerida,
    })
    .from(recetas)
    .innerJoin(platillos, eq(platillos.id, recetas.platillo_id))
    .where(eq(platillos.restaurante_id, restauranteId));

  const mapaRecetas = new Map<string, number>();
  for (const r of recetasExistentes) {
    mapaRecetas.set(r.platillo_id, (mapaRecetas.get(r.platillo_id) || 0) + 1);
  }

  // 4. Obtener ingredientes disponibles para el selector de recetas
  const listaIngredientes = await db.query.ingredientes.findMany({
    where: eq(ingredientes.restaurante_id, restauranteId),
    orderBy: [asc(ingredientes.nombre)],
  });

  const platillosConMeta = listaPlatillos.map((p) => ({
    ...p,
    tieneReceta: (mapaRecetas.get(p.id) || 0) > 0,
    totalIngredientesReceta: mapaRecetas.get(p.id) || 0,
  }));

  return {
    categorias,
    platillos: platillosConMeta,
    ingredientes: listaIngredientes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS
// ─────────────────────────────────────────────────────────────────────────────

export async function crearCategoriaAction(data: { nombre: string; orden?: number }) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const nombreLimpio = data.nombre?.trim();
  if (!nombreLimpio) {
    return { error: "El nombre de la categoría es requerido." };
  }

  const ordenNum = Number.isInteger(data.orden) ? Number(data.orden) : 0;

  const [nuevaCat] = await db
    .insert(categoriasMenu)
    .values({
      restaurante_id: restauranteId,
      nombre: nombreLimpio,
      orden: ordenNum,
      activo: true,
    })
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuario.id,
    accion: "CREACION_CATEGORIA_MENU",
    tabla_afectada: "categorias_menu",
    registro_id: nuevaCat.id,
    valores_nuevos: { nombre: nuevaCat.nombre, orden: nuevaCat.orden },
  });

  revalidatePath("/menu/administrar");
  return { success: true, categoria: nuevaCat };
}

export async function editarCategoriaAction(
  id: string,
  data: { nombre: string; orden: number; activo: boolean }
) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const nombreLimpio = data.nombre?.trim();
  if (!nombreLimpio) {
    return { error: "El nombre de la categoría es requerido." };
  }

  const [catActual] = await db
    .select()
    .from(categoriasMenu)
    .where(and(eq(categoriasMenu.id, id), eq(categoriasMenu.restaurante_id, restauranteId)))
    .limit(1);

  if (!catActual) {
    return { error: "Categoría no encontrada." };
  }

  const [actualizada] = await db
    .update(categoriasMenu)
    .set({
      nombre: nombreLimpio,
      orden: Number(data.orden) || 0,
      activo: data.activo !== false,
    })
    .where(and(eq(categoriasMenu.id, id), eq(categoriasMenu.restaurante_id, restauranteId)))
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuario.id,
    accion: "EDICION_CATEGORIA_MENU",
    tabla_afectada: "categorias_menu",
    registro_id: id,
    valores_anteriores: { nombre: catActual.nombre, orden: catActual.orden, activo: catActual.activo },
    valores_nuevos: { nombre: actualizada.nombre, orden: actualizada.orden, activo: actualizada.activo },
  });

  revalidatePath("/menu/administrar");
  return { success: true, categoria: actualizada };
}

export async function cambiarEstadoCategoriaAction(id: string, activo: boolean) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const [actualizada] = await db
    .update(categoriasMenu)
    .set({ activo })
    .where(and(eq(categoriasMenu.id, id), eq(categoriasMenu.restaurante_id, restauranteId)))
    .returning();

  if (!actualizada) {
    return { error: "Categoría no encontrada." };
  }

  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuario.id,
    accion: activo ? "ACTIVACION_CATEGORIA_MENU" : "DESACTIVACION_CATEGORIA_MENU",
    tabla_afectada: "categorias_menu",
    registro_id: id,
    valores_nuevos: { activo },
  });

  revalidatePath("/menu/administrar");
  return { success: true, activo: actualizada.activo };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATILLOS
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatilloInput {
  categoriaId: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  tiempoPrepMinutos?: number;
  fotoUrl?: string;
  disponible?: boolean;
}

export async function crearPlatilloAction(input: PlatilloInput) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const nombreLimpio = input.nombre?.trim();
  if (!nombreLimpio) {
    return { error: "El nombre del platillo es requerido." };
  }

  if (typeof input.precio !== "number" || input.precio <= 0) {
    return { error: "El precio debe ser un número mayor a cero." };
  }

  // Validar que la categoría pertenezca al restaurante
  const cat = await db.query.categoriasMenu.findFirst({
    where: and(
      eq(categoriasMenu.id, input.categoriaId),
      eq(categoriasMenu.restaurante_id, restauranteId)
    ),
  });

  if (!cat) {
    return { error: "La categoría seleccionada no es válida para este restaurante." };
  }

  const [nuevoPlatillo] = await db
    .insert(platillos)
    .values({
      restaurante_id: restauranteId,
      categoria_id: cat.id,
      nombre: nombreLimpio,
      descripcion: input.descripcion?.trim() || null,
      precio: input.precio.toFixed(2),
      tiempo_prep_minutos: input.tiempoPrepMinutos ? Math.max(1, Number(input.tiempoPrepMinutos)) : null,
      foto_url: input.fotoUrl?.trim() || null,
      disponible: input.disponible !== false,
    })
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuario.id,
    accion: "CREACION_PLATILLO_MENU",
    tabla_afectada: "platillos",
    registro_id: nuevoPlatillo.id,
    valores_nuevos: {
      nombre: nuevoPlatillo.nombre,
      precio: nuevoPlatillo.precio,
      categoria_id: nuevoPlatillo.categoria_id,
      disponible: nuevoPlatillo.disponible,
    },
  });

  revalidatePath("/menu/administrar");
  return { success: true, platillo: nuevoPlatillo };
}

export async function editarPlatilloAction(id: string, input: PlatilloInput) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const nombreLimpio = input.nombre?.trim();
  if (!nombreLimpio) {
    return { error: "El nombre del platillo es requerido." };
  }

  if (typeof input.precio !== "number" || input.precio <= 0) {
    return { error: "El precio debe ser un número mayor a cero." };
  }

  const platilloPrevio = await db.query.platillos.findFirst({
    where: and(eq(platillos.id, id), eq(platillos.restaurante_id, restauranteId)),
  });

  if (!platilloPrevio) {
    return { error: "Platillo no encontrado." };
  }

  const [actualizado] = await db
    .update(platillos)
    .set({
      categoria_id: input.categoriaId,
      nombre: nombreLimpio,
      descripcion: input.descripcion?.trim() || null,
      precio: input.precio.toFixed(2),
      tiempo_prep_minutos: input.tiempoPrepMinutos ? Math.max(1, Number(input.tiempoPrepMinutos)) : null,
      foto_url: input.fotoUrl !== undefined ? input.fotoUrl?.trim() || null : platilloPrevio.foto_url,
      disponible: input.disponible !== undefined ? input.disponible : platilloPrevio.disponible,
    })
    .where(and(eq(platillos.id, id), eq(platillos.restaurante_id, restauranteId)))
    .returning();

  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuario.id,
    accion: "EDICION_PLATILLO_MENU",
    tabla_afectada: "platillos",
    registro_id: id,
    valores_anteriores: {
      nombre: platilloPrevio.nombre,
      precio: platilloPrevio.precio,
      categoria_id: platilloPrevio.categoria_id,
      disponible: platilloPrevio.disponible,
    },
    valores_nuevos: {
      nombre: actualizado.nombre,
      precio: actualizado.precio,
      categoria_id: actualizado.categoria_id,
      disponible: actualizado.disponible,
    },
  });

  revalidatePath("/menu/administrar");
  return { success: true, platillo: actualizado };
}

export async function cambiarDisponibilidadPlatilloAction(id: string, disponible: boolean) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const [actualizado] = await db
    .update(platillos)
    .set({ disponible })
    .where(and(eq(platillos.id, id), eq(platillos.restaurante_id, restauranteId)))
    .returning();

  if (!actualizado) {
    return { error: "Platillo no encontrado." };
  }

  await db.insert(logAuditoria).values({
    restaurante_id: restauranteId,
    usuario_id: usuario.id,
    accion: disponible ? "ACTIVACION_PLATILLO_MENU" : "DESACTIVACION_PLATILLO_MENU",
    tabla_afectada: "platillos",
    registro_id: id,
    valores_nuevos: { disponible },
  });

  revalidatePath("/menu/administrar");
  return { success: true, disponible: actualizado.disponible };
}

/**
 * Elimina o desactiva un platillo según su historial de ventas.
 * REGLA ESTRICTA DE INTEGRIDAD:
 * Si el platillo tiene órdenes en `orden_items`, NUNCA se borra físicamente
 * para evitar romper reportes o relaciones; en su lugar, se desactiva (disponible = false).
 * Si no tiene órdenes (borrador sin ventas), se eliminan sus recetas asociadas y el platillo.
 */
export async function eliminarPlatilloAction(id: string) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const platillo = await db.query.platillos.findFirst({
    where: and(eq(platillos.id, id), eq(platillos.restaurante_id, restauranteId)),
  });

  if (!platillo) {
    return { error: "Platillo no encontrado." };
  }

  // Verificar si tiene órdenes históricas
  const [ordenHistorica] = await db
    .select({ id: ordenItems.id })
    .from(ordenItems)
    .where(eq(ordenItems.platillo_id, id))
    .limit(1);

  if (ordenHistorica) {
    // Protección de integridad: no borrar físicamente, desactivar
    await db
      .update(platillos)
      .set({ disponible: false })
      .where(and(eq(platillos.id, id), eq(platillos.restaurante_id, restauranteId)));

    await db.insert(logAuditoria).values({
      restaurante_id: restauranteId,
      usuario_id: usuario.id,
      accion: "INTENTO_BORRADO_CON_VENTAS_AUTO_DESACTIVADO",
      tabla_afectada: "platillos",
      registro_id: id,
      valores_anteriores: { disponible: platillo.disponible },
      valores_nuevos: { disponible: false, motivo: "Tiene ventas históricas; no se permite borrado físico" },
    });

    revalidatePath("/menu/administrar");
    return {
      success: true,
      desactivado: true,
      mensaje:
        "Este platillo cuenta con ventas y órdenes históricas. Por integridad contable y de reportes no puede eliminarse físicamente, pero ha sido desactivado del menú.",
    };
  }

  // Platillo sin ventas: eliminar de recetas primero y luego de platillos
  await db.transaction(async (tx) => {
    await tx.delete(recetas).where(eq(recetas.platillo_id, id));
    await tx
      .delete(platillos)
      .where(and(eq(platillos.id, id), eq(platillos.restaurante_id, restauranteId)));

    await tx.insert(logAuditoria).values({
      restaurante_id: restauranteId,
      usuario_id: usuario.id,
      accion: "ELIMINACION_PLATILLO_SIN_VENTAS",
      tabla_afectada: "platillos",
      registro_id: id,
      valores_anteriores: { nombre: platillo.nombre, precio: platillo.precio },
    });
  });

  revalidatePath("/menu/administrar");
  return { success: true, eliminado: true, mensaje: "Platillo eliminado correctamente." };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECETAS (DESCUENTO DE INVENTARIO)
// ─────────────────────────────────────────────────────────────────────────────

export interface RecetaItemInput {
  ingredienteId: string;
  cantidadRequerida: number;
}

export async function obtenerRecetaPlatilloAction(platilloId: string) {
  const { restauranteId } = await validarSupervisorMenu();

  const plat = await db.query.platillos.findFirst({
    where: and(eq(platillos.id, platilloId), eq(platillos.restaurante_id, restauranteId)),
  });

  if (!plat) {
    return { error: "Platillo no encontrado." };
  }

  const items = await db
    .select({
      id: recetas.id,
      platillo_id: recetas.platillo_id,
      ingrediente_id: recetas.ingrediente_id,
      cantidad_requerida: recetas.cantidad_requerida,
      ingrediente_nombre: ingredientes.nombre,
      unidad_medida: ingredientes.unidad_medida,
      costo_unitario: ingredientes.costo_unitario,
      stock_actual: ingredientes.stock_actual,
    })
    .from(recetas)
    .innerJoin(ingredientes, eq(ingredientes.id, recetas.ingrediente_id))
    .where(eq(recetas.platillo_id, platilloId));

  const costoTotalReceta = items.reduce((acc, curr) => {
    const cant = Number(curr.cantidad_requerida) || 0;
    const costo = Number(curr.costo_unitario) || 0;
    return acc + cant * costo;
  }, 0);

  return {
    platillo: plat,
    receta: items,
    costoTotalReceta: Number(costoTotalReceta.toFixed(2)),
  };
}

export async function guardarRecetaPlatilloAction(
  platilloId: string,
  items: RecetaItemInput[]
) {
  const { usuario, restauranteId } = await validarSupervisorMenu();

  const plat = await db.query.platillos.findFirst({
    where: and(eq(platillos.id, platilloId), eq(platillos.restaurante_id, restauranteId)),
  });

  if (!plat) {
    return { error: "Platillo no encontrado." };
  }

  // Validar items
  for (const item of items) {
    if (!item.ingredienteId) {
      return { error: "Cada línea de receta debe tener un ingrediente seleccionado." };
    }
    if (typeof item.cantidadRequerida !== "number" || item.cantidadRequerida <= 0) {
      return { error: "La cantidad requerida debe ser mayor a cero." };
    }
  }

  await db.transaction(async (tx) => {
    // 1. Limpiar receta anterior
    await tx.delete(recetas).where(eq(recetas.platillo_id, platilloId));

    // 2. Insertar nuevos ingredientes
    if (items.length > 0) {
      // Deduplicar por ingrediente_id si hubiera repetidos
      const itemsMap = new Map<string, number>();
      for (const item of items) {
        itemsMap.set(
          item.ingredienteId,
          (itemsMap.get(item.ingredienteId) || 0) + item.cantidadRequerida
        );
      }

      const rowsToInsert = Array.from(itemsMap.entries()).map(([ingId, cant]) => ({
        platillo_id: platilloId,
        ingrediente_id: ingId,
        cantidad_requerida: cant.toFixed(3),
      }));

      await tx.insert(recetas).values(rowsToInsert);
    }

    // 3. Auditoría
    await tx.insert(logAuditoria).values({
      restaurante_id: restauranteId,
      usuario_id: usuario.id,
      accion: "ACTUALIZACION_RECETA_PLATILLO",
      tabla_afectada: "recetas",
      registro_id: platilloId,
      valores_nuevos: {
        platillo_id: platilloId,
        total_ingredientes: items.length,
        items,
      },
    });
  });

  revalidatePath("/menu/administrar");
  return { success: true, mensaje: "Receta actualizada correctamente." };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBIDA DE FOTO A SUPABASE STORAGE (BUCKET 'menu-fotos' PÚBLICO)
// ─────────────────────────────────────────────────────────────────────────────

export async function subirFotoPlatilloAction(formData: FormData) {
  const { restauranteId } = await validarSupervisorMenu();

  const archivo = formData.get("foto") as File | null;
  if (!archivo || archivo.size === 0) {
    return { error: "No se proporcionó ningún archivo." };
  }

  if (archivo.size > 5 * 1024 * 1024) {
    return { error: "La imagen no puede exceder los 5MB." };
  }

  const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!tiposPermitidos.includes(archivo.type)) {
    return { error: "Formato no permitido. Solo se aceptan JPEG, PNG, WEBP o GIF." };
  }

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
  const nombreArchivo = `${restauranteId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${extension}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { error: "Configuración de Supabase Storage no disponible en el servidor." };
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const arrayBuffer = await archivo.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await adminClient.storage
    .from("menu-fotos")
    .upload(nombreArchivo, buffer, {
      contentType: archivo.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("[MenuFotos] Error subiendo imagen:", uploadError);
    return { error: "Error al subir la imagen a Supabase Storage: " + uploadError.message };
  }

  const { data: publicUrlData } = adminClient.storage
    .from("menu-fotos")
    .getPublicUrl(nombreArchivo);

  return {
    success: true,
    fotoUrl: publicUrlData.publicUrl,
  };
}

