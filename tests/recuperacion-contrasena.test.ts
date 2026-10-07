import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock de next/headers a nivel de módulo
vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(() =>
    Promise.resolve({
      get: (headerName: string) => {
        if (headerName.toLowerCase() === "x-forwarded-for") return "203.0.113.42";
        return null;
      },
    })
  ),
  cookies: vi.fn().mockImplementation(() =>
    Promise.resolve({
      getAll: () => [],
      set: vi.fn(),
      delete: vi.fn(),
    })
  ),
}));

import {
  solicitarRecuperacionAction,
  actualizarPasswordRecuperacionAction,
} from "@/lib/recuperacion-actions";

const MENSAJE_GENERICO_RECUPERACION =
  "Si ese correo tiene una cuenta, te enviaremos un enlace para restablecer tu contraseña";
import * as supabaseServerModule from "@/lib/supabase-server";
import * as turnstileModule from "@/lib/turnstile";
import { resetRateLimits } from "@/lib/rate-limiter";

describe("Recuperación de Contraseña (solicitarRecuperacionAction y actualizarPasswordRecuperacionAction)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const mockResetPasswordForEmail = vi.fn();
  const mockUpdateUser = vi.fn();
  const mockSignOut = vi.fn();

  const mockSupabaseClient = {
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock por defecto de Supabase Server Client
    vi.spyOn(supabaseServerModule, "createSupabaseServerClient").mockResolvedValue(
      mockSupabaseClient as any
    );

    // Mock por defecto de Turnstile: válido en tests
    vi.spyOn(turnstileModule, "validarTurnstileToken").mockResolvedValue({
      success: true,
    });

    mockResetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    mockUpdateUser.mockReset().mockResolvedValue({ error: null });
    mockSignOut.mockReset().mockResolvedValue({ error: null });
  });

  afterEach(() => {
    resetRateLimits();
  });

  describe("1. Respuesta idéntica para correo existente y no existente (Anti-Enumeración)", () => {
    it("devuelve el mismo mensaje genérico cuando el correo existe", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const res = await solicitarRecuperacionAction({
        email: "usuario.existente@restauracore.com",
      });

      expect(res.ok).toBe(true);
      expect(res.error).toBeUndefined();
      expect(res.mensaje).toBe(MENSAJE_GENERICO_RECUPERACION);
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        "usuario.existente@restauracore.com",
        expect.objectContaining({
          redirectTo: expect.stringContaining("/restablecer-contrasena"),
        })
      );
    });

    it("devuelve exactamente el mismo mensaje genérico cuando el correo no existe en Supabase", async () => {
      // Simular que Supabase reporta usuario no encontrado
      mockResetPasswordForEmail.mockResolvedValueOnce({
        data: null,
        error: {
          name: "AuthApiError",
          message: "User not found or email rate limit exceeded",
        },
      });

      const res = await solicitarRecuperacionAction({
        email: "no.existe@restauracore.com",
      });

      expect(res.ok).toBe(true);
      expect(res.error).toBeUndefined();
      expect(res.mensaje).toBe(MENSAJE_GENERICO_RECUPERACION);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[RECUPERACION_CONTRASENA_ERROR]",
        expect.objectContaining({
          tag: "RECUPERACION_ERROR",
          paso: "RESET_PASSWORD_FOR_EMAIL",
          errorMessage: expect.stringContaining("User not found"),
          email: expect.stringMatching(/no\*\*\*@restauracore\.com/),
        })
      );
    });

    it("ambas respuestas son indistinguibles en su estructura y mensaje", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
      const resExistente = await solicitarRecuperacionAction({
        email: "admin@empresa.com",
      });

      resetRateLimits();

      mockResetPasswordForEmail.mockResolvedValueOnce({
        error: { name: "AuthApiError", message: "User not found" },
      });
      const resInexistente = await solicitarRecuperacionAction({
        email: "desconocido@empresa.com",
      });

      expect(resExistente).toEqual(resInexistente);
    });
  });

  describe("2. Excepción interna devuelve el mismo mensaje genérico", () => {
    it("captura fallo inesperado o de red de Supabase y retorna mensaje genérico registrando log seguro", async () => {
      mockResetPasswordForEmail.mockRejectedValueOnce(
        new Error("Error de conexión con la infraestructura de Supabase Auth")
      );

      const res = await solicitarRecuperacionAction({
        email: "falla.red@restauracore.com",
      });

      expect(res.ok).toBe(true);
      expect(res.error).toBeUndefined();
      expect(res.mensaje).toBe(MENSAJE_GENERICO_RECUPERACION);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[RECUPERACION_CONTRASENA_ERROR]",
        expect.objectContaining({
          tag: "RECUPERACION_ERROR",
          paso: "RESET_PASSWORD_FOR_EMAIL_EXCEPTION",
          errorName: "Error",
          errorMessage: expect.stringContaining("Error de conexión"),
          email: "fa***@restauracore.com",
        })
      );
    });
  });

  describe("3. El limitador de peticiones bloquea la sexta solicitud (5 por hora por IP)", () => {
    it("permite 5 solicitudes y bloquea la sexta con error de rate limit", async () => {
      // Ejecutar 5 solicitudes permitidas para la IP configurada
      for (let i = 1; i <= 5; i++) {
        mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
        const res = await solicitarRecuperacionAction({
          email: `test${i}@empresa.com`,
        });
        expect(res.ok).toBe(true);
        expect(res.mensaje).toBe(MENSAJE_GENERICO_RECUPERACION);
      }

      // La sexta solicitud para la misma IP debe ser bloqueada por el rate limiter
      const resSexta = await solicitarRecuperacionAction({
        email: "test6@empresa.com",
      });

      expect(resSexta.ok).toBeUndefined();
      expect(resSexta.error).toMatch(/demasiadas solicitudes/i);

      // Comprobar que en la 6ta no se llegó a llamar a Supabase
      expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(5);
    });
  });

  describe("4. Validación de nueva contraseña en actualización", () => {
    it("rechaza una contraseña corta menor a 8 caracteres", async () => {
      const contrasenasCortas = ["123", "abc", "pass1", "7caract", ""];

      for (const pass of contrasenasCortas) {
        const res = await actualizarPasswordRecuperacionAction(pass);
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/8 caracteres/i);
      }

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("acepta una contraseña de 8 o más caracteres y cierra la sesión de recuperación", async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });
      mockSignOut.mockResolvedValueOnce({ error: null });

      const res = await actualizarPasswordRecuperacionAction("ClaveSegura2026!");

      expect(res.ok).toBe(true);
      expect(res.mensaje).toMatch(/actualizada exitosamente/i);
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "ClaveSegura2026!",
      });
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });
});

