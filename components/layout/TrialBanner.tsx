"use client";

import React from "react";
import Link from "next/link";
import { Clock, ArrowRight, ShieldAlert } from "lucide-react";

interface TrialBannerProps {
  diasRestantes: number;
  fechaFinTrial: string | null;
}

export function TrialBanner({ diasRestantes, fechaFinTrial }: TrialBannerProps) {
  const fechaTexto = fechaFinTrial
    ? new Date(fechaFinTrial).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
      })
    : "";

  const mensajeDias =
    diasRestantes === 1
      ? "¡Último día! Tu prueba gratuita de 14 días vence hoy."
      : `Tu prueba gratuita de 14 días vence en ${diasRestantes} días${fechaTexto ? ` (${fechaTexto})` : ""}.`;

  return (
    <div className="w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-4 py-2.5 shadow-sm text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <Clock className="w-4 h-4 shrink-0 animate-pulse" />
          <span className="font-medium">
            <strong className="font-bold">Aviso de vencimiento:</strong> {mensajeDias}{" "}
            Adquiere tu membresía para mantener el servicio activo sin interrupciones.
          </span>
        </div>

        <Link
          href="/restaurante/configuracion"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-orange-700 hover:bg-orange-50 font-bold text-xs transition-colors shadow-xs"
        >
          <span>Adquirir Membresía</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

