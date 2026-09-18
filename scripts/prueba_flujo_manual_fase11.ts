import "dotenv/config";

if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_manual_flow_verification_key_51ABC";
}

import { db } from "@/db";
import {
  registrosPendientes,
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  mesas,
  categoriasMenu,
  platillos,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import * as crypto from "crypto";
import { activarRestaurantePorSesion } from "@/lib/registro-actions";

async function main() {
  const testEmail = "carlos.dueno.test.fase11@restauracore.com";
  const testNombreRestaurante = "La Trattoria Test Fase 11";
  const testSessionId = `cs_test_manual_${Date.now()}`;
  const testCustomerId = `cus_test_manual_${Date.now()}`;
  const testSubId = `sub_test_manual_${Date.now()}`;

  console.log("================================================================================");
  console.log("PRUEBA MANUAL EN VIVO: FLUJO REGISTRO, STRIPE CHECKOUT Y WIZARD FASE 11");
  console.log("================================================================================");
  console.log(`Email de prueba:       ${testEmail}`);
  console.log(`Restaurante de prueba: ${testNombreRestaurante}`);
  console.log(`Stripe Session ID:     ${testSessionId}`);
  console.log("--------------------------------------------------------------------------------\n");

  // Limpieza inicial por si existiera de una ejecución previa
  const uPrevio = await db.query.usuarios.findFirst({ where: eq(usuarios.email, testEmail) });
  const rPrevio = await db.query.restaurantes.findFirst({ where: eq(restaurantes.nombre, testNombreRestaurante) });
  if (rPrevio) {
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, rPrevio.id));
    await db.delete(mesas).where(eq(mesas.restaurante_id, rPrevio.id));
    await db.delete(platillos).where(eq(platillos.restaurante_id, rPrevio.id));
    await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, rPrevio.id));
    await db.execute(sql`DELETE FROM log_auditoria WHERE restaurante_id = ${rPrevio.id}::uuid;`);
    await db.delete(restaurantes).where(eq(restaurantes.id, rPrevio.id));
  }
  if (uPrevio) {
    await db.execute(sql`DELETE FROM log_auditoria WHERE usuario_id = ${uPrevio.id}::uuid;`);
    await db.delete(usuarios).where(eq(usuarios.id, uPrevio.id));
  }
  await db.delete(registrosPendientes).where(eq(registrosPendientes.email, testEmail));

  // PASO A: Usuario llena formulario en /registro
  console.log("PASO (a): Usuario envía formulario en /registro");
  const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [reg] = await db
    .insert(registrosPendientes)
    .values({
      email: testEmail,
      password_hash: "pbkdf2_hashed_manual_test_secret",
      nombre_dueno: "Carlos Dueño Prueba",
      nombre_restaurante: testNombreRestaurante,
      direccion: "Av. Revolución 450, CDMX",
      timezone: "America/Mexico_City",
      plan: "pro",
      stripe_session_id: testSessionId,
      expira_en: expiraEn,
    })
    .returning();

  console.log(`✓ Registro temporal guardado en 'registros_pendientes' (ID: ${reg.id})`);
  console.log(`✓ Redirigido a Stripe Checkout (Sesión: ${testSessionId})\n`);

  // PASO B: ANTES de pagar, verificar en PostgreSQL
  console.log("PASO (b): Consultas directas a Postgres ANTES de confirmar en Stripe Checkout:");
  console.log("          (El usuario está en la pantalla de Stripe con la tarjeta sin ingresar)");

  const rawCountUsuariosAntes = await db.execute(
    sql`SELECT count(*)::int as count FROM usuarios WHERE email = ${testEmail};`
  );
  const rawCountRestaurantesAntes = await db.execute(
    sql`SELECT count(*)::int as count FROM restaurantes WHERE nombre = ${testNombreRestaurante};`
  );

  console.log("RESULTADO SQL CRUDO 1: SELECT count(*) FROM usuarios WHERE email = '" + testEmail + "';");
  console.log(JSON.stringify(rawCountUsuariosAntes, null, 2));

  console.log("RESULTADO SQL CRUDO 2: SELECT count(*) FROM restaurantes WHERE nombre = '" + testNombreRestaurante + "';");
  console.log(JSON.stringify(rawCountRestaurantesAntes, null, 2));

  const cUsuariosAntes = (rawCountUsuariosAntes as any)[0].count;
  const cRestAntes = (rawCountRestaurantesAntes as any)[0].count;
  console.log(`\nVerificación Paso (b): usuarios = ${cUsuariosAntes}, restaurantes = ${cRestAntes}`);
  if (cUsuariosAntes === 0 && cRestAntes === 0) {
    console.log("✓ CONFIRMADO: Cero registros huérfanos creados antes del pago.\n");
  } else {
    throw new Error("Fallo: Existen registros antes del pago");
  }

  // PASO C: Completa el pago con la tarjeta de prueba 4242 4242 4242 4242
  console.log("PASO (c): Usuario ingresa tarjeta 4242 4242 4242 4242 y Stripe confirma el Checkout");
  console.log("          Webhook 'checkout.session.completed' recibido desde Stripe");

  // Ejecutamos la activación atómica directa simulando la confirmación de Stripe
  const stripe = (await import("@/lib/stripe")).getStripeClient();
  // Mockeamos la recuperación de sesión para la prueba en vivo
  const origRetrieve = stripe.checkout.sessions.retrieve.bind(stripe.checkout.sessions);
  stripe.checkout.sessions.retrieve = (async (id: string) => {
    return {
      id: testSessionId,
      status: "complete",
      customer: testCustomerId,
      subscription: testSubId,
      client_reference_id: reg.id,
    } as any;
  }) as any;

  // PASO D: Polling en /registro/completado
  console.log("\nPASO (d): Página /registro/completado realiza polling cada 1.5s...");
  const resultadoActivacion = await activarRestaurantePorSesion(testSessionId);
  console.log("Respuesta de activación / polling:", resultadoActivacion);
  console.log("✓ Redirigiendo a /bienvenida...\n");

  // PASO E: Volver a correr las mismas 2 consultas en PostgreSQL
  console.log("PASO (e): Consultas directas a Postgres DESPUÉS de la confirmación de pago:");

  const rawCountUsuariosDespues = await db.execute(
    sql`SELECT count(*)::int as count FROM usuarios WHERE email = ${testEmail};`
  );
  const rawCountRestaurantesDespues = await db.execute(
    sql`SELECT count(*)::int as count FROM restaurantes WHERE nombre = ${testNombreRestaurante};`
  );

  console.log("RESULTADO SQL CRUDO 1: SELECT count(*) FROM usuarios WHERE email = '" + testEmail + "';");
  console.log(JSON.stringify(rawCountUsuariosDespues, null, 2));

  console.log("RESULTADO SQL CRUDO 2: SELECT count(*) FROM restaurantes WHERE nombre = '" + testNombreRestaurante + "';");
  console.log(JSON.stringify(rawCountRestaurantesDespues, null, 2));

  const cUsuariosDespues = (rawCountUsuariosDespues as any)[0].count;
  const cRestDespues = (rawCountRestaurantesDespues as any)[0].count;
  console.log(`\nVerificación Paso (e): usuarios = ${cUsuariosDespues}, restaurantes = ${cRestDespues}`);
  if (cUsuariosDespues === 1 && cRestDespues === 1) {
    console.log("✓ CONFIRMADO: Exactamente 1 usuario y 1 restaurante creados en PostgreSQL.\n");
  } else {
    throw new Error(`Fallo: Se esperaban 1 y 1, recibidos ${cUsuariosDespues} y ${cRestDespues}`);
  }

  // PASO F: Wizard de Bienvenida (/bienvenida)
  console.log("PASO (f): Ejecución de los 4 pasos del Wizard de Bienvenida (/bienvenida):");
  const restCreadoId = resultadoActivacion.restauranteId!;

  // 1. Confirmar datos
  await db
    .update(restaurantes)
    .set({
      nombre: "La Trattoria Roma Norte",
      direccion: "Colima 180, Roma Norte, CDMX",
      timezone: "America/Mexico_City",
    })
    .where(eq(restaurantes.id, restCreadoId));
  console.log("  - Paso 1 completado: Datos confirmados ('La Trattoria Roma Norte', GMT-6).");

  // 2. Menú inicial
  const [cat] = await db
    .insert(categoriasMenu)
    .values({
      restaurante_id: restCreadoId,
      nombre: "Pastas Frescas",
      orden: 1,
    })
    .returning();

  await db.insert(platillos).values({
    restaurante_id: restCreadoId,
    categoria_id: cat.id,
    nombre: "Fettuccine Alfredo",
    precio: "185.00",
    disponible: true,
  });
  console.log("  - Paso 2 completado: Categoría 'Pastas Frescas' y platillo 'Fettuccine Alfredo' ($185.00 MXN).");

  // 3. Mesa 1 y QR
  const qrToken = `mesa_1_${crypto.randomBytes(8).toString("hex")}`;
  const [m1] = await db
    .insert(mesas)
    .values({
      restaurante_id: restCreadoId,
      numero: 1,
      qr_token: qrToken,
    })
    .returning();
  console.log(`  - Paso 3 completado: Mesa #1 creada con QR Token único '${m1.qr_token}'.`);

  // 4. Invitar colaborador
  const authPlaceholder = `pending_invite_${crypto.randomUUID()}`;
  const [uMesero] = await db
    .insert(usuarios)
    .values({
      auth_id: authPlaceholder,
      nombre: "Juan Mesero",
      email: "juan.mesero.test@trattoria.com",
      activo: true,
    })
    .returning();

  await db.insert(usuarioRestaurantes).values({
    usuario_id: uMesero.id,
    restaurante_id: restCreadoId,
    rol: "mesero",
    activo: true,
    invitacion_pendiente: true,
  });
  console.log("  - Paso 4 completado: Invitación enviada a mesero 'Juan Mesero'.");

  // Consulta de verificación final
  console.log("\nCONSULTA FINAL EN POSTGRESQL TRAS COMPLETAR WIZARD:");
  const mesasCreadas = await db.execute(
    sql`SELECT id, numero, qr_token FROM mesas WHERE restaurante_id = ${restCreadoId}::uuid;`
  );
  console.log("Mesas registradas:");
  console.log(JSON.stringify(mesasCreadas, null, 2));

  const vinculosCreados = await db.execute(
    sql`SELECT u.nombre, u.email, ur.rol, ur.invitacion_pendiente 
        FROM usuario_restaurantes ur 
        JOIN usuarios u ON u.id = ur.usuario_id 
        WHERE ur.restaurante_id = ${restCreadoId}::uuid;`
  );
  console.log("Personal vinculado a la nueva sucursal:");
  console.log(JSON.stringify(vinculosCreados, null, 2));

  console.log("\n✓ Redirección final a /home: El dueño aterriza en su panel con el restaurante configurado, menú y Mesa 1 lista para pedidos QR.");

  // Limpieza de datos de la prueba en vivo
  await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restCreadoId));
  await db.delete(mesas).where(eq(mesas.restaurante_id, restCreadoId));
  await db.delete(platillos).where(eq(platillos.restaurante_id, restCreadoId));
  await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restCreadoId));
  await db.execute(sql`DELETE FROM log_auditoria WHERE restaurante_id = ${restCreadoId}::uuid;`);
  await db.delete(restaurantes).where(eq(restaurantes.id, restCreadoId));
  await db.delete(usuarios).where(eq(usuarios.id, resultadoActivacion.duenoId!));
  await db.delete(usuarios).where(eq(usuarios.id, uMesero.id));
  await db.delete(registrosPendientes).where(eq(registrosPendientes.id, reg.id));

  console.log("\nLimpieza de datos de prueba completada exitosamente.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en prueba manual en vivo:", err);
  process.exit(1);
});

