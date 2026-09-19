"use client";

import React, { useState } from "react";
import { ModalReciboPago } from "./ModalReciboPago";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Receipt, Printer, Search } from "lucide-react";

export interface OrdenPagadaResumen {
  id: string;
  total: string;
  creado_en: string | Date;
  mesa_numero: number | null;
}

interface SeccionRecibosCajaProps {
  ordenesRecientes: OrdenPagadaResumen[];
}

export function SeccionRecibosCaja({ ordenesRecientes }: SeccionRecibosCajaProps) {
  const [selectedOrdenId, setSelectedOrdenId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busquedaOrden, setBusquedaOrden] = useState("");

  function abrirRecibo(ordenId: string) {
    setSelectedOrdenId(ordenId);
    setModalOpen(true);
  }

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    const id = busquedaOrden.trim();
    if (id) {
      abrirRecibo(id);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Recibos de Cobro y Comprobantes Térmicos
              </CardTitle>
              <CardDescription>
                Emisión de comprobante simple no fiscal en formato 80mm para clientes.
              </CardDescription>
            </div>

            {/* Buscador de orden por ID o folio */}
            <form onSubmit={handleBuscar} className="flex gap-2">
              <input
                type="text"
                value={busquedaOrden}
                onChange={(e) => setBusquedaOrden(e.target.value)}
                placeholder="ID de Orden..."
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              />
              <Button type="submit" variant="secondary" size="sm" className="flex items-center gap-1">
                <Search className="w-3.5 h-3.5" />
                Buscar
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ordenesRecientes.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No hay órdenes cobradas recientemente en esta sucursal.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {ordenesRecientes.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success" size="sm">
                        COBRADA
                      </Badge>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {ord.mesa_numero ? `Mesa ${ord.mesa_numero}` : "Para llevar"}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        ORD-{ord.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(ord.creado_en).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      • Total:{" "}
                      <strong className="text-slate-700 dark:text-slate-300 font-mono">
                        ${parseFloat(ord.total).toFixed(2)}
                      </strong>
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => abrirRecibo(ord.id)}
                    className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir Recibo
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedOrdenId && (
        <ModalReciboPago
          ordenId={selectedOrdenId}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedOrdenId(null);
          }}
        />
      )}
    </>
  );
}

