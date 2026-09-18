"use client";

import React, { useState } from "react";
import { Coins, DollarSign, CreditCard, Send, Printer, User, Calendar } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui/Table";
import type { ReportePropinasTurno } from "@/lib/pagos-actions";

export interface TurnoOpcion {
  id: string;
  estado: string;
  fecha_inicio: Date | string;
  fecha_cierre?: Date | string | null;
  responsable_nombre?: string | null;
}

export function PropinasView({
  reporteInicial,
  turnosDisponibles,
  turnoSeleccionadoId,
}: {
  reporteInicial: ReportePropinasTurno | null;
  turnosDisponibles: TurnoOpcion[];
  turnoSeleccionadoId: string;
}) {
  const [turnoId, setTurnoId] = useState(turnoSeleccionadoId);

  function handleTurnoChange(newId: string) {
    setTurnoId(newId);
    window.location.href = `/caja/propinas?turno_id=${newId}`;
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* ─── ENCABEZADO ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-amber-500" />
            Reporte de Propinas por Turno
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Desglose analítico de propinas acumuladas por mesero y método de pago para el reparto de
            caja.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {turnosDisponibles.length > 0 && (
            <select
              value={turnoId}
              onChange={(e) => handleTurnoChange(e.target.value)}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none"
            >
              {turnosDisponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  Turno ({t.estado.toUpperCase()}) -{" "}
                  {new Date(t.fecha_inicio).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="outline"
            size="md"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
          >
            Imprimir Corte
          </Button>
        </div>
      </div>

      {/* ─── ENCABEZADO DE IMPRESIÓN (Visible solo al imprimir) ──────────────── */}
      <div className="hidden print:block mb-6 border-b pb-4">
        <h2 className="text-xl font-bold">Restauracore — Corte Oficial de Propinas</h2>
        <p className="text-xs text-gray-600">Turno ID: {turnoId}</p>
        <p className="text-xs text-gray-600">
          Fecha de generación: {new Date().toLocaleString()}
        </p>
      </div>

      {/* ─── TARJETAS DE TOTALES ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-amber-500/10 border-amber-200 dark:border-amber-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1.5">
              <Coins className="w-4 h-4" />
              Total Propinas Recaudadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-700 dark:text-amber-300">
              ${reporteInicial?.totales.global.toFixed(2) ?? "0.00"}
            </div>
            <p className="text-[11px] text-amber-800/70 dark:text-amber-400/70 mt-1">
              Todos los métodos combinados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-slate-500 font-semibold flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Propinas en Efectivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              ${reporteInicial?.totales.efectivo.toFixed(2) ?? "0.00"}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Disponible en caja física</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-slate-500 font-semibold flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-sky-600" />
              Propinas en Tarjeta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              ${reporteInicial?.totales.tarjeta.toFixed(2) ?? "0.00"}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Vía terminal bancaria / TPV</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-slate-500 font-semibold flex items-center gap-1.5">
              <Send className="w-4 h-4 text-purple-600" />
              Propinas en Transferencia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              ${reporteInicial?.totales.transferencia.toFixed(2) ?? "0.00"}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Transferencias electrónicas directas</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── TABLA DE DISTRIBUCIÓN POR MESERO ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Distribución Individual por Mesero</CardTitle>
          <CardDescription>
            Propinas registradas en las cuentas y mesas atendidas durante este turno.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!reporteInicial || reporteInicial.meseros.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No hay propinas registradas en este turno aún.
            </div>
          ) : (
            <TableContainer className="border-0 rounded-none">
              <TableHead>
                <tr>
                  <TableHeaderCell>Mesero</TableHeaderCell>
                  <TableHeaderCell>Efectivo</TableHeaderCell>
                  <TableHeaderCell>Tarjeta</TableHeaderCell>
                  <TableHeaderCell>Transferencia</TableHeaderCell>
                  <TableHeaderCell className="text-right">Total a Entregar</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {reporteInicial.meseros.map((item) => (
                  <TableRow key={item.mesero_id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-200 shrink-0">
                          {item.mesero_nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {item.mesero_nombre}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        ${item.propina_efectivo.toFixed(2)}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        ${item.propina_tarjeta.toFixed(2)}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        ${item.propina_transferencia.toFixed(2)}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                        ${item.total_propina.toFixed(2)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
