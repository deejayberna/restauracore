import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const {
  mockCookieState,
  mockDbInsertValues,
  mockDbInsert,
  mockUsuarioRestaurantesFindMany,
  mockSignInWithPassword,
  mockBrowserGetSession,
  mockBrowserOnAuthStateChange,
  mockVerifyOtp,
  mockExchangeCodeForSession,
  mockRouterReplace,
  mockSearchParamsState,
  mockGetUser,
  mockUpdateUser,
  mockSignOut,
} = vi.hoisted(() => {
  const mockCookieState = { restauranteActivo: "restaurante-mock-uuid-1" };
  const mockDbInsertValues = vi.fn().mockResolvedValue({});
  const mockDbInsert = vi.fn().mockReturnValue({
    values: mockDbInsertValues,
  });
  const mockUsuarioRestaurantesFindMany = vi.fn().mockResolvedValue([
    {
      restaurante_id: "restaurante-mock-uuid-1",
      usuario_id: "usuario-mock-db-id",
      activo: true,
    },
  ]);

  const mockSearchParamsState = {
    params: new URLSearchParams(),
  };

  return {
    mockCookieState,
    mockDbInsertValues,
    mockDbInsert,
    mockUsuarioRestaurantesFindMany,
    mockSignInWithPassword: vi.fn(),
    mockBrowserGetSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    mockBrowserOnAuthStateChange: vi.fn().mockReturnValue({
      data: {
        subscription: { unsubscribe: vi.fn() },
      },
    }),
    mockVerifyOtp: vi.fn().mockResolvedValue({ error: null }),
    mockExchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    mockRouterReplace: vi.fn(),
    mockSearchParamsState,
    mockGetUser: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockSignOut: vi.fn(),
  };
});

// Mock de next/headers a nivel de módulo
vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(() =>
    Promise.resolve({
      get: (headerName: string) => {
        if (headerName.toLowerCase() === "x-forwarded-for") return "198.51.100.1";
        return null;
      },
    })
  ),
  cookies: vi.fn().mockImplementation(() =>
    Promise.resolve({
      get: (name: string) => {
        if (name === "restaurante_activo") return { value: mockCookieState.restauranteActivo };
        return undefined;
      },
      getAll: () => [],
      set: vi.fn(),
      delete: vi.fn(),
    })
  ),
}));

// Mock de base de datos para no tocar producción ni base de datos real
vi.mock("@/db", () => ({
  db: {
    query: {
      usuarios: {
        findFirst: vi.fn().mockResolvedValue({
          id: "usuario-mock-db-id",
          auth_id: "user-test-uuid-active",
          email: "dueno.activo@restauracore.test",
        }),
      },
      usuarioRestaurantes: {
        findFirst: vi.fn().mockResolvedValue({
          restaurante_id: "restaurante-mock-uuid-1",
          usuario_id: "usuario-mock-db-id",
          activo: true,
        }),
        findMany: mockUsuarioRestaurantesFindMany,
      },
    },
    insert: mockDbInsert,
  },
}));

// Mock de @supabase/supabase-js para cliente aislado de verificación
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockImplementation(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  })),
}));

// Mock de supabase server client
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn().mockImplementation(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        updateUser: mockUpdateUser,
        signOut: mockSignOut,
      },
    })
  ),
}));

// Mock de next/navigation para RestablecerContrasenaPage
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockRouterReplace,
  }),
  useSearchParams: () => mockSearchParamsState.params,
}));

// Mock de supabase browser client para RestablecerContrasenaPage
vi.mock("@/lib/supabase-browser", () => ({
  createSupabaseBrowserClient: vi.fn().mockImplementation(() => ({
    auth: {
      getSession: mockBrowserGetSession,
      onAuthStateChange: mockBrowserOnAuthStateChange,
      verifyOtp: mockVerifyOtp,
      exchangeCodeForSession: mockExchangeCodeForSession,
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}));

import { cambiarPasswordAction } from "@/lib/auth-actions";
import { resetRateLimits } from "@/lib/rate-limiter";
import RestablecerContrasenaPage from "@/app/restablecer-contrasena/page";

describe("Cambio de Contraseña en /perfil y Guard de /restablecer-contrasena", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Por defecto, usuario autenticado en la sesión normal con restaurante activo en cookie
    mockCookieState.restauranteActivo = "restaurante-mock-uuid-1";
    mockSearchParamsState.params = new URLSearchParams();

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-test-uuid-active",
          email: "dueno.activo@restauracore.test",
        },
      },
    });

    mockUsuarioRestaurantesFindMany.mockResolvedValue([
      {
        restaurante_id: "restaurante-mock-uuid-1",
        usuario_id: "usuario-mock-db-id",
        activo: true,
      },
    ]);

    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockSignInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    mockBrowserGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockBrowserOnAuthStateChange.mockReturnValue({
      data: {
        subscription: { unsubscribe: vi.fn() },
      },
    });
    mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    mockRouterReplace.mockClear();
  });

  afterEach(() => {
    resetRateLimits();
  });

  describe("1. cambiarPasswordAction en /perfil", () => {
    it("contraseña actual incorrecta: es rechazada con mensaje exacto y sin aplicar cambios", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: null,
        error: { message: "Invalid login credentials" },
      });

      const res = await cambiarPasswordAction({
        passwordActual: "contrasena-incorrecta",
        nuevaPassword: "nueva-password-valida-123",
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("La contraseña actual no es correcta");
      // Asegurarse de que NO se llamó a updateUser en la sesión normal
      expect(mockUpdateUser).not.toHaveBeenCalled();
      // Asegurarse de que NO se insertó en log_auditoria
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("contraseña actual correcta: es aceptada, actualiza la sesión y cierra otras sesiones (scope 'others')", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-test-uuid-active" } },
        error: null,
      });
      mockUpdateUser.mockResolvedValueOnce({ error: null });
      mockSignOut.mockResolvedValueOnce({ error: null });

      const res = await cambiarPasswordAction({
        passwordActual: "contrasena-correcta-anterior",
        nuevaPassword: "nueva-password-super-segura-123",
      });

      expect(res.ok).toBe(true);
      expect(res.mensaje).toBe("Contraseña actualizada exitosamente.");
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "nueva-password-super-segura-123",
      });
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
      expect(mockDbInsert).toHaveBeenCalled();
      expect(mockDbInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurante_id: "restaurante-mock-uuid-1",
          accion: "CAMBIO_PASSWORD",
        })
      );
    });

    it("cookie con restaurante ajeno: el evento se asienta en su propio restaurante y nunca en el ajeno", async () => {
      // Cookie alterada con ID de un restaurante al que el usuario NO pertenece
      mockCookieState.restauranteActivo = "restaurante-ajeno-hacker-uuid";

      // Vínculos propios legítimos del usuario
      mockUsuarioRestaurantesFindMany.mockResolvedValueOnce([
        {
          restaurante_id: "restaurante-propio-legitimo-uuid",
          usuario_id: "usuario-mock-db-id",
          activo: true,
        },
      ]);

      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-test-uuid-active" } },
        error: null,
      });

      const res = await cambiarPasswordAction({
        passwordActual: "contrasena-correcta",
        nuevaPassword: "nueva-password-segura-123",
      });

      expect(res.ok).toBe(true);
      expect(mockDbInsert).toHaveBeenCalled();
      // Verificar que el log se asienta en el propio restaurante legítimo y NUNCA en el ajeno
      expect(mockDbInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurante_id: "restaurante-propio-legitimo-uuid",
          accion: "CAMBIO_PASSWORD",
        })
      );
      expect(mockDbInsertValues).not.toHaveBeenCalledWith(
        expect.objectContaining({
          restaurante_id: "restaurante-ajeno-hacker-uuid",
        })
      );
    });

    it("usuario sin vínculos a ningún restaurante (ej. super-admin): cambia la contraseña sin error y sin log", async () => {
      // Usuario sin vínculos en usuario_restaurantes
      mockUsuarioRestaurantesFindMany.mockResolvedValueOnce([]);

      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-test-uuid-active" } },
        error: null,
      });

      const res = await cambiarPasswordAction({
        passwordActual: "contrasena-correcta",
        nuevaPassword: "nueva-password-segura-123",
      });

      expect(res.ok).toBe(true);
      expect(res.mensaje).toBe("Contraseña actualizada exitosamente.");
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "nueva-password-segura-123",
      });
      // NO se inserta ninguna fila en log_auditoria y no falla
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("si signOut({scope: 'others'}) devuelve error: lo registra con console.error sin romper la operación", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-test-uuid-active" } },
        error: null,
      });

      mockSignOut.mockResolvedValueOnce({
        error: { name: "AuthApiError", message: "Failed to sign out other sessions" },
      });

      const res = await cambiarPasswordAction({
        passwordActual: "contrasena-correcta",
        nuevaPassword: "nueva-password-segura-123",
      });

      expect(res.ok).toBe(true);
      expect(res.mensaje).toBe("Contraseña actualizada exitosamente.");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[CAMBIO_PASSWORD_SIGNOUT_OTHERS_ERROR]",
        expect.objectContaining({
          tag: "SIGNOUT_OTHERS_ERROR",
          paso: "CERRAR_SESIONES_REMOTAS",
        })
      );
    });

    it("contraseña nueva igual a la actual: es rechazada", async () => {
      const res = await cambiarPasswordAction({
        passwordActual: "MismaPassword123",
        nuevaPassword: "MismaPassword123",
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("La nueva contraseña debe ser distinta de la actual.");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("contraseña nueva corta (< 8 caracteres): es rechazada", async () => {
      const res = await cambiarPasswordAction({
        passwordActual: "PasswordActual123",
        nuevaPassword: "corta",
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("La nueva contraseña debe tener al menos 8 caracteres.");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("sin sesión activa: es rechazada", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
      });

      const res = await cambiarPasswordAction({
        passwordActual: "PasswordActual123",
        nuevaPassword: "NuevaPasswordValida123",
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("Debes tener una sesión activa para cambiar tu contraseña.");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("sexto intento dentro de 15 minutos: es bloqueado por rate limit", async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: null,
        error: { message: "Invalid login credentials" },
      });

      // Ejecutar 5 intentos (límite por usuario)
      for (let i = 1; i <= 5; i++) {
        const res = await cambiarPasswordAction({
          passwordActual: `intento-${i}`,
          nuevaPassword: "nuevaPasswordValida123",
        });
        expect(res.ok).toBe(false);
        expect(res.error).toBe("La contraseña actual no es correcta");
      }

      // El 6to intento debe ser bloqueado por el rate limiter de usuario
      const sextoIntento = await cambiarPasswordAction({
        passwordActual: "intento-6",
        nuevaPassword: "nuevaPasswordValida123",
      });

      expect(sextoIntento.ok).toBe(false);
      expect(sextoIntento.error).toContain("Demasiados intentos");
      expect(mockSignInWithPassword).toHaveBeenCalledTimes(5);
    });

    it("excepción interna: devuelve un mensaje amable sin lanzar y registra log seguro", async () => {
      mockGetUser.mockRejectedValueOnce(new Error("Fallo de infraestructura en Auth"));

      const res = await cambiarPasswordAction({
        passwordActual: "PasswordActual123",
        nuevaPassword: "NuevaPasswordValida123",
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/error inesperado/i);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[CAMBIO_PASSWORD_ERROR]",
        expect.objectContaining({
          tag: "CAMBIO_PASSWORD_EXCEPTION",
          paso: "PROCESAR_CAMBIO_PASSWORD",
          errorName: "Error",
        })
      );
    });
  });

  describe("2. Guard en /restablecer-contrasena y flujos de recuperación", () => {
    it("token_hash válido con type=recovery muestra el formulario y limpia la URL", async () => {
      mockSearchParamsState.params = new URLSearchParams({
        token_hash: "token-hash-valido-789",
        type: "recovery",
      });

      mockVerifyOtp.mockResolvedValueOnce({
        data: { user: { id: "user-recovery-verified" } },
        error: null,
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(RestablecerContrasenaPage));
      });

      // Se llamó a verifyOtp con el token_hash y tipo recovery
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        token_hash: "token-hash-valido-789",
        type: "recovery",
      });

      // El formulario de nueva contraseña SÍ se muestra
      const inputNuevaPassword = container.querySelector('input[name="nuevaPassword"]');
      expect(inputNuevaPassword).not.toBeNull();

      // Se limpió la URL con router.replace para evitar reuso en refresh
      expect(mockRouterReplace).toHaveBeenCalledWith("/restablecer-contrasena");

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it("token_hash con verifyOtp fallido (error) muestra enlace inválido", async () => {
      mockSearchParamsState.params = new URLSearchParams({
        token_hash: "token-hash-expirado",
        type: "recovery",
      });

      mockVerifyOtp.mockResolvedValueOnce({
        data: null,
        error: { message: "Token expired or invalid" },
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(RestablecerContrasenaPage));
      });

      // El formulario NO se muestra
      const inputNuevaPassword = container.querySelector('input[name="nuevaPassword"]');
      expect(inputNuevaPassword).toBeNull();

      // Muestra mensaje de enlace inválido
      expect(container.textContent).toContain("Enlace inválido o expirado");
      expect(container.querySelector('a[href="/recuperar-contrasena"]')).not.toBeNull();

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it("token_hash sin type=recovery es rechazado como inválido", async () => {
      mockSearchParamsState.params = new URLSearchParams({
        token_hash: "token-hash-sin-type",
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(RestablecerContrasenaPage));
      });

      // NO debe llamar a verifyOtp si type no es recovery
      expect(mockVerifyOtp).not.toHaveBeenCalled();

      // El formulario NO se muestra
      const inputNuevaPassword = container.querySelector('input[name="nuevaPassword"]');
      expect(inputNuevaPassword).toBeNull();
      expect(container.textContent).toContain("Enlace inválido o expirado");

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it("con sesión abierta y sin token es inválido y ofrece enlace a /perfil", async () => {
      mockSearchParamsState.params = new URLSearchParams(); // Sin token_hash ni code

      mockBrowserGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: "user-session-exists" },
          },
        },
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(RestablecerContrasenaPage));
      });

      // 1. El formulario de nueva contraseña NO se muestra
      const inputNuevaPassword = container.querySelector('input[name="nuevaPassword"]');
      expect(inputNuevaPassword).toBeNull();

      // 2. Se muestra el mensaje de enlace inválido o expirado
      expect(container.textContent).toContain("Enlace inválido o expirado");

      // 3. Se muestra el enlace hacia /perfil para cambiar la contraseña con la actual
      const linkPerfil = container.querySelector('a[href="/perfil"]');
      expect(linkPerfil).not.toBeNull();
      expect(container.textContent).toContain("Ir a Mi Perfil");

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it("parámetro ?code= sigue funcionando e intercambia el código", async () => {
      mockSearchParamsState.params = new URLSearchParams({
        code: "pkce-code-valido-123",
      });

      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { user: { id: "user-pkce" } } },
        error: null,
      });

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(RestablecerContrasenaPage));
      });

      // Se llamó a exchangeCodeForSession con el código
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith("pkce-code-valido-123");

      // El formulario de nueva contraseña SÍ se muestra
      const inputNuevaPassword = container.querySelector('input[name="nuevaPassword"]');
      expect(inputNuevaPassword).not.toBeNull();

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });
});

