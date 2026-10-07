import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

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
        if (name === "restaurante_activo") return { value: "restaurante-mock-uuid-1" };
        return undefined;
      },
      getAll: () => [],
      set: vi.fn(),
      delete: vi.fn(),
    })
  ),
}));

const {
  mockDbInsert,
  mockSignInWithPassword,
  mockBrowserGetSession,
  mockBrowserOnAuthStateChange,
  mockGetUser,
  mockUpdateUser,
  mockSignOut,
} = vi.hoisted(() => {
  return {
    mockDbInsert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
    mockSignInWithPassword: vi.fn(),
    mockBrowserGetSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    mockBrowserOnAuthStateChange: vi.fn().mockReturnValue({
      data: {
        subscription: { unsubscribe: vi.fn() },
      },
    }),
    mockGetUser: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockSignOut: vi.fn(),
  };
});

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
        }),
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
  }),
  useSearchParams: () => new URLSearchParams(), // Sin código de recuperación
}));

// Mock de supabase browser client para RestablecerContrasenaPage
vi.mock("@/lib/supabase-browser", () => ({
  createSupabaseBrowserClient: vi.fn().mockImplementation(() => ({
    auth: {
      getSession: mockBrowserGetSession,
      onAuthStateChange: mockBrowserOnAuthStateChange,
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
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

    // Por defecto, usuario autenticado en la sesión normal
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-test-uuid-active",
          email: "dueno.activo@restauracore.test",
        },
      },
    });

    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockSignInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    mockBrowserGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockBrowserOnAuthStateChange.mockReturnValue({
      data: {
        subscription: { unsubscribe: vi.fn() },
      },
    });
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

  describe("2. Guard en /restablecer-contrasena con sesión abierta y sin código", () => {
    it("/restablecer-contrasena con sesión abierta y sin código no muestra el formulario y ofrece enlace a /perfil", async () => {
      // Simular que el usuario tiene sesión abierta en el navegador pero NO vino de un enlace de recuperación
      mockBrowserGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: "user-session-exists" },
          },
        },
      });

      mockBrowserOnAuthStateChange.mockReturnValue({
        data: {
          subscription: { unsubscribe: vi.fn() },
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

      // Limpieza
      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });
});
