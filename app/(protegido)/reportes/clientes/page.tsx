import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { tienePermisoPlan } from "@/lib/planes";
import { obtenerClientesTelegram } from "@/lib/telegram-clientes";
import { ClientesTelegramClient } from "./clientes-client";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";

export const metadata = {
  title: "Retención y Recuperación de Clientes vía Telegram",
  description: "Monitorea comensales registrados vía QR y envía mensajes de reactivación personalizados.",
};

export default async function ClientesTelegramPage() {
  const { user, restauranteActivo } = await getProtectedLayoutData();

  const esEnterprise = tienePermisoPlan(restauranteActivo.plan, "telegram_recuperacion");

  let clientes: any[] = [];
  let inactivos = 0;
  let total = 0;

  if (esEnterprise) {
    const res = await obtenerClientesTelegram(restauranteActivo.id, 21);
    clientes = res.clientes;
    inactivos = res.inactivos;
    total = res.total;
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Marketing & Fidelización
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <MessageSquare className="w-7 h-7 text-orange-600" />
            <span>Retención de Clientes (Telegram)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Base de comensales que escanearon el QR de mesa y conectaron su Telegram. Detección automática de clientes en riesgo de no volver.
          </p>
        </div>
      </div>

      <ClientesTelegramClient
        iniciales={clientes}
        diasInactividadInicial={21}
        restauranteNombre={restauranteActivo.nombre}
        restauranteId={restauranteActivo.id}
        bloqueadoPorPlan={!esEnterprise}
      />
    </div>
  );
}

