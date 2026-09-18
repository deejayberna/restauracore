"use client";

import React, { useState, useTransition } from "react";
import { Lock, Sparkles, CheckCircle2, ArrowRight, ShieldCheck, LogOut, Store } from "lucide-react";
import { PLANES_DETALLE, type Plan } from "@/lib/planes";
import { crearSesionCheckoutMembresiaAction } from "@/lib/stripe-billing-actions";
import { logoutAction } from "@/lib/auth-actions";

interface PantallaPaywallMembresiaProps {
  restauranteId: string;
  nombreRestaurante: string;
  motivoBloqueo: "trial_vencido" | "pago_fallido" | "cancelada" | null;
  planActual: Plan;
}

export function PantallaPaywallMembresia({
  restauranteId,
  nombreRestaurante,
  motivoBloqueo,
  planActual,
}: PantallaPaywallMembresiaProps) {
  const [isPending, startTransition] = useTransition();
  const [planSeleccionado, setPlanSeleccionado] = useState<Plan>(planActual);
  const [error, setError] = useState<string | null>(null);

  const handleContratar = (plan: Plan) => {
    setError(null);
    startTransition(async () => {
      const res = await crearSesionCheckoutMembresiaAction({
        restauranteId,
        plan,
      });

      if (res.error) {
        setError(res.error);
      } else if (res.url) {
        window.location.href = res.url;
      }
    });
  };

  const titulo =
    motivoBloqueo === "pago_fallido"
      ? "Actualización de Pago Requerida"
      : motivoBloqueo === "cancelada"
      ? "Membresía Cancelada"
      : "Tu Periodo de Prueba de 14 Días ha Finalizado";

  const descripcion =
    motivoBloqueo === "pago_fallido"
      ? `El último cobro de suscripción para ${nombreRestaurante} no pudo procesarse. Actualiza tu método de pago para reactivar el servicio.`
      : `El plazo de 14 días gratuitos para ${nombreRestaurante} ha concluido. Para continuar operando tu cocina, mesas, comandas e inventarios sin interrupciones, elige tu plan y adquiere tu membresía.`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-900 px-4 py-8 sm:px-6">
      <div className="max-w-6xl mx-auto w-full">
        {/* Cabecera de Alerta */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 mb-4 shadow-xs">
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <span>Acceso Pausado · Membresía Requerida</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            {titulo}
          </h1>

          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
            {descripcion}
          </p>

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Tarjetas de Planes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {(["basico", "pro", "enterprise"] as Plan[]).map((pKey) => {
            const planInfo = PLANES_DETALLE[pKey];
            const esSeleccionado = planSeleccionado === pKey;
            const esDestacado = planInfo.destacado;

            return (
              <div
                key={pKey}
                onClick={() => setPlanSeleccionado(pKey)}
                className={`relative flex flex-col justify-between rounded-2xl p-6 sm:p-7 transition-all cursor-pointer bg-white border-2 ${
                  esSeleccionado
                    ? "border-orange-600 shadow-lg ring-2 ring-orange-600/20"
                    : esDestacado
                    ? "border-orange-300 shadow-md"
                    : "border-slate-200 hover:border-slate-300 shadow-xs"
                }`}
              >
                {esDestacado && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-bold bg-orange-600 text-white tracking-wide uppercase shadow-xs">
                    Recomendado
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-slate-900">{planInfo.nombre}</h3>
                    {esSeleccionado && (
                      <CheckCircle2 className="w-5 h-5 text-orange-600 shrink-0" />
                    )}
                  </div>

                  <p className="text-xs text-slate-500 min-h-[36px] mb-4">
                    {planInfo.descripcion}
                  </p>

                  <div className="mb-6">
                    <span className="text-3xl font-extrabold text-slate-900">
                      ${planInfo.precioMensual}
                    </span>
                    <span className="text-xs text-slate-500 font-medium ml-1">MXN / mes</span>
                  </div>

                  <div className="space-y-2.5 pt-4 border-t border-slate-100 mb-6">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Incluye:
                    </p>
                    {planInfo.caracteristicas.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContratar(pKey);
                  }}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    esSeleccionado
                      ? "bg-orange-600 hover:bg-orange-700 text-white shadow-md"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
                  } disabled:opacity-50`}
                >
                  {isPending && planSeleccionado === pKey ? (
                    <span>Conectando con Stripe...</span>
                  ) : (
                    <>
                      <span>Adquirir Plan {planInfo.nombre}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer y Salida */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-slate-400" />
            <span>
              Restaurante: <strong className="text-slate-700">{nombreRestaurante}</strong>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => logoutAction()}
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

