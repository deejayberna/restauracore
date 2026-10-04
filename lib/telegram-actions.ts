"use server";

import { getProtectedLayoutData } from "./layout-queries";
import { tienePermisoPlan } from "./planes";
import {
  obtenerClientesTelegram,
  enviarMensajeRecuperacion,
} from "./telegram-clientes";
import { revalidatePath } from "next/cache";

export async function obtenerClientesTelegramAction(diasInactividad: number = 21) {
  const { restauranteActivo } = await getProtectedLayoutData();

  if (!tienePermisoPlan(restauranteActivo.plan, "telegram_recuperacion")) {
    return {
      error: "Esta función requiere el plan Enterprise.",
      bloqueadoPorPlan: true,
      clientes: [],
      total: 0,
      inactivos: 0,
      diasInactividad,
    };
  }

  const datos = await obtenerClientesTelegram(restauranteActivo.id, diasInactividad);
  return {
    ...datos,
    bloqueadoPorPlan: false,
  };
}

export async function enviarMensajeRecuperacionAction(clienteId: string, mensaje: string) {
  const { restauranteActivo, user } = await getProtectedLayoutData();

  if (!["dueno", "gerente"].includes(user.rol)) {
    return { ok: false, error: "No tienes permisos para enviar mensajes a clientes." };
  }

  if (!tienePermisoPlan(restauranteActivo.plan, "telegram_recuperacion")) {
    return { ok: false, error: "Esta función requiere el plan Enterprise." };
  }

  if (!mensaje.trim()) {
    return { ok: false, error: "El mensaje no puede estar vacío." };
  }

  const res = await enviarMensajeRecuperacion({
    restauranteId: restauranteActivo.id,
    clienteId,
    mensaje: mensaje.trim(),
  });

  if (res.ok) {
    revalidatePath("/reportes/clientes");
  }

  return res;
}

