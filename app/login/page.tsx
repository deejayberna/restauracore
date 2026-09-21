"use client";

import React, { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/lib/auth-actions";
import {
  UtensilsCrossed,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  Building2,
  CheckCircle2,
  Clock,
} from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Tarjeta Principal de Login */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl shadow-2xl backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden">
        {/* Glow decorativo sutil en la esquina superior */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Encabezado del Formulario */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/25 mb-3">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Restaura<span className="text-orange-500">Core</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sistema Integral ERP para Restaurantes y Administración
          </p>
        </div>

        {/* Alerta de Redirección por Autorización */}
        {errorParam === "unauthorized" && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-amber-300 font-semibold mb-0.5">
                Acceso Administrativo Requerido
              </strong>
              <span>
                Para ingresar al panel, inicia sesión con tus credenciales autorizadas de <strong>Super-Admin</strong> o personal de restaurante.
              </span>
            </div>
          </div>
        )}

        {errorParam === "sesion_expirada" && (
          <div className="mb-5 p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs flex items-start gap-3">
            <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-sky-300 font-semibold mb-0.5">
                Sesión Finalizada
              </strong>
              <span>Tu sesión anterior ha expirado. Por favor ingresa nuevamente.</span>
            </div>
          </div>
        )}

        {/* Alerta de Error de Autenticación */}
        {state?.error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-3 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-rose-300 font-semibold mb-0.5">
                Error de Acceso
              </strong>
              <span>{state.error}</span>
            </div>
          </div>
        )}

        {/* Formulario */}
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Correo Electrónico <span className="text-orange-400">*</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="ejemplo@restauracore.com"
                disabled={pending}
                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Contraseña <span className="text-orange-400">*</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                disabled={pending}
                className="w-full pl-10 pr-11 py-2.5 min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 p-1 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full mt-2 min-h-[46px] px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {pending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verificando credenciales...</span>
              </>
            ) : (
              <>
                <span>Ingresar al Sistema</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Separador */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase font-bold tracking-wider">
            <span className="bg-slate-900 px-3 text-slate-500">
              Nuevo en la plataforma
            </span>
          </div>
        </div>

        {/* Enlace de Registro */}
        <div className="text-center">
          <Link
            href="/registro"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border border-slate-700/80 hover:border-slate-600 bg-slate-800/40 hover:bg-slate-800/80 text-xs font-semibold text-slate-200 transition-all"
          >
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span>Crear cuenta de restaurante (14 días gratis)</span>
          </Link>
        </div>

        {/* Garantía de Seguridad */}
        <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-center gap-2 text-[11px] text-slate-400 text-center">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Acceso cifrado SSL • Segregación estricta multi-tenant</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white relative">
      {/* Fondo con gradiente y destellos */}
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(249,115,22,0.15),rgba(255,255,255,0))]" />

      {/* Header simple */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="h-4 w-4" />
            </div>
            <span className="text-base font-black text-white">
              Restaura<span className="text-orange-500">Core</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/"
              className="text-slate-400 hover:text-white transition-colors hidden sm:inline"
            >
              Inicio
            </Link>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <Link
              href="/precios"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Planes & Precios
            </Link>
            <Link
              href="/registro"
              className="px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-semibold border border-orange-500/30 transition-colors"
            >
              Probar Gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Contenido Central */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-6">
        <Suspense
          fallback={
            <div className="w-full max-w-md mx-auto bg-slate-900/80 border border-slate-800 p-8 rounded-2xl animate-pulse">
              <div className="h-12 w-12 bg-slate-800 rounded-xl mx-auto mb-4" />
              <div className="h-6 w-32 bg-slate-800 rounded mx-auto mb-2" />
              <div className="h-4 w-48 bg-slate-800 rounded mx-auto mb-6" />
              <div className="h-10 bg-slate-800 rounded-xl mb-4" />
              <div className="h-10 bg-slate-800 rounded-xl mb-4" />
              <div className="h-11 bg-slate-800 rounded-xl" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </main>

      {/* Footer simple */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/60 py-4 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} RestauraCore. Todos los derechos reservados.</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Soporte 24/7</span>
            <span>•</span>
            <span>Infraestructura Cloud</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
