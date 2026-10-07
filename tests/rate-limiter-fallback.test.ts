import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkRateLimit,
  checkRateLimitLogin,
  resetRateLimits,
} from "@/lib/rate-limiter";

describe("Tarea A: Rate Limiter Fallback en Memoria", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.restoreAllMocks();
  });

  it("emite un console.error único por instancia con tag RATE_LIMITER_FALLBACK_MEMORIA sin secretos", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Primera llamada activa el fallback
    const res1 = await checkRateLimitLogin("192.0.2.1");
    expect(res1.success).toBe(true);

    // Segunda y tercera llamada no deben volver a emitir el log
    const res2 = await checkRateLimitLogin("192.0.2.1");
    expect(res2.success).toBe(true);
    const res3 = await checkRateLimitLogin("192.0.2.2");
    expect(res3.success).toBe(true);

    // Verificamos que console.error se llamó exactamente una vez
    const fallbackCalls = errorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("RATE_LIMITER_FALLBACK_MEMORIA"))
    );
    expect(fallbackCalls.length).toBe(1);

    // Verificamos que el mensaje no incluye URLs, tokens ni secretos
    const logMessage = String(fallbackCalls[0][0]);
    expect(logMessage).toContain("[RATE_LIMITER_FALLBACK_MEMORIA]");
    expect(logMessage).not.toContain("http");
    expect(logMessage).not.toContain("token");
    expect(logMessage).not.toContain("redis");
  });

  it("mantiene el criterio de bloqueo local en memoria al alcanzar el límite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const ip = "192.0.2.50";
    // Límite de login es 5 por ventana
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimitLogin(ip);
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(5 - (i + 1));
    }

    // El 6to intento debe ser bloqueado
    const bloqueado = await checkRateLimitLogin(ip);
    expect(bloqueado.success).toBe(false);
    expect(bloqueado.remaining).toBe(0);
  });
});
