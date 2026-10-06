import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validarTurnstileToken } from "@/lib/turnstile";

describe("Cloudflare Turnstile Guard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("1. Producción con claves dummy de Cloudflare (rechazado)", () => {
    it("rechaza cuando la secret key empieza con 1x en producción", async () => {
      (process.env as any).NODE_ENV = "production";
      delete process.env.VITEST;
      delete process.env.SKIP_CAPTCHA_IN_TESTS;
      process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAARealSiteKeyMocked";

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await validarTurnstileToken("dummy_token", "127.0.0.1");

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no está disponible temporalmente/i);
      expect(consoleErrorSpy).toHaveBeenCalled();
      // Asegurarse de que NO se imprimió el valor de la clave en los logs
      for (const call of consoleErrorSpy.mock.calls) {
        const loggedText = call.join(" ");
        expect(loggedText).not.toContain("1x0000000000000000000000000000000AA");
        expect(loggedText).not.toContain("0x4AAAAAAARealSiteKeyMocked");
      }
    });

    it("rechaza cuando la site key empieza con 1x en producción (aunque secret sea real)", async () => {
      (process.env as any).NODE_ENV = "production";
      delete process.env.VITEST;
      delete process.env.SKIP_CAPTCHA_IN_TESTS;
      process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAARealSecretKeyMock";
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await validarTurnstileToken("dummy_token", "127.0.0.1");

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no está disponible temporalmente/i);
      expect(consoleErrorSpy).toHaveBeenCalled();
      for (const call of consoleErrorSpy.mock.calls) {
        const loggedText = call.join(" ");
        expect(loggedText).not.toContain("1x00000000000000000000AA");
        expect(loggedText).not.toContain("0x4AAAAAAARealSecretKeyMock");
      }
    });

    it("rechaza cuando las claves dummy empiezan con 2x o 3x en producción", async () => {
      (process.env as any).NODE_ENV = "production";
      delete process.env.VITEST;
      delete process.env.SKIP_CAPTCHA_IN_TESTS;
      process.env.TURNSTILE_SECRET_KEY = "2x0000000000000000000000000000000AB";
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "3x00000000000000000000FF";

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await validarTurnstileToken("dummy_token", "127.0.0.1");

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no está disponible temporalmente/i);
    });
  });

  describe("2. Producción con claves de formato real (aceptado)", () => {
    it("acepta en producción cuando las claves tienen formato real y Cloudflare valida OK", async () => {
      (process.env as any).NODE_ENV = "production";
      delete process.env.VITEST;
      delete process.env.SKIP_CAPTCHA_IN_TESTS;
      process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAASecretKeyValidFormat12345";
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAASiteKeyValidFormat12345";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const res = await validarTurnstileToken("cf_valid_token_sample", "192.168.1.1");

      expect(res.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Desarrollo y SKIP_CAPTCHA_IN_TESTS con claves dummy (aceptado)", () => {
    it("acepta claves dummy en entorno de desarrollo", async () => {
      (process.env as any).NODE_ENV = "development";
      delete process.env.SKIP_CAPTCHA_IN_TESTS;
      process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const res = await validarTurnstileToken("sample_token", "127.0.0.1");

      expect(res.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("no bloquea con claves dummy si SKIP_CAPTCHA_IN_TESTS está activo (fuera de producción Vercel)", async () => {
      (process.env as any).NODE_ENV = "production";
      delete process.env.VERCEL_ENV;
      process.env.SKIP_CAPTCHA_IN_TESTS = "true";
      process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

      // Con SKIP_CAPTCHA_IN_TESTS (sin VERCEL_ENV) no se bloquea por guard y si no hay token retorna success true
      const res = await validarTurnstileToken(null, "127.0.0.1");
      expect(res.success).toBe(true);
    });
  });

  describe("4. VERCEL_ENV=production ignora SKIP_CAPTCHA_IN_TESTS", () => {
    it("producción con VERCEL_ENV=production y la bandera activa no omite la verificación", async () => {
      (process.env as any).NODE_ENV = "production";
      process.env.VERCEL_ENV = "production";
      process.env.SKIP_CAPTCHA_IN_TESTS = "true";
      process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAAValidSecretKey123";
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAAValidSiteKey123";

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Sin token, la verificación NO debe omitirse y debe fallar exigiendo captcha
      const res = await validarTurnstileToken(null, "127.0.0.1");

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/completa la verificación de seguridad/i);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/SKIP_CAPTCHA_IN_TESTS está activo pero se ignora en producción real de Vercel/i)
      );

      // Garantizar que no se imprimen valores de claves en los logs
      for (const call of consoleErrorSpy.mock.calls) {
        const loggedText = call.join(" ");
        expect(loggedText).not.toContain("0x4AAAAAAAValidSecretKey123");
        expect(loggedText).not.toContain("0x4AAAAAAAValidSiteKey123");
      }
    });
  });
});

