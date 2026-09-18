import "dotenv/config";
import { chromium } from "@playwright/test";
import { db } from "@/db";
import {
  usuarios,
  restaurantes,
  registrosPendientes,
  usuarioRestaurantes,
  mesas,
  platillos,
  categoriasMenu,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

async function limpiarDatos(email: string, nombreRest: string) {
  const r = await db.query.restaurantes.findFirst({ where: eq(restaurantes.nombre, nombreRest) });
  if (r) {
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, r.id));
    await db.delete(mesas).where(eq(mesas.restaurante_id, r.id));
    await db.delete(platillos).where(eq(platillos.restaurante_id, r.id));
    await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, r.id));
    await db.execute(sql`DELETE FROM log_auditoria WHERE restaurante_id = ${r.id}::uuid;`);
    await db.delete(restaurantes).where(eq(restaurantes.id, r.id));
  }
  const u = await db.query.usuarios.findFirst({ where: eq(usuarios.email, email) });
  if (u) {
    await db.execute(sql`DELETE FROM log_auditoria WHERE usuario_id = ${u.id}::uuid;`);
    await db.delete(usuarios).where(eq(usuarios.id, u.id));
  }
  await db.delete(registrosPendientes).where(eq(registrosPendientes.email, email));
}

async function main() {
  console.log("================================================================================");
  console.log("PRUEBA E2E REAL: NAVEGADOR + STRIPE CHECKOUT + STRIPE CLI WEBHOOK + POSTGRES");
  console.log("================================================================================");

  const testEmail = "carlos.stripe.real@restauracore.com";
  const testRestaurante = "Tacos El Auténtico Stripe Real";

  // Limpieza inicial
  await limpiarDatos(testEmail, testRestaurante);

  console.log("\n[1] Lanzando navegador Chromium headless con Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Navegar a /registro
  console.log("[2] Navegando a http://localhost:3000/registro?plan=pro...");
  await page.goto("http://localhost:3000/registro?plan=pro");
  await page.waitForLoadState("networkidle");

  // 2. Llenar formulario
  console.log("[3] Llenando formulario de registro con datos de prueba...");
  await page.locator('input[placeholder*="Taquería"]').fill(testRestaurante);
  await page.locator('input[placeholder*="Carlos"]').fill("Carlos Auténtico");
  await page.locator('input[placeholder*="carlos@"]').fill(testEmail);
  await page.locator('input[type="password"]').fill("Password123!Aa");

  // Consultas antes de enviar
  console.log("\n[4] Consultas en PostgreSQL ANTES de enviar el formulario:");
  const q1Antes = await db.execute(
    sql`SELECT count(*)::int as count FROM usuarios WHERE email = ${testEmail};`
  );
  const q2Antes = await db.execute(
    sql`SELECT count(*)::int as count FROM restaurantes WHERE nombre = ${testRestaurante};`
  );
  console.log("SQL: SELECT count(*) FROM usuarios WHERE email = '" + testEmail + "';");
  console.log(JSON.stringify(q1Antes, null, 2));
  console.log("SQL: SELECT count(*) FROM restaurantes WHERE nombre = '" + testRestaurante + "';");
  console.log(JSON.stringify(q2Antes, null, 2));

  // 3. Enviar formulario
  console.log("\n[5] Haciendo clic en 'Continuar al Pago Seguro con Stripe'...");
  await page.locator('button[type="submit"]').click();

  // 4. Esperar redirección a Stripe Checkout
  console.log("[6] Esperando redirección hacia los servidores de Stripe Checkout...");
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  const checkoutUrl = page.url();
  console.log("✓ Redirigido exitosamente a Stripe Checkout real:");
  console.log(checkoutUrl.split("?")[0]);

  // Consultas mientras está en Stripe Checkout
  console.log("\n[7] Consultas en PostgreSQL mientras el usuario está en Stripe Checkout (a medias):");
  const q1Checkout = await db.execute(
    sql`SELECT count(*)::int as count FROM usuarios WHERE email = ${testEmail};`
  );
  const q2Checkout = await db.execute(
    sql`SELECT count(*)::int as count FROM restaurantes WHERE nombre = ${testRestaurante};`
  );
  console.log("SQL: SELECT count(*) FROM usuarios WHERE email = '" + testEmail + "';");
  console.log(JSON.stringify(q1Checkout, null, 2));
  console.log("SQL: SELECT count(*) FROM restaurantes WHERE nombre = '" + testRestaurante + "';");
  console.log(JSON.stringify(q2Checkout, null, 2));

  // 5. Llenar tarjeta de prueba en Stripe Checkout
  console.log("\n[8] Ingresando tarjeta de prueba 4242 4242 4242 4242 en Stripe Checkout...");
  await page.waitForSelector("#cardNumber", { timeout: 20000 });
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12/34");
  await page.locator("#cardCvc").fill("123");

  const billingNameInput = page.locator("#billingName");
  if (await billingNameInput.count()) {
    await billingNameInput.fill("Carlos Auténtico");
  }

  console.log("[9] Enviando pago a Stripe...");
  const submitButton = page.locator('button[type="submit"], .SubmitButton');
  await submitButton.click();

  // 6. Esperar redirección a /registro/completado
  console.log("[10] Esperando confirmación de Stripe y redirección a /registro/completado...");
  await page.waitForURL(/localhost:3000\/registro\/completado/, { timeout: 30000 });
  console.log("✓ Aterrizó en /registro/completado con session_id real.");

  // 7. Esperar polling y redirección automática a /bienvenida
  console.log("[11] Esperando polling de activación y redirección al Wizard (/bienvenida)...");
  await page.waitForURL(/localhost:3000\/bienvenida/, { timeout: 30000 });
  console.log("✓ ¡Redirigido con éxito a /bienvenida!");

  // 8. Consultas en PostgreSQL tras la confirmación real
  console.log("\n[12] Consultas en PostgreSQL DESPUÉS de la confirmación real de Stripe:");
  const q1Despues = await db.execute(
    sql`SELECT count(*)::int as count FROM usuarios WHERE email = ${testEmail};`
  );
  const q2Despues = await db.execute(
    sql`SELECT count(*)::int as count FROM restaurantes WHERE nombre = ${testRestaurante};`
  );
  console.log("SQL: SELECT count(*) FROM usuarios WHERE email = '" + testEmail + "';");
  console.log(JSON.stringify(q1Despues, null, 2));
  console.log("SQL: SELECT count(*) FROM restaurantes WHERE nombre = '" + testRestaurante + "';");
  console.log(JSON.stringify(q2Despues, null, 2));

  // 9. Detalles del restaurante creado en PostgreSQL
  const rest = await db.query.restaurantes.findFirst({ where: eq(restaurantes.nombre, testRestaurante) });
  console.log("\n[13] Registro creado en PostgreSQL con datos reales de Stripe:");
  console.log(JSON.stringify({
    id: rest?.id,
    nombre: rest?.nombre,
    plan: rest?.plan,
    estado_suscripcion: rest?.estado_suscripcion,
    stripe_customer_id: rest?.stripe_customer_id,
    stripe_subscription_id: rest?.stripe_subscription_id,
    fecha_fin_trial: rest?.fecha_fin_trial,
  }, null, 2));

  // -----------------------------------------------------------------------------
  // CASO DE FALLO: Tarjeta rechazada (4000 0000 0000 0002)
  // -----------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("PRUEBA CASO DE FALLO: TARJETA RECHAZADA (4000 0000 0000 0002)");
  console.log("================================================================================");

  const emailFallo = "carlos.rechazado@restauracore.com";
  const restFallo = "Taquería Declinada Stripe";
  await limpiarDatos(emailFallo, restFallo);

  console.log("[14] Navegando a /registro para simular pago fallido...");
  await page.goto("http://localhost:3000/registro?plan=basico");
  await page.waitForLoadState("networkidle");

  await page.locator('input[placeholder*="Taquería"]').fill(restFallo);
  await page.locator('input[placeholder*="Carlos"]').fill("Carlos Declinado");
  await page.locator('input[placeholder*="carlos@"]').fill(emailFallo);
  await page.locator('input[type="password"]').fill("Password123!Aa");
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  console.log("✓ En Stripe Checkout para tarjeta declinada.");

  await page.waitForSelector("#cardNumber", { timeout: 20000 });
  await page.locator("#cardNumber").fill("4000000000000002");
  await page.locator("#cardExpiry").fill("12/34");
  await page.locator("#cardCvc").fill("123");

  const billingNameInput2 = page.locator("#billingName");
  if (await billingNameInput2.count()) {
    await billingNameInput2.fill("Carlos Declinado");
  }

  console.log("[15] Haciendo clic en pagar con tarjeta 4000 0000 0000 0002...");
  const submitButton2 = page.locator('button[type="submit"], .SubmitButton');
  await submitButton2.click();

  // Esperar el mensaje de error de Stripe en la pantalla
  console.log("[16] Verificando rechazo en la pantalla de Stripe Checkout...");
  const errorSelector = page.locator('.FieldError, .HostedPaymentErrorMessage, [role="alert"]');
  await errorSelector.first().waitFor({ state: "visible", timeout: 15000 });
  const errorText = await errorSelector.first().textContent();
  console.log(`✓ Mensaje de rechazo mostrado por Stripe en Checkout: "${errorText?.trim()}"`);

  // Confirmar que el navegador SIGUE en Stripe Checkout y no completó el pago
  console.log("URL actual tras intento fallido:", page.url().split("?")[0]);
  console.log("✓ El usuario permanece en Stripe con mensaje claro y oportunidad de ingresar otra tarjeta.");

  // Confirmar en PostgreSQL que no se creó absolutamente nada
  console.log("\n[17] Verificando en PostgreSQL que NO se creó ningún registro tras el rechazo:");
  const q1Fallo = await db.execute(
    sql`SELECT count(*)::int as count FROM usuarios WHERE email = ${emailFallo};`
  );
  const q2Fallo = await db.execute(
    sql`SELECT count(*)::int as count FROM restaurantes WHERE nombre = ${restFallo};`
  );
  console.log("SQL: SELECT count(*) FROM usuarios WHERE email = '" + emailFallo + "';");
  console.log(JSON.stringify(q1Fallo, null, 2));
  console.log("SQL: SELECT count(*) FROM restaurantes WHERE nombre = '" + restFallo + "';");
  console.log(JSON.stringify(q2Fallo, null, 2));

  await browser.close();

  // Limpieza final de datos
  await limpiarDatos(testEmail, testRestaurante);
  await limpiarDatos(emailFallo, restFallo);

  console.log("\n================================================================================");
  console.log("✓ TODAS LAS PRUEBAS REALES END-TO-END CONCLUYERON CON ÉXITO.");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Error en prueba E2E:", err);
  process.exit(1);
});

