import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registrarRestauranteDirectoAction } from "@/lib/registro-actions";
import * as rateLimiterModule from "@/lib/rate-limiter";
import * as turnstileModule from "@/lib/turnstile";
import * as supabaseAdminModule from "@/lib/supabase-admin";
import { db } from "@/db";
import { restaurantes, usuarios, usuarioRestaurantes } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Resiliencia y Manejo de Errores en registrarRestauranteDirectoAction", () => {
  const originalEnv = { ...process.env };
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  // Spies / Mocks
  const mockDeleteUser = vi.fn().mockResolvedValue({ error: null });
  const mockCreateUser = vi.fn();
  const mockListUsers = vi.fn();
  const mockUpdateUserById = vi.fn().mockResolvedValue({ error: null });
  const mockResend = vi.fn();

  const mockAdminClient = {
    auth: {
      admin: {
        createUser: mockCreateUser,
        listUsers: mockListUsers,
        updateUserById: mockUpdateUserById,
        deleteUser: mockDeleteUser,
      },
      resend: mockResend,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Por defecto, Supabase Admin funciona correctamente
    vi.spyOn(supabaseAdminModule, "createSupabaseAdminClient").mockReturnValue(
      mockAdminClient as any
    );

    // Por defecto, rate limit permite la petición
    vi.spyOn(rateLimiterModule, "checkRateLimitRegistro").mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 3600000,
    });

    // Por defecto, Turnstile valida correctamente
    vi.spyOn(turnstileModule, "validarTurnstileToken").mockResolvedValue({
      success: true,
    });

    // Reset spies de auth
    mockDeleteUser.mockReset().mockResolvedValue({ error: null });
    mockUpdateUserById.mockReset().mockResolvedValue({ error: null });
    mockCreateUser.mockReset().mockResolvedValue({
      data: {
        user: {
          id: `auth-test-id-${Date.now()}`,
          email: "test@example.com",
        },
      },
      error: null,
    });
    mockListUsers.mockReset().mockResolvedValue({
      data: { users: [] },
      error: null,
    });
    mockResend.mockReset().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const baseInput = {
    nombreRestaurante: "Restaurante Resiliencia",
    direccion: "Av. Principal 123",
    timezone: "America/Mexico_City",
    nombreDueno: "Dueño Prueba",
    email: "resiliencia_test@correo.com",
    password: "PasswordSegura123!",
    plan: "basico" as const,
    turnstileToken: "cf-token-ok",
  };

  it("1. Fallo en Rate Limiting (límite superado): devuelve error amable sin tocar Auth ni BD", async () => {
    vi.spyOn(rateLimiterModule, "checkRateLimitRegistro").mockResolvedValueOnce({
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 1000,
    });

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toMatch(/Demasiados intentos de registro/i);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("1b. Excepción inesperada en Rate Limiting: captura sin lanzar, registra tag y devuelve error", async () => {
    vi.spyOn(rateLimiterModule, "checkRateLimitRegistro").mockRejectedValueOnce(
      new Error("Redis connection dropped")
    );

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toMatch(/no está disponible temporalmente/i);
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Comprobar sanitización en logs
    const callArgs = consoleErrorSpy.mock.calls.find((c) =>
      c.some((arg) => typeof arg === "string" && arg.includes("[RATE_LIMIT]"))
    );
    expect(callArgs).toBeDefined();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("2. Fallo en validación Zod: datos inválidos devuelven error y no tocan Auth ni BD", async () => {
    const invalidInput = { ...baseInput, email: "correo-invalido-sin-arroba" };
    const res = await registrarRestauranteDirectoAction(invalidInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toBeDefined();
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("3. Fallo en verificación de Turnstile: devuelve error y no toca Auth ni BD", async () => {
    vi.spyOn(turnstileModule, "validarTurnstileToken").mockResolvedValueOnce({
      success: false,
      error: "Captcha inválido o expirado",
    });

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toBe("Captcha inválido o expirado");
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("3b. Excepción en Turnstile: captura, registra tag y devuelve error sin lanzar", async () => {
    vi.spyOn(turnstileModule, "validarTurnstileToken").mockRejectedValueOnce(
      new TypeError("Failed to fetch Turnstile API")
    );

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toMatch(/Error de verificación de seguridad/i);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("4. Usuario ya existente en la base de datos: rechaza sin tocar Auth y devuelve mensaje genérico", async () => {
    vi.spyOn(db.query.usuarios, "findFirst").mockResolvedValueOnce({
      id: "usr-existente-123",
      email: baseInput.email.toLowerCase(),
      nombre: "Existente",
    } as any);

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toBe(
      "No fue posible completar el registro con ese correo. Si ya tienes cuenta, inicia sesión o recupera tu contraseña."
    );
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("4b. Excepción al verificar usuario en base de datos: captura y nunca lanza excepción", async () => {
    vi.spyOn(db.query.usuarios, "findFirst").mockRejectedValueOnce(
      new Error("Postgres pool connection timeout")
    );

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toMatch(/No fue posible verificar tus datos/i);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("5. Fallo al crear usuario en Supabase Auth: devuelve error genérico sin llamar a updateUserById ni listUsers", async () => {
    mockCreateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Contraseña demasiado débil en proveedor de Auth" },
    });

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toBe(
      "No fue posible completar el registro con ese correo. Si ya tienes cuenta, inicia sesión o recupera tu contraseña."
    );
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("VULNERABILIDAD PREVENIDA (a): correo existente en Auth sin fila en usuarios: no se llama a updateUserById ni listUsers, no se crea nada y devuelve mensaje genérico", async () => {
    // Sin fila en usuarios
    vi.spyOn(db.query.usuarios, "findFirst").mockResolvedValueOnce(undefined);
    // createUser falla porque ya existe en Auth
    mockCreateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "User already registered" },
    });

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toBe(
      "No fue posible completar el registro con ese correo. Si ya tienes cuenta, inicia sesión o recupera tu contraseña."
    );
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("VULNERABILIDAD PREVENIDA (b): correo con fila en usuarios: mismo comportamiento seguro", async () => {
    // Con fila en usuarios
    vi.spyOn(db.query.usuarios, "findFirst").mockResolvedValueOnce({
      id: "usr-preexistente-db",
      email: baseInput.email.toLowerCase(),
      nombre: "Dueño Preexistente",
    } as any);

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toBe(
      "No fue posible completar el registro con ese correo. Si ya tienes cuenta, inicia sesión o recupera tu contraseña."
    );
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("5b. Excepción inesperada en Supabase createUser: captura sin lanzar 500", async () => {
    mockCreateUser.mockRejectedValueOnce(new Error("Supabase Auth API Network Failure"));

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toMatch(/Error al crear la cuenta de usuario/i);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("6. Fallo al enviar correo de confirmación (resendError): ELIMINA el usuario de Auth para evitar fantasmas", async () => {
    const authIdCreado = "auth-fantasma-correo-123";
    mockCreateUser.mockResolvedValueOnce({
      data: {
        user: { id: authIdCreado, email: baseInput.email },
      },
      error: null,
    });

    mockResend.mockResolvedValueOnce({
      data: null,
      error: { message: "Error en servidor SMTP de Supabase" },
    });

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toContain("No se pudo enviar el correo de confirmación");
    // Comprobar que se llamó a deleteUser con el ID creado
    expect(mockDeleteUser).toHaveBeenCalledWith(authIdCreado);
  });

  it("6b. Excepción lanzada por resend: captura y ELIMINA el usuario de Auth", async () => {
    const authIdCreado = "auth-fantasma-correo-ex-456";
    mockCreateUser.mockResolvedValueOnce({
      data: {
        user: { id: authIdCreado, email: baseInput.email },
      },
      error: null,
    });

    mockResend.mockRejectedValueOnce(new Error("Socket hang up al contactar auth.resend"));

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toContain("No se pudo enviar el correo de confirmación");
    expect(mockDeleteUser).toHaveBeenCalledWith(authIdCreado);
  });

  it("7. Fallo en transacción de PostgreSQL: ELIMINA el usuario de Auth y no deja datos corruptos", async () => {
    const authIdCreado = "auth-fantasma-pg-789";
    mockCreateUser.mockResolvedValueOnce({
      data: {
        user: { id: authIdCreado, email: baseInput.email },
      },
      error: null,
    });

    mockResend.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: null,
    });

    vi.spyOn(db, "transaction").mockRejectedValueOnce(
      new Error("violates unique constraint 'restaurantes_nombre_unique'")
    );

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toMatch(/Error al completar el registro del restaurante/i);
    expect(mockDeleteUser).toHaveBeenCalledWith(authIdCreado);
  });

  it("8. Sanitización estricta de logs: nunca imprime contraseñas ni correos completos", async () => {
    mockCreateUser.mockRejectedValueOnce(new Error("Simulated Auth Crash"));

    await registrarRestauranteDirectoAction({
      ...baseInput,
      email: "secreto_completo@privado.com",
      password: "SuperSecretPassword123!",
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    for (const call of consoleErrorSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain("secreto_completo@privado.com");
      expect(serialized).not.toContain("SuperSecretPassword123!");
      // Debe contener la versión ofuscada
      expect(serialized).toContain("se***@privado.com");
      expect(serialized).toContain("REGISTRO_ERROR");
    }
  });

  it("9. Falla en deleteUser durante rollback: la acción atrapa la excepción y nunca rompe el servidor con 500", async () => {
    const authIdCreado = "auth-fantasma-doble-fallo";
    mockCreateUser.mockResolvedValueOnce({
      data: {
        user: { id: authIdCreado, email: baseInput.email },
      },
      error: null,
    });

    mockResend.mockResolvedValueOnce({
      data: null,
      error: { message: "Servicio de correo caído" },
    });

    // deleteUser también falla
    mockDeleteUser.mockRejectedValueOnce(new Error("Supabase deleteUser API error 503"));

    const res = await registrarRestauranteDirectoAction(baseInput);

    expect(res.success).toBeFalsy();
    expect(res.error).toBeDefined();
    // A pesar del doble fallo, no lanzó excepción hacia el invocador
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

