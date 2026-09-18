"use server";

import { db } from "@/db";
import { usuarios, usuarioRestaurantes, logAuditoria, rolEnum } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";
import { z, validateOrThrow } from "@/lib/validation";

export type RolTipo = "mesero" | "cajero" | "chef" | "gerente" | "dueno";

async function obtenerSesionYRolActivo() {
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

  return { usuario, vinculo, restaurante_id };
}

/**
 * Lista todo el personal vinculado a la sucursal activa.
 * Disponible para 'gerente' y 'dueno'.
 */
export async function listarPersonalRestauranteAction() {
  const { vinculo, restaurante_id } = await obtenerSesionYRolActivo();

  if (!["gerente", "dueno"].includes(vinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden consultar el personal");
  }

  const lista = await db
    .select({
      id: usuarioRestaurantes.id,
      usuario_id: usuarios.id,
      nombre: usuarios.nombre,
      email: usuarios.email,
      rol: usuarioRestaurantes.rol,
      activo: usuarioRestaurantes.activo,
      invitacion_pendiente: usuarioRestaurantes.invitacion_pendiente,
      creado_en: usuarioRestaurantes.creado_en,
    })
    .from(usuarioRestaurantes)
    .innerJoin(usuarios, eq(usuarios.id, usuarioRestaurantes.usuario_id))
    .where(eq(usuarioRestaurantes.restaurante_id, restaurante_id))
    .orderBy(desc(usuarioRestaurantes.creado_en));

  return lista;
}

const invitarPersonalSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Correo electrónico inválido"),
  rol: z.enum(["mesero", "cajero", "chef", "gerente", "dueno"]),
});

/**
 * Invita un nuevo empleado al restaurante mediante Supabase Auth oficial.
 * El administrador NUNCA conoce ni asigna contraseñas.
 */
export async function invitarPersonalAction(input: {
  nombre: string;
  email: string;
  rol: RolTipo;
}) {
  const { usuario: adminUsuario, vinculo: adminVinculo, restaurante_id } =
    await obtenerSesionYRolActivo();

  if (!["gerente", "dueno"].includes(adminVinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden invitar personal");
  }

  const validado = validateOrThrow(invitarPersonalSchema, input);

  // Jerarquía estricta: un Gerente NO puede asignar rol dueño ni gerente
  if (adminVinculo.rol === "gerente" && ["dueno", "gerente"].includes(validado.rol)) {
    throw new UnauthorizedError(
      "Un gerente no tiene permisos para asignar roles de Gerente o Dueño. Solo el Dueño puede hacerlo."
    );
  }

  const emailLower = validado.email.toLowerCase().trim();

  // 1. Verificar si ya existe en la tabla usuarios de nuestra base de datos
  const usuarioExistente = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, emailLower),
  });

  if (usuarioExistente) {
    // Verificar si ya tiene vínculo con este restaurante
    const vinculoExistente = await db.query.usuarioRestaurantes.findFirst({
      where: and(
        eq(usuarioRestaurantes.usuario_id, usuarioExistente.id),
        eq(usuarioRestaurantes.restaurante_id, restaurante_id)
      ),
    });

    if (vinculoExistente) {
      if (vinculoExistente.activo) {
        throw new Error("El usuario ya es parte activa del personal de este restaurante.");
      } else {
        // Reactivación con el nuevo rol
        await db
          .update(usuarioRestaurantes)
          .set({
            activo: true,
            rol: validado.rol,
            invitacion_pendiente: false,
          })
          .where(eq(usuarioRestaurantes.id, vinculoExistente.id));

        await db.insert(logAuditoria).values({
          restaurante_id,
          usuario_id: adminUsuario.id,
          accion: "ESTADO_PERSONAL_MODIFICADO",
          tabla_afectada: "usuario_restaurantes",
          registro_id: vinculoExistente.id,
          valores_anteriores: { activo: false, rol: vinculoExistente.rol },
          valores_nuevos: {
            activo: true,
            rol: validado.rol,
            motivo: "Reactivación por invitación",
          },
        });

        return { ok: true, mensaje: "Empleado reactivado exitosamente.", usuario_id: usuarioExistente.id };
      }
    }

    // Usuario existente sin vínculo con esta sucursal: lo vinculamos
    const [nuevoVinculo] = await db
      .insert(usuarioRestaurantes)
      .values({
        usuario_id: usuarioExistente.id,
        restaurante_id,
        rol: validado.rol,
        activo: true,
        invitacion_pendiente: false,
      })
      .returning();

    await db.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: adminUsuario.id,
      accion: "INVITACION_PERSONAL",
      tabla_afectada: "usuario_restaurantes",
      registro_id: nuevoVinculo.id,
      valores_anteriores: null,
      valores_nuevos: {
        usuario_id: usuarioExistente.id,
        nombre: usuarioExistente.nombre,
        email: emailLower,
        rol: validado.rol,
        ya_registrado: true,
      },
    });

    return {
      ok: true,
      mensaje: "Usuario vinculado a la sucursal con éxito.",
      usuario_id: usuarioExistente.id,
    };
  }

  // 2. Usuario NO existe en el sistema: invitar vía Supabase Auth Admin oficial
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(emailLower, {
      data: {
        nombre: validado.nombre,
        rol: validado.rol,
      },
    });

  if (inviteError) {
    throw new Error(`Error al enviar invitación por correo: ${inviteError.message}`);
  }

  const authUserId = inviteData.user.id;

  // Insertar usuario en base de datos local
  const [nuevoUsuario] = await db
    .insert(usuarios)
    .values({
      auth_id: authUserId,
      nombre: validado.nombre,
      email: emailLower,
      activo: true,
    })
    .returning();

  // Insertar vínculo con flag invitacion_pendiente: true
  const [nuevoVinculo] = await db
    .insert(usuarioRestaurantes)
    .values({
      usuario_id: nuevoUsuario.id,
      restaurante_id,
      rol: validado.rol,
      activo: true,
      invitacion_pendiente: true,
    })
    .returning();

  // Asentar auditoría
  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: adminUsuario.id,
    accion: "INVITACION_PERSONAL",
    tabla_afectada: "usuario_restaurantes",
    registro_id: nuevoVinculo.id,
    valores_anteriores: null,
    valores_nuevos: {
      usuario_id: nuevoUsuario.id,
      nombre: validado.nombre,
      email: emailLower,
      rol: validado.rol,
      invitacion_pendiente: true,
      auth_id: authUserId,
    },
  });

  return {
    ok: true,
    mensaje: `Invitación enviada exitosamente a ${emailLower}.`,
    usuario_id: nuevoUsuario.id,
  };
}

/**
 * Modifica el rol de un empleado dentro del restaurante.
 * Aplica reglas estrictas de jerarquía.
 */
export async function cambiarRolPersonalAction(input: {
  usuario_id: string;
  nuevo_rol: RolTipo;
}) {
  const { usuario: adminUsuario, vinculo: adminVinculo, restaurante_id } =
    await obtenerSesionYRolActivo();

  if (!["gerente", "dueno"].includes(adminVinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden cambiar roles");
  }

  // 1. Obtener el vínculo objetivo
  const vinculoObjetivo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, input.usuario_id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id)
    ),
  });

  if (!vinculoObjetivo) {
    throw new Error("El empleado no pertenece a este restaurante.");
  }

  // 2. Jerarquía de Gerente
  if (adminVinculo.rol === "gerente") {
    // No puede ascender a dueño ni gerente
    if (["dueno", "gerente"].includes(input.nuevo_rol)) {
      throw new UnauthorizedError(
        "Un gerente no puede asignar roles de Gerente o Dueño. Solo el Dueño puede hacerlo."
      );
    }
    // No puede modificar el rol de un Dueño o Gerente existente
    if (["dueno", "gerente"].includes(vinculoObjetivo.rol)) {
      throw new UnauthorizedError(
        "Un gerente no puede modificar los roles de Gerentes o Dueños existentes."
      );
    }
  }

  // 3. Protección de último dueño: si se degrada a un Dueño, asegurar que quede al menos otro Dueño activo
  if (vinculoObjetivo.rol === "dueno" && input.nuevo_rol !== "dueno") {
    const [conteoDuenos] = await db
      .select({ total: count() })
      .from(usuarioRestaurantes)
      .where(
        and(
          eq(usuarioRestaurantes.restaurante_id, restaurante_id),
          eq(usuarioRestaurantes.rol, "dueno"),
          eq(usuarioRestaurantes.activo, true)
        )
      );

    if (conteoDuenos.total <= 1) {
      throw new Error(
        "Operación bloqueada: El restaurante no puede quedarse sin un Dueño activo."
      );
    }
  }

  // 4. Actualizar rol
  await db
    .update(usuarioRestaurantes)
    .set({ rol: input.nuevo_rol })
    .where(eq(usuarioRestaurantes.id, vinculoObjetivo.id));

  // 5. Auditoría
  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: adminUsuario.id,
    accion: "CAMBIO_ROL_PERSONAL",
    tabla_afectada: "usuario_restaurantes",
    registro_id: vinculoObjetivo.id,
    valores_anteriores: { rol: vinculoObjetivo.rol },
    valores_nuevos: { rol: input.nuevo_rol, cambiado_por: adminUsuario.id },
  });

  return { ok: true, mensaje: "Rol actualizado exitosamente." };
}

/**
 * Activa o desactiva a un empleado de la sucursal activa.
 */
export async function alternarEstadoPersonalAction(input: {
  usuario_id: string;
  activo: boolean;
}) {
  const { usuario: adminUsuario, vinculo: adminVinculo, restaurante_id } =
    await obtenerSesionYRolActivo();

  if (!["gerente", "dueno"].includes(adminVinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden cambiar el estado del personal");
  }

  // Evitar auto-desactivación del propio administrador
  if (input.usuario_id === adminUsuario.id) {
    throw new Error("No puedes desactivar tu propia cuenta en la sucursal.");
  }

  const vinculoObjetivo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, input.usuario_id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id)
    ),
  });

  if (!vinculoObjetivo) {
    throw new Error("El empleado no pertenece a este restaurante.");
  }

  // Gerente no puede desactivar a un dueño o gerente
  if (adminVinculo.rol === "gerente" && ["dueno", "gerente"].includes(vinculoObjetivo.rol)) {
    throw new UnauthorizedError("Un gerente no puede desactivar a otros gerentes o al dueño.");
  }

  // Protección si se desactiva a un dueño
  if (vinculoObjetivo.rol === "dueno" && !input.activo) {
    const [conteoDuenos] = await db
      .select({ total: count() })
      .from(usuarioRestaurantes)
      .where(
        and(
          eq(usuarioRestaurantes.restaurante_id, restaurante_id),
          eq(usuarioRestaurantes.rol, "dueno"),
          eq(usuarioRestaurantes.activo, true)
        )
      );

    if (conteoDuenos.total <= 1) {
      throw new Error("Operación bloqueada: No se puede desactivar al único Dueño del restaurante.");
    }
  }

  await db
    .update(usuarioRestaurantes)
    .set({ activo: input.activo })
    .where(eq(usuarioRestaurantes.id, vinculoObjetivo.id));

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: adminUsuario.id,
    accion: "ESTADO_PERSONAL_MODIFICADO",
    tabla_afectada: "usuario_restaurantes",
    registro_id: vinculoObjetivo.id,
    valores_anteriores: { activo: vinculoObjetivo.activo },
    valores_nuevos: { activo: input.activo, cambiado_por: adminUsuario.id },
  });

  return {
    ok: true,
    mensaje: input.activo ? "Empleado activado exitosamente." : "Empleado desactivado exitosamente.",
  };
}

/**
 * Reenvía la invitación por correo a un empleado con invitación pendiente.
 */
export async function reenviarInvitacionAction(email: string) {
  const { usuario: adminUsuario, vinculo: adminVinculo, restaurante_id } =
    await obtenerSesionYRolActivo();

  if (!["gerente", "dueno"].includes(adminVinculo.rol)) {
    throw new UnauthorizedError("Solo el gerente o dueño pueden reenviar invitaciones");
  }

  const emailLower = email.toLowerCase().trim();
  const usuarioExistente = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, emailLower),
  });

  if (!usuarioExistente) {
    throw new Error("Usuario no encontrado.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(emailLower, {
    data: { nombre: usuarioExistente.nombre },
  });

  if (error) {
    throw new Error(`Error al reenviar invitación: ${error.message}`);
  }

  await db.insert(logAuditoria).values({
    restaurante_id,
    usuario_id: adminUsuario.id,
    accion: "REENVIO_INVITACION_PERSONAL",
    tabla_afectada: "usuarios",
    registro_id: usuarioExistente.id,
    valores_anteriores: null,
    valores_nuevos: { email: emailLower, reenviado_por: adminUsuario.id },
  });

  return { ok: true, mensaje: `Invitación reenviada a ${emailLower}.` };
}

