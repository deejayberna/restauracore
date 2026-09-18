"use server";

import { db } from "@/db";
import {
  registrosPendientes,
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  logAuditoria,
} from "@/db/schema";
import type { Plan } from "@/lib/planes";
import { eq } from "drizzle-orm";
import { getStripeClient, STRIPE_PRICES } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { z } from "zod";
import * as crypto from "crypto";
import { cookies } from "next/headers";

const RegistroSchema = z.object({
  nombreRestaurante: z.string().min(2, "El nombre del restaurante debe tener al menos 2 caracteres"),
  direccion: z.string().optional(),
  timezone: z.string().default("America/Mexico_City"),
  nombreDueno: z.string().min(2, "El nombre del dueño debe tener al menos 2 caracteres"),
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  plan: z.enum(["basico", "pro", "enterprise"] as const),
});

export type RegistroInput = z.infer<typeof RegistroSchema>;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Registro directo de autoservicio sin tarjeta (14 Días de Prueba Gratuita).
 * Crea el usuario, restaurante y asignación con trial activo de 14 días.
 */
export async function registrarRestauranteDirectoAction(input: RegistroInput) {
  const valid = RegistroSchema.safeParse(input);
  if (!valid.success) {
    return { error: valid.error.issues[0].message };
  }

  const { nombreRestaurante, direccion, timezone, nombreDueno, email, password, plan } = valid.data;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Verificar si el usuario ya existe en nuestra BD
  const usuarioExistente = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, cleanEmail),
  });

  if (usuarioExistente) {
    return { error: "Ya existe una cuenta con este correo electrónico. Inicia sesión para continuar." };
  }

  // 2. Crear usuario en Supabase Auth
  const supabaseAdmin = createSupabaseAdminClient();
  let authUserId: string;

  const authUserRes = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password: password,
    email_confirm: true,
    user_metadata: {
      nombre: nombreDueno.trim(),
    },
  });

  if (authUserRes.error) {
    const listRes = await supabaseAdmin.auth.admin.listUsers();
    const existing = listRes.data.users.find((u) => u.email === cleanEmail);
    if (existing) {
      authUserId = existing.id;
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
    } else {
      return { error: `Error al registrar usuario: ${authUserRes.error.message}` };
    }
  } else {
    authUserId = authUserRes.data.user.id;
  }

  // 3. 14 días exactos de prueba gratuita
  const fechaFinTrial = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  let nuevoRestauranteId = "";
  let nuevoUsuarioId = "";

  try {
    await db.transaction(async (tx) => {
      // A. Crear o asegurar usuario
      let [u] = await tx.select().from(usuarios).where(eq(usuarios.email, cleanEmail)).limit(1);
      if (!u) {
        [u] = await tx
          .insert(usuarios)
          .values({
            auth_id: authUserId,
            email: cleanEmail,
            nombre: nombreDueno.trim(),
            activo: true,
          })
          .returning();
      } else {
        [u] = await tx
          .update(usuarios)
          .set({ auth_id: authUserId, nombre: nombreDueno.trim() })
          .where(eq(usuarios.id, u.id))
          .returning();
      }
      nuevoUsuarioId = u.id;

      // B. Crear restaurante con trial activo de 14 días sin Stripe requerido
      const [r] = await tx
        .insert(restaurantes)
        .values({
          nombre: nombreRestaurante.trim(),
          direccion: direccion?.trim() || null,
          timezone,
          plan: plan as Plan,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          estado_suscripcion: "trial",
          fecha_fin_trial: fechaFinTrial,
        })
        .returning();
      nuevoRestauranteId = r.id;

      // C. Vincular dueño
      await tx.insert(usuarioRestaurantes).values({
        usuario_id: u.id,
        restaurante_id: r.id,
        rol: "dueno",
        activo: true,
        invitacion_pendiente: false,
      });

      // D. Asentar en log de auditoría
      await tx.insert(logAuditoria).values({
        restaurante_id: r.id,
        usuario_id: u.id,
        accion: "REGISTRO_RESTAURANTE_DIRECTO_TRIAL",
        valores_nuevos: {
          plan,
          trial_dias: 14,
          email: cleanEmail,
          fecha_fin_trial: fechaFinTrial.toISOString(),
        },
      });
    });

    // 4. Iniciar sesión automática mediante cookies del servidor
    try {
      const supabaseServer = await createSupabaseServerClient();
      await supabaseServer.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      const cookieStore = await cookies();
      cookieStore.set("restaurante_activo", nuevoRestauranteId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    } catch (authErr) {
      console.warn("[RegistroDirecto] Advertencia al auto-iniciar sesión:", authErr);
      // Continúa; si falla la cookie en server action, redirigirá al login con mensaje exitoso
    }

    return {
      success: true,
      restauranteId: nuevoRestauranteId,
      duenoId: nuevoUsuarioId,
      nombreRestaurante,
      redirectUrl: "/home",
    };
  } catch (err: any) {
    console.error("[RegistroDirecto] Error transaccional en PostgreSQL:", err);
    return { error: err.message || "Error al completar el registro del restaurante." };
  }
}

export async function iniciarRegistroStripeAction(input: RegistroInput) {
  const valid = RegistroSchema.safeParse(input);
  if (!valid.success) {
    return { error: valid.error.issues[0].message };
  }

  const { nombreRestaurante, direccion, timezone, nombreDueno, email, password, plan } = valid.data;

  // 1. Verificar si el usuario ya existe en nuestra BD
  const usuarioExistente = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, email.toLowerCase().trim()),
  });

  if (usuarioExistente) {
    return { error: "Ya existe una cuenta con este correo electrónico. Inicia sesión para continuar." };
  }

  // 2. Guardar temporalmente en registros_pendientes (expira en 24 horas)
  const passwordHash = hashPassword(password);
  const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [registro] = await db
    .insert(registrosPendientes)
    .values({
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      nombre_dueno: nombreDueno.trim(),
      nombre_restaurante: nombreRestaurante.trim(),
      direccion: direccion?.trim() || null,
      timezone,
      plan,
      expira_en: expiraEn,
      completado: false,
    })
    .returning();

  // 3. Crear sesión de Stripe Checkout (Modo Subscription con Trial de 14 días y Tarjeta Requerida)
  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const priceId = STRIPE_PRICES[plan];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email.toLowerCase().trim(),
      client_reference_id: registro.id,
      payment_method_collection: "always", // Pide tarjeta desde el registro
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          registro_id: registro.id,
          nombre_restaurante: nombreRestaurante,
          plan,
        },
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        registro_id: registro.id,
        plan,
      },
      success_url: `${appUrl}/registro/completado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/registro?cancelado=true&plan=${plan}`,
    });

    // Guardar stripe_session_id en registros_pendientes
    await db
      .update(registrosPendientes)
      .set({ stripe_session_id: session.id })
      .where(eq(registrosPendientes.id, registro.id));

    return { checkoutUrl: session.url };
  } catch (err: any) {
    console.error("[RegistroStripe] Error creando sesión de Checkout:", err);
    // Limpieza de registro pendiente ante falla de Stripe
    await db.delete(registrosPendientes).where(eq(registrosPendientes.id, registro.id));
    return { error: "No se pudo inicializar la pasarela de pago de Stripe. Intenta de nuevo." };
  }
}

/**
 * Función atómica de activación — invocada por el Webhook de Stripe o
 * por la página de completado en caso de fallback de contingencia.
 */
export async function activarRestaurantePorSesion(sessionId: string) {
  const stripe = getStripeClient();

  // 1. Obtener la sesión de Stripe
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer"],
  });

  if (session.status !== "complete") {
    return { status: "pendiente", mensaje: "La sesión aún no ha sido completada en Stripe." };
  }

  // 2. Buscar el registro pendiente asociado
  const regId = session.client_reference_id || session.metadata?.registro_id;
  let reg = await db.query.registrosPendientes.findFirst({
    where: regId ? eq(registrosPendientes.id, regId) : eq(registrosPendientes.stripe_session_id, sessionId),
  });

  if (!reg) {
    return { status: "error", mensaje: "No se encontró el registro pendiente correspondiente." };
  }

  // Si ya fue completado por el webhook previamente (idempotencia pura)
  if (reg.completado) {
    const dueno = await db.query.usuarios.findFirst({
      where: eq(usuarios.email, reg.email),
    });
    const rest = await db.query.restaurantes.findFirst({
      where: eq(restaurantes.stripe_customer_id, (session.customer as any)?.id || (session.customer as string)),
    });
    return {
      status: "completado",
      restauranteId: rest?.id,
      duenoId: dueno?.id,
      nombreRestaurante: rest?.nombre,
    };
  }

  // 3. Crear usuario en Supabase Auth
  const supabaseAdmin = createSupabaseAdminClient();
  const rawPassword = `Temp_${crypto.randomBytes(8).toString("hex")}!Aa1`; // Contraseña temporal segura para Auth
  let authUserId: string;

  const authUserRes = await supabaseAdmin.auth.admin.createUser({
    email: reg.email,
    password: rawPassword,
    email_confirm: true,
    user_metadata: {
      nombre: reg.nombre_dueno,
    },
  });

  if (authUserRes.error) {
    // Si el usuario ya existe en Supabase Auth, obtenemos su ID
    const listRes = await supabaseAdmin.auth.admin.listUsers();
    const existing = listRes.data.users.find((u) => u.email === reg!.email);
    if (existing) {
      authUserId = existing.id;
    } else {
      throw new Error(`Error creando usuario en Auth: ${authUserRes.error.message}`);
    }
  } else {
    authUserId = authUserRes.data.user.id;
  }

  // 4. Inserción atómica en PostgreSQL
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const stripeSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const fechaFinTrial = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  let nuevoRestauranteId: string = "";
  let nuevoUsuarioId: string = "";

  await db.transaction(async (tx) => {
    // A. Crear o asegurar usuario
    let [u] = await tx.select().from(usuarios).where(eq(usuarios.email, reg!.email)).limit(1);
    if (!u) {
      [u] = await tx
        .insert(usuarios)
        .values({
          auth_id: authUserId,
          email: reg!.email,
          nombre: reg!.nombre_dueno,
          activo: true,
        })
        .returning();
    } else {
      [u] = await tx
        .update(usuarios)
        .set({ auth_id: authUserId, nombre: reg!.nombre_dueno })
        .where(eq(usuarios.id, u.id))
        .returning();
    }
    nuevoUsuarioId = u.id;

    // B. Crear restaurante con trial activo
    const [r] = await tx
      .insert(restaurantes)
      .values({
        nombre: reg!.nombre_restaurante,
        direccion: reg!.direccion,
        timezone: reg!.timezone,
        plan: reg!.plan as Plan,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubId,
        estado_suscripcion: "trial",
        fecha_fin_trial: fechaFinTrial,
      })
      .returning();
    nuevoRestauranteId = r.id;

    // C. Vincular dueño
    await tx.insert(usuarioRestaurantes).values({
      usuario_id: u.id,
      restaurante_id: r.id,
      rol: "dueno",
      activo: true,
      invitacion_pendiente: false,
    });

    // D. Marcar registro pendiente como completado
    await tx
      .update(registrosPendientes)
      .set({ completado: true })
      .where(eq(registrosPendientes.id, reg!.id));

    // E. Asentar en log de auditoría
    await tx.insert(logAuditoria).values({
      restaurante_id: r.id,
      usuario_id: u.id,
      accion: "REGISTRO_RESTAURANTE_SELF_SERVICE",
      valores_nuevos: {
        plan: reg!.plan,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubId,
        trial_dias: 14,
        email: reg!.email,
      },
    });
  });

  return {
    status: "completado",
    restauranteId: nuevoRestauranteId,
    duenoId: nuevoUsuarioId,
    nombreRestaurante: reg.nombre_restaurante,
  };
}

/**
 * Server Action consultada por /registro/completado (polling 1.5s + contingencia 4s).
 */
export async function consultarEstadoActivacionAction(sessionId: string) {
  if (!sessionId) {
    return { status: "error", mensaje: "sessionId no proporcionado" };
  }

  try {
    const resultado = await activarRestaurantePorSesion(sessionId);

    if (resultado.status === "completado" && resultado.restauranteId) {
      // Establecer cookie del restaurante activo
      const cookieStore = await cookies();
      cookieStore.set("restaurante_activo", resultado.restauranteId, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }

    return resultado;
  } catch (err: any) {
    console.error("[ConsultarEstadoActivacion] Error:", err);
    return { status: "error", mensaje: err.message || "Error al verificar la activación" };
  }
}

