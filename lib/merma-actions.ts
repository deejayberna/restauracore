"use server";

import { db } from "@/db";
import {
  alertasInventario,
  ingredientes,
  logAuditoria,
  movimientosInventario,
  restaurantes,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { enviarNotificacionAlerta, enviarNotificacionRoboSospechoso } from "./notificaciones";
import { obtenerDestinatariosRestaurante } from "./notificaciones-destinatarios";
import {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  STORAGE_BUCKET,
  mermaSchema,
  validarStockParaMerma,
  validarArchivoEvidencia,
  type MermaInput,
  type ValidacionArchivoResult,
  type ResultadoRegistroMerma,
} from "./merma-utils";

export type { MermaInput, ValidacionArchivoResult, ResultadoRegistroMerma };

/**
 * Helper interno para verificar el usuario activo y su vínculo en usuario_restaurantes.
 * Solo permite roles 'gerente' o 'dueno'.
 */
export async function obtenerUsuarioYRolSupervisor() {
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

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError(
      `Rol '${vinculo.rol}' no autorizado. Solo gerentes o dueños pueden registrar mermas.`
    );
  }

  return { usuario, vinculo, restaurante_id };
}

/**
 * Cliente de Supabase con service_role para operaciones administrativas del servidor
 * (ej. limpieza de archivos huérfanos cuando falla la transacción de BD).
 */
function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Elimina un archivo de Supabase Storage usando service_role (bypasea RLS).
 * Usado exclusivamente para limpiar archivos huérfanos ante fallos de transacción.
 */
async function eliminarArchivoHuerfano(filePath: string): Promise<void> {
  try {
    const admin = getSupabaseServiceClient();
    if (!admin) {
      console.warn("[Storage Cleanup] SUPABASE_SERVICE_ROLE_KEY no configurado para limpieza de huérfano:", filePath);
      return;
    }
    const { error } = await admin.storage.from(STORAGE_BUCKET).remove([filePath]);
    if (error) {
      console.error("[Storage Cleanup] Error al eliminar archivo huérfano:", error);
    } else {
      console.log("[Storage Cleanup] Archivo huérfano eliminado exitosamente:", filePath);
    }
  } catch (err) {
    console.error("[Storage Cleanup] Excepción eliminando archivo huérfano:", err);
  }
}

/**
 * Genera una URL firmada temporal con expiración de 1 hora (3600 segundos) para visualizar la foto.
 * NUNCA se guarda una URL permanente en BD — se genera bajo demanda.
 */
export async function obtenerUrlFirmadaMerma(fotoPath: string): Promise<string | null> {
  if (!fotoPath) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(fotoPath, 3600); // 1 hora de expiración

    if (error || !data?.signedUrl) {
      // Intentar con service_role si el cliente regular no puede generar la url
      const admin = getSupabaseServiceClient();
      if (admin) {
        const { data: adminData } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(fotoPath, 3600);
        return adminData?.signedUrl ?? null;
      }
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error("[Merma Signed URL] Error al generar URL firmada:", err);
    return null;
  }
}

/**
 * Obtiene los ingredientes disponibles del restaurante activo para el formulario de captura.
 */
export async function obtenerIngredientesParaMerma() {
  const { restaurante_id } = await obtenerUsuarioYRolSupervisor();

  return await db.query.ingredientes.findMany({
    where: eq(ingredientes.restaurante_id, restaurante_id),
    columns: {
      id: true,
      nombre: true,
      unidad_medida: true,
      stock_actual: true,
      stock_minimo: true,
      costo_unitario: true,
    },
    orderBy: (ing, { asc }) => [asc(ing.nombre)],
  });
}

/**
 * Helper exportado para la alerta anti-robo.
 * Decide si el motivo requiere alerta inmediata y la dispara.
 * Si la notificación falla:
 * 1. Logea el error de forma explícita en consola con el tag [FALLO_ENVIO_ALERTA_ROBO].
 * 2. Si se proporciona contexto de auditoría (restaurante_id y usuario_id), asienta
 *    inmediatamente un registro inmutable en log_auditoria con acción 'FALLO_ENVIO_ALERTA_ROBO'.
 * De este modo, un fallo de entrega jamás pasa desapercibido ni queda en silencio.
 */
export async function dispararAlertaRoboSiAplica(
  motivo: string,
  payload: Parameters<typeof enviarNotificacionRoboSospechoso>[0],
  contextoAuditoria?: {
    restaurante_id: string;
    usuario_id: string;
  }
): Promise<{ disparada: boolean; enviada?: boolean; error?: string }> {
  if (motivo.toLowerCase() !== "robo sospechado") {
    return { disparada: false };
  }

  try {
    await enviarNotificacionRoboSospechoso(payload);
    return { disparada: true, enviada: true };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[FALLO_ENVIO_ALERTA_ROBO] No se pudo entregar la alerta de robo para movimiento ${payload.movimiento_id}:`,
      errorMsg
    );

    // Registro inmutable de auditoría para evitar fallos silenciosos
    if (contextoAuditoria?.restaurante_id && contextoAuditoria?.usuario_id) {
      try {
        await db.insert(logAuditoria).values({
          restaurante_id: contextoAuditoria.restaurante_id,
          usuario_id: contextoAuditoria.usuario_id,
          accion: "FALLO_ENVIO_ALERTA_ROBO",
          tabla_afectada: "movimientos_inventario",
          registro_id: payload.movimiento_id,
          valores_anteriores: null,
          valores_nuevos: {
            ingrediente: payload.ingrediente,
            cantidad: payload.cantidad,
            unidad: payload.unidad,
            motivo,
            registrado_por_email: payload.registrado_por_email,
            registrado_por_rol: payload.registrado_por_rol,
            error: errorMsg,
            fallo_en: "alerta_inmediata_multicanal",
          },
        });
      } catch (auditErr) {
        console.error(
          "[FALLO_AUDITORIA_CRITICO] Error catastrófico al asentar FALLO_ENVIO_ALERTA_ROBO en log_auditoria:",
          auditErr
        );
      }
    }

    return { disparada: true, enviada: false, error: errorMsg };
  }
}

/**
 * ACCIÓN PRINCIPAL (Fase 6.3):
 * Registra una merma de inventario con evidencia fotográfica opcional en Storage.
 * Transacción atómica en Drizzle con rollback y limpieza garantizada de archivo huérfano.
 */
export async function registrarMermaAction(formData: FormData): Promise<ResultadoRegistroMerma> {
  const { usuario, vinculo, restaurante_id } = await obtenerUsuarioYRolSupervisor();

  // 1. Extraer y validar campos base
  const ingrediente_id = formData.get("ingrediente_id") as string;
  const cantidadRaw = parseFloat(formData.get("cantidad") as string);
  const motivo = ((formData.get("motivo") as string) ?? "").trim();
  const archivoFoto = formData.get("foto") as File | null;

  const validacionZod = mermaSchema.safeParse({
    ingrediente_id,
    cantidad: cantidadRaw,
    motivo,
  });

  if (!validacionZod.success) {
    const primerError = validacionZod.error.issues[0]?.message ?? "Datos de merma inválidos";
    return { ok: false, error: primerError, codigo: "VALIDATION_ERROR" };
  }

  const { cantidad } = validacionZod.data;

  // 2. Validar archivo de foto (si se incluyó)
  const validacionFoto = validarArchivoEvidencia(
    archivoFoto && archivoFoto.size > 0
      ? { size: archivoFoto.size, type: archivoFoto.type, name: archivoFoto.name }
      : null
  );

  if (!validacionFoto.valido) {
    return { ok: false, error: validacionFoto.error, codigo: "INVALID_FILE" };
  }

  // 3. Consultar y verificar el ingrediente en la base de datos
  const ingrediente = await db.query.ingredientes.findFirst({
    where: and(
      eq(ingredientes.id, ingrediente_id),
      eq(ingredientes.restaurante_id, restaurante_id)
    ),
  });

  if (!ingrediente) {
    return {
      ok: false,
      error: "El ingrediente especificado no existe o no pertenece a tu restaurante activo.",
      codigo: "INGREDIENT_NOT_FOUND",
    };
  }

  const stockActualNum = parseFloat(ingrediente.stock_actual);
  const stockMinimoNum = parseFloat(ingrediente.stock_minimo);

  // 4. Validar que la cantidad no exceda el stock_actual disponible
  const stockCheck = validarStockParaMerma(cantidad, stockActualNum);
  if (!stockCheck.valido) {
    return {
      ok: false,
      error: stockCheck.error,
      codigo: "INSUFFICIENT_STOCK",
    };
  }

  // 5. Subir la imagen a Supabase Storage (si se adjuntó)
  let fotoPath: string | null = null;
  const tieneFoto = archivoFoto && archivoFoto.size > 0;

  if (tieneFoto) {
    const extension = validacionFoto.extension ?? "jpg";
    const fileId = crypto.randomUUID();
    // Path estructurado multi-tenant: {restaurante_id}/{uuid}.{ext}
    fotoPath = `${restaurante_id}/${fileId}.${extension}`;

    const supabase = await createSupabaseServerClient();
    const arrayBuffer = await archivoFoto.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fotoPath, buffer, {
        contentType: archivoFoto.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[Storage Upload Error]:", uploadError);
      return {
        ok: false,
        error: `Error al subir la evidencia fotográfica a Storage: ${uploadError.message}`,
        codigo: "STORAGE_UPLOAD_ERROR",
      };
    }
  }

  // 6. Transacción Atómica en Drizzle (todo o nada) con prevención de condición de carrera
  let nuevoMovimientoId: string;
  let nuevoStockFinal: number;

  try {
    const resTx = await db.transaction(async (tx) => {
      // a. Descontar del stock atómicamente a nivel de base de datos:
      // UPDATE ingredientes
      // SET stock_actual = stock_actual - $cantidad, actualizado_en = now()
      // WHERE id = $ingrediente_id AND restaurante_id = $restaurante_id AND stock_actual >= $cantidad
      // RETURNING *
      const [ingredienteActualizado] = await tx
        .update(ingredientes)
        .set({
          stock_actual: sql`${ingredientes.stock_actual} - ${cantidad}::decimal`,
          actualizado_en: new Date(),
        })
        .where(
          and(
            eq(ingredientes.id, ingrediente_id),
            eq(ingredientes.restaurante_id, restaurante_id),
            sql`${ingredientes.stock_actual} >= ${cantidad}::decimal`
          )
        )
        .returning();

      // b. SI 0 FILAS AFECTADAS (rowCount === 0):
      // El stock fue consumido concurrentemente por otra orden o merma entre el SELECT previo y este UPDATE
      if (!ingredienteActualizado) {
        throw new Error("STOCK_INSUFICIENTE_CONCURRENTE");
      }

      const nuevoStockNum = parseFloat(ingredienteActualizado.stock_actual);

      // c. Insertar registro en movimientos_inventario
      // Solo guardamos el foto_path interno, NUNCA una URL permanente
      const [mov] = await tx
        .insert(movimientosInventario)
        .values({
          ingrediente_id,
          tipo: "merma",
          cantidad: (-Math.abs(cantidad)).toFixed(3),
          motivo,
          foto_path: fotoPath,
          creado_por: usuario.id,
        })
        .returning({ id: movimientosInventario.id });

      // d. Registrar en log_auditoria (inmutable append-only)
      await tx.insert(logAuditoria).values({
        restaurante_id,
        usuario_id: usuario.id,
        accion: "REGISTRO_MERMA",
        tabla_afectada: "movimientos_inventario",
        registro_id: mov.id,
        valores_anteriores: {
          ingrediente: ingrediente.nombre,
          stock_actual: stockActualNum,
        },
        valores_nuevos: {
          ingrediente: ingrediente.nombre,
          cantidad_mermada: cantidad,
          nuevo_stock: nuevoStockNum,
          motivo,
          foto_path: fotoPath,
          registrado_por_rol: vinculo.rol,
        },
      });

      // e. Si el nuevo stock queda por debajo del mínimo, registrar alerta
      if (nuevoStockNum <= stockMinimoNum) {
        const nivelAlerta = nuevoStockNum <= 0 ? "critico" : "bajo";
        await tx.insert(alertasInventario).values({
          restaurante_id,
          ingrediente_id,
          nivel: nivelAlerta,
          atendida: false,
        });
      }

      return {
        movimiento_id: mov.id,
        nuevo_stock: nuevoStockNum,
      };
    });

    nuevoMovimientoId = resTx.movimiento_id;
    nuevoStockFinal = resTx.nuevo_stock;
  } catch (err: any) {
    // Si la transacción en BD falla y se había subido un archivo a Storage,
    // eliminar el archivo huérfano con service_role (limpieza segura del servidor)
    if (fotoPath) {
      await eliminarArchivoHuerfano(fotoPath);
    }

    if (err.message === "STOCK_INSUFICIENTE_CONCURRENTE") {
      // Registrar intento anómalo por condición de carrera en log_auditoria
      await db.insert(logAuditoria).values({
        restaurante_id,
        usuario_id: usuario.id,
        accion: "ANOMALIA_INTENTO_MERMA_STOCK_INSUFICIENTE",
        tabla_afectada: "ingredientes",
        registro_id: ingrediente_id,
        valores_anteriores: { stock_leido_inicial: stockActualNum },
        valores_nuevos: {
          cantidad_intentada: cantidad,
          motivo:
            "Condición de carrera prevenida atómicamente (0 filas afectadas): el stock disponible cambió concurrentemente y ya no es suficiente.",
        },
      });

      return {
        ok: false,
        error:
          "Conflicto de concurrencia: el stock disponible cambió durante la operación y ya no es suficiente para cubrir la merma solicitada.",
        codigo: "CONCURRENCY_STOCK_ERROR",
      };
    }

    console.error("[Transacción Merma Error]:", err);
    return {
      ok: false,
      error: `Error al registrar la merma en la base de datos: ${err.message ?? "Error interno"}`,
      codigo: "DB_TRANSACTION_ERROR",
    };
  }

  // 7. Notificación asíncrona fuera de la transacción si se generó alerta
  if (nuevoStockFinal <= stockMinimoNum) {
    const datosRestaurante = await db.query.restaurantes.findFirst({
      where: eq(restaurantes.id, restaurante_id),
    });

    enviarNotificacionAlerta({
      ingrediente: ingrediente.nombre,
      nivel: nuevoStockFinal <= 0 ? "critico" : "bajo",
      stock_actual: nuevoStockFinal.toFixed(3),
      stock_minimo: stockMinimoNum.toFixed(3),
      unidad: ingrediente.unidad_medida,
      restaurante: datosRestaurante?.nombre ?? "Restaurante",
      destinatario_email: usuario.email,
    }).catch((notifErr) => {
      console.warn("[Notificación Merma Warning]:", notifErr);
    });
  }

  // 8. Alerta inmediata anti-robo — fuera de la transacción, tras commit exitoso
  if (motivo.toLowerCase() === "robo sospechado") {
    const destinatarios = await obtenerDestinatariosRestaurante(restaurante_id);

    dispararAlertaRoboSiAplica(
      motivo,
      {
        restaurante: destinatarios.restaurante_nombre || restaurante_id,
        ingrediente: ingrediente.nombre,
        cantidad,
        unidad: ingrediente.unidad_medida,
        registrado_por_nombre: usuario.nombre,
        registrado_por_email: usuario.email,
        registrado_por_rol: vinculo.rol,
        movimiento_id: nuevoMovimientoId,
        chat_id: destinatarios.chat_id,
        destinatario_email: destinatarios.emails,
      },
      {
        restaurante_id,
        usuario_id: usuario.id,
      }
    ).catch((unhandledErr) => {
      console.error("[dispararAlertaRoboSiAplica Unhandled Error]:", unhandledErr);
    });
  }

  return {
    ok: true,
    movimiento_id: nuevoMovimientoId,
    foto_path: fotoPath,
    stock_anterior: stockActualNum,
    stock_restante: nuevoStockFinal,
  };
}

