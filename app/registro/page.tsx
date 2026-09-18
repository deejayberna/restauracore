"use client";

import React, { useState, useTransition, use } from "react";
import Link from "next/link";
import {
  UtensilsCrossed,
  ShieldCheck,
  Lock,
  ArrowRight,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { PLANES_DETALLE, type Plan } from "@/lib/planes";
import { registrarRestauranteDirectoAction, type RegistroInput } from "@/lib/registro-actions";

export default function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; cancelado?: string }>;
}) {
  const params = use(searchParams);
  const planInicial: Plan =
    params.plan === "pro" || params.plan === "enterprise" ? (params.plan as Plan) : "basico";

  const [plan, setPlan] = useState<Plan>(planInicial);
  const [nombreRestaurante, setNombreRestaurante] = useState("");
  const [direccion, setDireccion] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [nombreDueno, setNombreDueno] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const input: RegistroInput = {
      nombreRestaurante,
      direccion,
      timezone,
      nombreDueno,
      email,
      password,
      plan,
    };

    startTransition(async () => {
      const res = await registrarRestauranteDirectoAction(input);
      if (res.error) {
        setError(res.error);
      } else if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      }
    });
  };

  const planSeleccionado = PLANES_DETALLE[plan];

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-between text-neutral-900">
      {/* Header simple */}
      <header className="border-b border-neutral-200 bg-white py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white">
              <UtensilsCrossed className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">
              Restaura<span className="text-orange-600">Core</span>
            </span>
          </Link>
          <div className="text-sm text-neutral-500">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="text-center max-w-xl mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>14 Días de Prueba Gratuita · Sin Tarjeta Bancaria</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
            Registra tu Restaurante
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Crea tu cuenta de dueño y comienza a operar hoy mismo. Sin ingresar tarjeta de crédito ni compromisos.
          </p>
        </div>

        {params.cancelado && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              El proceso de suscripción en Stripe fue cancelado. Puedes revisar tus datos y volver a
              intentarlo cuando gustes.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 1. Selección de Plan */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-neutral-200 shadow-xs">
            <label className="block text-sm font-bold text-neutral-900 mb-4">
              1. Selecciona tu Plan (Prueba 14 días gratis)
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["basico", "pro", "enterprise"] as const).map((pKey) => {
                const p = PLANES_DETALLE[pKey];
                const isSelected = plan === pKey;
                return (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => setPlan(pKey)}
                    className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-orange-600 bg-orange-50/40 shadow-xs"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-neutral-900">{p.nombre}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-orange-600" />}
                    </div>
                    <div className="text-lg font-extrabold text-neutral-900 mb-1">
                      ${p.precioMensual} <span className="text-xs font-normal text-neutral-500">MXN/mes</span>
                    </div>
                    <p className="text-xs text-neutral-500 line-clamp-2">{p.descripcion}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Datos del Restaurante */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-neutral-900 mb-2">2. Datos de tu Restaurante</h2>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Nombre del Restaurante *
              </label>
              <input
                type="text"
                required
                value={nombreRestaurante}
                onChange={(e) => setNombreRestaurante(e.target.value)}
                placeholder="Ej. Taquería El Pastor Feliz"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Dirección o Sucursal (Opcional)
                </label>
                <input
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej. Av. Insurgentes Sur 1234, CDMX"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Zona Horaria
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
                  <option value="America/Monterrey">Monterrey (GMT-6)</option>
                  <option value="America/Cancun">Cancún / Quintana Roo (GMT-5)</option>
                  <option value="America/Tijuana">Tijuana / Baja California (GMT-8)</option>
                  <option value="America/Hermosillo">Hermosillo / Sonora (GMT-7)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. Datos del Dueño */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-neutral-900 mb-2">3. Cuenta de Acceso (Dueño)</h2>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Nombre Completo del Dueño / Administrador *
              </label>
              <input
                type="text"
                required
                value={nombreDueno}
                onChange={(e) => setNombreDueno(e.target.value)}
                placeholder="Ej. Carlos Mendoza"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carlos@mirestaurante.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Contraseña (mínimo 8 caracteres) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Resumen y Botón de Checkout */}
          <div className="p-6 rounded-2xl bg-linear-to-br from-neutral-900 to-neutral-800 text-white shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-neutral-700">
              <div>
                <div className="text-xs uppercase tracking-wider text-orange-400 font-bold">
                  Resumen de tu suscripción
                </div>
                <div className="text-xl font-bold mt-0.5">
                  Plan {planSeleccionado.nombre} — 14 días de prueba gratis
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-white">$0.00 MXN</div>
                <div className="text-xs text-neutral-400">
                  después ${planSeleccionado.precioMensual} MXN/mes
                </div>
              </div>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Sin tarjeta requerida. Disfruta de 14 días con acceso completo a todas las funcionalidades del Plan {planSeleccionado.nombre}. Al finalizar el plazo, podrás decidir si deseas contratar tu membresía para continuar operando.
            </p>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-4 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-base flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              {isPending ? (
                <span>Creando cuenta y activando prueba...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-orange-200" />
                  <span>Comenzar Mis 14 Días Gratis</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      <footer className="border-t border-neutral-200 bg-white py-6 text-center text-xs text-neutral-400">
        RestauraCore SaaS — Transacciones protegidas con cifrado TLS y Stripe
      </footer>
    </div>
  );
}

