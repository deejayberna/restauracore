"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Turnstile } from "@/components/ui/Turnstile";
import { solicitarRecuperacionAction } from "@/lib/recuperacion-actions";

const MENSAJE_FALLBACK =
  "Si ese correo tiene una cuenta, te enviaremos un enlace para restablecer tu contraseña";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(
    undefined
  );
  const [turnstileIntentos, setTurnstileIntentos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [solicitudEnviada, setSolicitudEnviada] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await solicitarRecuperacionAction({
        email,
        turnstileToken,
      });

      if (res.error) {
        setError(res.error);
        setTurnstileToken(undefined);
        setTurnstileIntentos((prev) => prev + 1);
      } else {
        setSolicitudEnviada(res.mensaje || MENSAJE_FALLBACK);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white relative">
      {/* Fondo con gradiente y destellos */}
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(249,115,22,0.15),rgba(255,255,255,0))]" />

      {/* Header simple */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <BrandLogo size="sm" theme="dark" href="/" />

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Iniciar Sesión</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Contenido Central */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-6">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl shadow-2xl backdrop-blur-xl p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Encabezado */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <BrandLogo
                  size="md"
                  theme="dark"
                  withSubtitle={false}
                />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Recuperación de Contraseña
              </h1>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Ingresa el correo electrónico asociado a tu cuenta para recibir un enlace de restablecimiento.
              </p>
            </div>

            {/* Estado: Éxito / Solicitud Enviada */}
            {solicitudEnviada ? (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block text-emerald-300 font-semibold">
                      Solicitud procesada
                    </strong>
                    <p className="leading-relaxed">{solicitudEnviada}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 space-y-2">
                  <p>
                    Revisa tu bandeja de entrada y la carpeta de correo no deseado (spam). El enlace expira tras un periodo de seguridad.
                  </p>
                </div>

                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-sm shadow-lg shadow-orange-500/25 transition-all"
                >
                  <span>Volver a Iniciar Sesión</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              /* Formulario */
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-3 animate-in fade-in duration-150">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-rose-300 font-semibold mb-0.5">
                        Error en la solicitud
                      </strong>
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold text-slate-300 mb-1.5"
                  >
                    Correo Electrónico <span className="text-orange-400">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3.5 pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="tucorreo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isPending}
                      className="w-full pl-10 pr-4 py-2.5 min-h-[44px] bg-slate-950/90 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Cloudflare Turnstile */}
                <div className="py-1">
                  <Turnstile
                    key={turnstileIntentos}
                    onVerify={(token) => setTurnstileToken(token)}
                    onError={() => setTurnstileToken(undefined)}
                    onExpire={() => setTurnstileToken(undefined)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full mt-2 min-h-[46px] px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando enlace...</span>
                    </>
                  ) : (
                    <>
                      <span>Enviar Enlace de Recuperación</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <Link
                    href="/login"
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    ¿Recordaste tu contraseña?{" "}
                    <span className="text-orange-400 hover:text-orange-300 font-semibold">
                      Iniciar Sesión
                    </span>
                  </Link>
                </div>
              </form>
            )}

            {/* Garantía de Seguridad */}
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-center gap-2 text-[11px] text-slate-400 text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Verificación anti-bot y enlace cifrado temporal</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer simple */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/60 py-4 px-4 text-center text-xs text-slate-400">
        <span>© {new Date().getFullYear()} RestauraCore. Todos los derechos reservados.</span>
      </footer>
    </div>
  );
}

