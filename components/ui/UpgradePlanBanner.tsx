"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { Plan, Feature, FEATURE_PLAN_MINIMO, PLANES_DETALLE } from "@/lib/planes";

interface Props {
  feature: Feature;
  titulo?: string;
  descripcion?: string;
}

export function UpgradePlanBanner({ feature, titulo, descripcion }: Props) {
  const planMinimoId = FEATURE_PLAN_MINIMO[feature];
  const infoPlan = PLANES_DETALLE[planMinimoId];

  return (
    <div className="rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50/80 via-white to-orange-50/50 p-6 sm:p-8 shadow-sm text-neutral-900">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Exclusivo de Plan {infoPlan.nombre}</span>
          </div>

          <h3 className="text-xl font-bold tracking-tight text-neutral-900">
            {titulo || `Desbloquea esta funcionalidad con el Plan ${infoPlan.nombre}`}
          </h3>

          <p className="text-sm text-neutral-600 leading-relaxed">
            {descripcion ||
              `Esta característica requiere el plan ${infoPlan.nombre} (${infoPlan.precioTexto}). Actualiza tu suscripción desde la configuración de tu restaurante para activarla al instante.`}
          </p>

          <div className="pt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
            {infoPlan.caracteristicas.slice(0, 3).map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-white/80 border border-neutral-200 px-2.5 py-1 rounded-md">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 w-full sm:w-auto">
          <Link
            href="/restaurante/configuracion"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm transition-colors shadow-sm"
          >
            <span>Gestionar Suscripción</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

