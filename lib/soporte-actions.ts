"use server";

import { db } from "@/db";
import { ticketsSoporte, usuarios, usuarioRestaurantes, restaurantes } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { notificarNuevoTicketSoporte } from "@/lib/notificaciones";

async function obtenerSesionSoporte() {
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

  if (vinculo.rol !== "gerente" && vinculo.rol !== "dueno") {
    throw new UnauthorizedError("Solo gerentes y dueños pueden gestionar soporte.");
  }

  const rest = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restaurante_id),
  });

  return {
    usuario,
    vinculo,
    restaurante_id,
    restaurante_nombre: rest?.nombre ?? "Restaurante",
  };
}

export async function crearTicketSoporteAction(input: {
  asunto: string;
  mensaje: string;
}) {
  const { usuario, restaurante_id, restaurante_nombre } = await obtenerSesionSoporte();

  const asunto = input.asunto?.trim();
  const mensaje = input.mensaje?.trim();

  if (!asunto || asunto.length < 4) {
    throw new Error("El asunto debe tener al menos 4 caracteres.");
  }

  if (!mensaje || mensaje.length < 8) {
    throw new Error("Por favor describe con más detalle tu solicitud (mínimo 8 caracteres).");
  }

  const [ticket] = await db
    .insert(ticketsSoporte)
    .values({
      restaurante_id,
      usuario_id: usuario.id,
      asunto,
      mensaje,
      estado: "abierto",
    })
    .returning();

  // Despachar notificación al dueño del SaaS (no bloquea al usuario)
  notificarNuevoTicketSoporte({
    ticketId: ticket.id,
    restaurante: restaurante_nombre,
    usuarioNombre: usuario.nombre,
    usuarioEmail: usuario.email,
    asunto: ticket.asunto,
    mensaje: ticket.mensaje,
  }).catch((err) => {
    console.error("[Soporte] Error al notificar nuevo ticket:", err);
  });

  revalidatePath("/soporte");
  return { success: true, ticketId: ticket.id };
}

export async function obtenerTicketsRestauranteAction() {
  const { restaurante_id } = await obtenerSesionSoporte();

  const tickets = await db
    .select()
    .from(ticketsSoporte)
    .where(eq(ticketsSoporte.restaurante_id, restaurante_id))
    .orderBy(desc(ticketsSoporte.creado_en));

  return tickets;
}

