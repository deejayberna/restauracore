import { test, expect } from "@playwright/test";

test.describe("Verificación Responsive Móvil (375px Viewport)", () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE / Móvil estándar
  });

  test("1. Login y navegación móvil en /home, /personal y /cancelaciones sin desborde horizontal", async ({
    page,
  }) => {
    // 1. Iniciar sesión
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.fill('input[name="email"]', "dueno@test.com");
    await page.fill('input[name="password"]', "Password123!");
    await page.click('button[type="submit"]');

    // Esperar navegación post-login
    await page.waitForURL(/\/(home|dashboard|seleccionar-restaurante)/, { timeout: 15000 });

    if (page.url().includes("seleccionar-restaurante")) {
      await page.locator("form button").first().click();
      await page.waitForURL(/\/(home|dashboard)/, { timeout: 15000 });
    }

    // ─── PÁGINA 1: /home ──────────────────────────────────────────
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Verificar que no existe scroll horizontal en 375px
    const homeScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const homeClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`[375px /home] scrollWidth: ${homeScrollWidth}, clientWidth: ${homeClientWidth}`);
    expect(homeScrollWidth).toBeLessThanOrEqual(homeClientWidth);

    await page.screenshot({ path: "scratch/screenshot-home-375px.png", fullPage: true });

    // ─── PÁGINA 2: /personal ──────────────────────────────────────
    await page.goto("/personal");
    await page.waitForLoadState("networkidle");

    const personalScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const personalClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`[375px /personal] scrollWidth: ${personalScrollWidth}, clientWidth: ${personalClientWidth}`);
    expect(personalScrollWidth).toBeLessThanOrEqual(personalClientWidth);

    await page.screenshot({ path: "scratch/screenshot-personal-375px.png", fullPage: true });

    // ─── PÁGINA 3: /cancelaciones ─────────────────────────────────
    await page.goto("/cancelaciones");
    await page.waitForLoadState("networkidle");

    const cancelacionesScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const cancelacionesClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`[375px /cancelaciones] scrollWidth: ${cancelacionesScrollWidth}, clientWidth: ${cancelacionesClientWidth}`);
    expect(cancelacionesScrollWidth).toBeLessThanOrEqual(cancelacionesClientWidth);

    await page.screenshot({ path: "scratch/screenshot-cancelaciones-375px.png", fullPage: true });
  });
});

