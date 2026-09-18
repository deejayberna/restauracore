"use client";

import React, { useState } from "react";
import { Bell, AlertTriangle, XCircle, Package, ShoppingCart, ArrowRight } from "lucide-react";
import Link from "next/link";

export interface NotificationCounts {
  totalAlertas: number;
  cancelacionesPendientes: number;
  mermasRevision: number;
  incidenciasCompras: number;
  stockBajo: number;
}

export function NotificationBell({
  counts,
}: {
  counts: NotificationCounts;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="touch-target relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label={`Notificaciones (${counts.totalAlertas} pendientes)`}
      >
        <Bell className="w-5 h-5" />
        {counts.totalAlertas > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {counts.totalAlertas > 99 ? "99+" : counts.totalAlertas}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Centro de Alertas
              </span>
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/80 px-2 py-0.5 rounded-full">
                {counts.totalAlertas} pendientes
              </span>
            </div>

            <div className="p-2 space-y-1 divide-y divide-slate-100 dark:divide-slate-800">
              {counts.cancelacionesPendientes > 0 && (
                <Link
                  href="/cancelaciones"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <XCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Cancelaciones de Platillos
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {counts.cancelacionesPendientes} solicitud(es) pendientes
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Link>
              )}

              {counts.mermasRevision > 0 && (
                <Link
                  href="/notificaciones"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors pt-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Mermas sobre Umbral
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {counts.mermasRevision} requieren revisión fotográfica
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Link>
              )}

              {counts.incidenciasCompras > 0 && (
                <Link
                  href="/compras"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors pt-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <ShoppingCart className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Incidencias de Compras
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {counts.incidenciasCompras} pedidos con faltantes
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Link>
              )}

              {counts.stockBajo > 0 && (
                <Link
                  href="/inventario"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors pt-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Stock Mínimo Crítico
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {counts.stockBajo} ingrediente(s) por agotarse
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Link>
              )}

              {counts.totalAlertas === 0 && (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-xs">
                  <p>🎉 Sin alertas pendientes de atender.</p>
                </div>
              )}
            </div>

            <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <Link
                href="/notificaciones"
                onClick={() => setIsOpen(false)}
                className="w-full block py-2 text-center text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
              >
                Ver todas las notificaciones
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

