"use client";

import React, { useState, useEffect, useRef, Suspense, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { actualizarPasswordRecuperacionAction } from "@/lib/recuperacion-actions";

function RestablecerContrasenaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Guardas para capturar los parámetros de recuperación una sola vez al montar
  // y evitar que la posterior limpieza de la URL (router.replace) re-ejecute el efecto
  // y marque erróneamente el estado como "invalido".
  const paramsInicialesRef = useRef<{
    tokenHash: string | null;
    typeParam: string | null;
    code: string | null;
    qError: string | null;
    qErrorDesc: string | null;
  } | null>(null);

  if (!paramsInicialesRef.current) {
    paramsInicialesRef.current = {
      tokenHash: searchParams.get("token_hash"),
      typeParam: searchParams.get("type"),
      code: searchParams.get("code"),
      qError: searchParams.get("error"),
      qErrorDesc: searchParams.get("error_description"),
    };
  }

  const verificadoExitosoRef = useRef(false);
  const verificacionIniciadaRef = useRef(false);

  // Estados: "verificando" | "listo" | "invalido" | "exito"
  const [estado, setEstado] = useState<"verificando" | "listo" | "invalido" | "exito">("verificando");
  const [haySesionAbierta, setHaySesionAbierta] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Si ya fue verificado exitosamente (por ejemplo tras router.replace que limpió searchParams),
    // no volver a procesar ni marcar como inválido
    if (verificadoExitosoRef.current) {
      if (estado !== "listo" && estado !== "exito") {
        setEstado("listo");
      }
      return;
    }

    // Guarda contra doble ejecución en React StrictMode (desarrollo)
    if (verificacionIniciadaRef.current) {
      return;
    }
    verificacionIniciadaRef.current = true;

    let cancelado = false;
    let timer: NodeJS.Timeout | null = null;
    let subscription: { unsubscribe: () => void } | null = null;
    const supabase = createSupabaseBrowserClient();

    async function verificarAcceso() {
      // 0. Detectar si el usuario ya tiene una sesión ordinaria iniciada
      try {
        const {
          data: { session: existingSession },
        } = await supabase.auth.getSession();
        if (existingSession && !cancelado) {
          setHaySesionAbierta(true);
        }
      } catch {}

      const { tokenHash, typeParam, code, qError, qErrorDesc } = paramsInicialesRef.current!;

      // 1. Verificar si la URL ya reporta error de Supabase en query params
      if (qError || qErrorDesc) {
        if (!cancelado) {
          setEstado("invalido");
          setErrorMensaje(
            qErrorDesc ||
              "El enlace de recuperación es inválido o ha expirado. Por favor solicita uno nuevo."
          );
        }
        return;
      }

      // 2. Verificar hash en la ventana
      if (typeof window !== "undefined" && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const hError = hashParams.get("error");
        const hErrorDesc = hashParams.get("error_description");
        if (hError || hErrorDesc) {
          if (!cancelado) {
            setEstado("invalido");
            setErrorMensaje(
              hErrorDesc ||
                "El enlace de recuperación es inválido o ha expirado. Por favor solicita uno nuevo."
            );
          }
          return;
        }
      }

      // 3. Manejo del flujo verifyOtp: ?token_hash=...&type=recovery (compatible entre dispositivos)
      if (tokenHash) {
        if (typeParam !== "recovery") {
          if (!cancelado) {
            setEstado("invalido");
            setErrorMensaje(
              "El tipo de token de recuperación es inválido o no fue especificado."
            );
          }
          return;
        }

        try {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (verifyError) {
            console.error("[RESTABLECER_CONTRASENA] Error al verificar token_hash:", verifyError);
            if (!cancelado) {
              setEstado("invalido");
              setErrorMensaje(
                "El código o enlace de recuperación es inválido, ya fue utilizado o ha expirado."
              );
            }
            return;
          }

          verificadoExitosoRef.current = true;
          setEstado("listo");
          // Quitar token_hash de la URL para que un refresh no reintente el token
          try {
            router.replace("/restablecer-contrasena");
          } catch {}
          return;
        } catch (err: any) {
          console.error("[RESTABLECER_CONTRASENA] Excepción al verificar token_hash:", err);
          if (!cancelado) {
            setEstado("invalido");
            setErrorMensaje("No fue posible validar el enlace de recuperación.");
          }
          return;
        }
      }

      // 4. Manejo del flujo PKCE: intercambio seguro del parámetro ?code= por sesión de recuperación
      if (code) {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("[RESTABLECER_CONTRASENA] Error al intercambiar código:", exchangeError);
            if (!cancelado) {
              setEstado("invalido");
              setErrorMensaje(
                "El código de recuperación es inválido, ya fue utilizado o ha expirado."
              );
            }
            return;
          }

          verificadoExitosoRef.current = true;
          setEstado("listo");
          try {
            router.replace("/restablecer-contrasena");
          } catch {}
          return;
        } catch (err: any) {
          console.error("[RESTABLECER_CONTRASENA] Excepción al intercambiar código:", err);
          if (!cancelado) {
            setEstado("invalido");
            setErrorMensaje("No fue posible validar el enlace de recuperación.");
          }
          return;
        }
      }

      // 5. Si hay hash en la URL con token de recuperación, escuchar evento explícito PASSWORD_RECOVERY
      const hasRecoveryHash =
        typeof window !== "undefined" &&
        window.location.hash &&
        (window.location.hash.includes("type=recovery") || window.location.hash.includes("access_token"));

      if (hasRecoveryHash) {
        const authListener = supabase.auth.onAuthStateChange((event) => {
          if (cancelado) return;
          if (event === "PASSWORD_RECOVERY") {
            verificadoExitosoRef.current = true;
            setEstado("listo");
          }
        });
        subscription = authListener?.data?.subscription || null;

        timer = setTimeout(() => {
          if (!cancelado) {
            setEstado((current) => {
              if (current === "verificando") {
                setErrorMensaje(
                  "El enlace de recuperación es inválido, no contiene un código de seguridad o ha expirado."
                );
                return "invalido";
              }
              return current;
            });
          }
        }, 1500);
        return;
      }

      // 6. Si no hay token_hash, ni code ni hash de recuperación en esta visita, el enlace es inválido de inmediato
      // (incluso si hay sesión abierta ordinaria en el navegador)
      if (!cancelado) {
        setEstado("invalido");
        setErrorMensaje(
          "El enlace de recuperación es inválido, no contiene un código de seguridad o ha expirado."
        );
      }
    }

    verificarAcceso();

    return () => {
      cancelado = true;
      if (subscription) subscription.unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [searchParams, estado]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (nuevaPassword.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setFormError("Las contraseñas no coinciden. Por favor verifícalas.");
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();

      // Actualizar contraseña mediante Server Action
      const res = await actualizarPasswordRecuperacionAction(nuevaPassword);

      if (!res.ok) {
        // Intento secundario directo mediante cliente del navegador si la Server Action
        // no compartió la cookie de sesión de recuperación
        const { error: clientError } = await supabase.auth.updateUser({
          password: nuevaPassword,
        });

        if (clientError) {
          setFormError(
            clientError.message ||
              "No fue posible restablecer la contraseña. El enlace puede haber vencido."
          );
          return;
        }
      }

      // Cerrar la sesión de recuperación de forma segura en cliente y servidor
      await supabase.auth.signOut();

      setEstado("exito");

      // Redirigir a /login con aviso de éxito
      setTimeout(() => {
        window.location.href = "/login?reset=success";
      }, 1200);
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl shadow-2xl backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Encabezado */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BrandLogo size="md" theme="dark" withSubtitle={false} />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Restablecer Contraseña
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Ingresa tu nueva contraseña para recuperar el acceso a tu cuenta.
          </p>
        </div>

        {/* 1. Estado: Verificando enlace */}
        {estado === "verificando" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
            <p className="text-sm text-slate-300">
              Verificando enlace de seguridad...
            </p>
            <p className="text-xs text-slate-500">
              Por favor espera un instante mientras validamos tu sesión de recuperación.
            </p>
          </div>
        )}

        {/* 2. Estado: Enlace Inválido o Vencido */}
        {estado === "invalido" && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="block text-rose-300 font-semibold text-sm">
                  Enlace inválido o expirado
                </strong>
                <p className="leading-relaxed">
                  {errorMensaje ||
                    "El enlace para restablecer tu contraseña no es válido o ha caducado. Los enlaces tienen vigencia limitada y solo pueden utilizarse una sola vez."}
                </p>
              </div>
            </div>

            {/* Si el usuario ya tiene sesión abierta ordinaria pero no vino con código de recuperación */}
            {haySesionAbierta && (
              <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs space-y-2">
                <p className="font-semibold text-sky-300">
                  ¿Tienes tu sesión iniciada?
                </p>
                <p className="text-slate-300 leading-relaxed">
                  Puedes cambiar tu contraseña directamente desde tu perfil ingresando tu contraseña actual.
                </p>
                <Link
                  href="/perfil"
                  className="inline-flex items-center gap-1.5 font-bold text-sky-400 hover:text-sky-300 underline pt-1 cursor-pointer"
                >
                  Ir a Mi Perfil para cambiar contraseña &rarr;
                </Link>
              </div>
            )}

            <div className="space-y-3">
              <Link
                href="/recuperar-contrasena"
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-sm shadow-lg shadow-orange-500/25 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Solicitar un Nuevo Enlace</span>
              </Link>

              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-700/80 hover:border-slate-600 bg-slate-800/40 hover:bg-slate-800/80 text-xs font-semibold text-slate-300 transition-all text-center"
              >
                <span>Volver a Iniciar Sesión</span>
              </Link>
            </div>
          </div>
        )}

        {/* 3. Estado: Formulario de Nueva Contraseña */}
        {estado === "listo" && (
          <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-200">
            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-3 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-rose-300 font-semibold mb-0.5">
                    Error al actualizar
                  </strong>
                  <span>{formError}</span>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="nuevaPassword"
                className="block text-xs font-semibold text-slate-300 mb-1.5"
              >
                Nueva Contraseña (mínimo 8 caracteres) <span className="text-orange-400">*</span>
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="nuevaPassword"
                  name="nuevaPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  disabled={isPending}
                  className="w-full pl-10 pr-11 py-2.5 min-h-[44px] bg-slate-950/90 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none cursor-pointer"
                  title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmarPassword"
                className="block text-xs font-semibold text-slate-300 mb-1.5"
              >
                Confirmar Contraseña <span className="text-orange-400">*</span>
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirmarPassword"
                  name="confirmarPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={confirmarPassword}
                  onChange={(e) => setConfirmarPassword(e.target.value)}
                  disabled={isPending}
                  className="w-full pl-10 pr-4 py-2.5 min-h-[44px] bg-slate-950/90 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full mt-2 min-h-[46px] px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando nueva contraseña...</span>
                </>
              ) : (
                <>
                  <span>Guardar Nueva Contraseña</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* 4. Estado: Éxito */}
        {estado === "exito" && (
          <div className="py-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-500/15 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white">
              ¡Contraseña Restablecida!
            </h2>
            <p className="text-xs text-slate-400">
              Cerrando sesión de recuperación y redirigiendo a la pantalla de inicio de sesión...
            </p>
          </div>
        )}

        {/* Garantía de Seguridad */}
        <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-center gap-2 text-[11px] text-slate-400 text-center">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Acceso cifrado y revocación automática de sesiones previas</span>
        </div>
      </div>
    </div>
  );
}

export default function RestablecerContrasenaPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white relative">
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(249,115,22,0.15),rgba(255,255,255,0))]" />

      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <BrandLogo size="sm" theme="dark" href="/" />

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/login"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-6">
        <Suspense
          fallback={
            <div className="p-8 text-center text-slate-400 text-sm">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-orange-500" />
              Cargando verificador...
            </div>
          }
        >
          <RestablecerContrasenaContent />
        </Suspense>
      </main>

      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/60 py-4 px-4 text-center text-xs text-slate-400">
        <span>© {new Date().getFullYear()} RestauraCore. Todos los derechos reservados.</span>
      </footer>
    </div>
  );
}

