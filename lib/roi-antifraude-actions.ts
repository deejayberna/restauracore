"use server";

import { db } from "@/db";
import {
  ingredientes,
  logAuditoria,
  movimientosInventario,
  turnos,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

async function obtenerSesionDuenoEstricta() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError("Sesión no iniciada.");
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) {
    throw new UnauthorizedError("Usuario no encontrado en la base de datos.");
  }

  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) {
    throw new UnauthorizedError("No hay un restaurante activo seleccionado.");
  }

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  // Guard estricto: la confirmación manual de "robo real / error humano" es EXCLUSIVA del dueño
  if (!vinculo || vinculo.rol !== "dueno") {
    throw new UnauthorizedError(
      "Permiso denegado: solo el dueño del restaurante tiene autorización para clasificar o confirmar el resultado de discrepancias y alertas de robo."
    );
  }

  return { usuario, vinculo, restaurante_id };
}

export interface ConfirmarIncidenciaParams {
  tipo: "turno" | "merma";
  registroId: string;
  resultado: "robo_real" | "error_humano";
  notas?: string;
}

/**
 * Permite al dueño del restaurante certificar manualmente si una discrepancia de caja
 * o merma / alerta de robo correspondió a un "robo real" o a un "error humano".
 *
 * Registra una pista inmutable en log_auditoria con acción 'CONFIRMACION_RESULTADO_INCIDENCIA'.
 */
export async function confirmarResultadoIncidenciaAction(
  params: ConfirmarIncidenciaParams
): Promise<{ ok: boolean; mensaje: string; montoConfirmado: number }> {
  const { tipo, registroId, resultado, notas } = params;

  if (!tipo || !registroId || !resultado) {
    throw new ValidationError("Faltan parámetros obligatorios para confirmar la incidencia.");
  }

  if (resultado !== "robo_real" && resultado !== "error_humano") {
    throw new ValidationError("El resultado debe ser 'robo_real' o 'error_humano'.");
  }

  const { usuario, restaurante_id } = await obtenerSesionDuenoEstricta();

  let montoConfirmado = 0;
  let metadataExtra: Record<string, any> = {};

  if (tipo === "turno") {
    const turno = await db.query.turnos.findFirst({
      where: and(eq(turnos.id, registroId), eq(turnos.restaurante_id, restaurante_id)),
    });

    if (!turno) {
      throw new NotFoundError("Turno de caja");
    }

    const difObj = (turno.diferencias as any) ?? {};
    const diffTotalRaw = difObj?.total?.diferencia ?? difObj?.total;
    const diffTotal = typeof diffTotalRaw === "number" ? diffTotalRaw : parseFloat(diffTotalRaw ?? "0");
    montoConfirmado = Math.abs(diffTotal);

    metadataExtra = {
      codigo_turno: turno.codigo,
      fecha_cierre: turno.fecha_cierre,
      diferencia_original: diffTotal,
    };
  } else if (tipo === "merma") {
    const [merma] = await db
      .select({
        id: movimientosInventario.id,
        cantidad: movimientosInventario.cantidad,
        motivo: movimientosInventario.motivo,
        revision_pendiente: movimientosInventario.revision_pendiente,
        costo_unitario: ingredientes.costo_unitario,
        ingrediente_nombre: ingredientes.nombre,
      })
      .from(movimientosInventario)
      .innerJoin(ingredientes, eq(ingredientes.id, movimientosInventario.ingrediente_id))
      .where(
        and(
          eq(movimientosInventario.id, registroId),
          eq(ingredientes.restaurante_id, restaurante_id)
        )
      )
      .limit(1);

    if (!merma) {
      throw new NotFoundError("Movimiento de merma");
    }

    const cantAbs = Math.abs(parseFloat(merma.cantidad));
    const costoUnit = parseFloat(merma.costo_unitario);
    montoConfirmado = Number((cantAbs * costoUnit).toFixed(2));

    metadataExtra = {
      ingrediente: merma.ingrediente_nombre,
      cantidad: cantAbs,
      costo_unitario: costoUnit,
      motivo_original: merma.motivo,
    };

    // Si aún estaba con revisión pendiente, resolverla formalmente
    if (merma.revision_pendiente) {
      await db
        .update(movimientosInventario)
        .set({ revision_pendiente: false })
        .where(eq(movimientosInventario.id, registroId));
    }
  } else {
    throw new ValidationError("Tipo de incidencia no reconocido.");
  }

  // Asentar en log_auditoria de forma inmutable
  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: usuario.id,
    accion: "CONFIRMACION_RESULTADO_INCIDENCIA",
    tabla_afectada: tipo === "turno" ? "turnos" : "movimientos_inventario",
    registro_id: registroId,
    valores_anteriores: null,
    valores_nuevos: {
      tipo_evento: tipo,
      resultado,
      monto: montoConfirmado,
      notas: (notas ?? "").trim(),
      confirmado_por_nombre: usuario.nombre,
      confirmado_por_email: usuario.email,
      confirmado_en: new Date().toISOString(),
      ...metadataExtra,
    },
  });

  revalidatePath("/home");
  revalidatePath("/dashboard");

  const etiquetaResultado = resultado === "robo_real" ? "Robo confirmado" : "Error humano confirmado";
  return {
    ok: true,
    mensaje: `Incidencia registrada como '${etiquetaResultado}'.`,
    montoConfirmado,
  };
}
