"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Search,
  Filter,
  Eye,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui/Table";
import { useRouter } from "next/navigation";

export interface FilaAuditoriaUI {
  id: string;
  accion: string;
  tabla_afectada: string | null;
  registro_id: string | null;
  valores_anteriores: any;
  valores_nuevos: any;
  timestamp: Date | string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
}

export function AuditoriaView({
  filas,
  total,
  page,
  pageSize,
  totalPages,
  tipoActual,
  desdeActual,
  hastaActual,
}: {
  filas: FilaAuditoriaUI[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  tipoActual?: string;
  desdeActual?: string;
  hastaActual?: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState(tipoActual || "todos");
  const [desde, setDesde] = useState(desdeActual || "");
  const [hasta, setHasta] = useState(hastaActual || "");

  // Modal detalles
  const [modalDetalleOpen, setModalDetalleOpen] = useState(false);
  const [filaDetalle, setFilaDetalle] = useState<FilaAuditoriaUI | null>(null);

  function handleFiltrar(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (tipo && tipo !== "todos") params.set("tipo", tipo);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    params.set("page", "1");
    router.push(`/auditoria?${params.toString()}`);
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/auditoria?${params.toString()}`);
  }

  function getBadgeVariant(accion: string): "danger" | "warning" | "info" | "neutral" {
    if (
      accion.startsWith("ANOMALIA_") ||
      accion.startsWith("INTENTO_NO_AUTORIZADO_") ||
      accion.startsWith("FALLO_ENVIO_")
    ) {
      return "danger";
    }
    if (accion.includes("CANCELACION") || accion.includes("INCIDENCIA") || accion.includes("DESCUADRE")) {
      return "warning";
    }
    if (accion.includes("PERSONAL") || accion.includes("ROL")) {
      return "info";
    }
    return "neutral";
  }

  return (
    <div className="space-y-6">
      {/* ─── ENCABEZADO ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <ShieldAlert className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          Visor de Auditoría y Seguridad
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Registro inmutable de acciones críticas, intentos no autorizados, mermas y modificaciones
          financieras (Exclusivo para Dueños).
        </p>
      </div>

      {/* ─── FORMULARIO DE FILTROS ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <form
            onSubmit={handleFiltrar}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tipo de Evento
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs py-2 px-3 outline-none"
              >
                <option value="todos">Todos los eventos</option>
                <option value="anomalias">🚨 Anomalías y Fallos</option>
                <option value="seguridad">🛑 Intentos No Autorizados</option>
                <option value="caja">💵 Caja y Pagos</option>
                <option value="personal">👥 Personal y Permisos</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs py-2 px-3 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs py-2 px-3 outline-none"
              />
            </div>

            <div>
              <Button type="submit" size="sm" className="w-full">
                <Search className="w-3.5 h-3.5 mr-1" /> Filtrar Registros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ─── TABLA DE AUDITORÍA ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm">Registro de Eventos</CardTitle>
            <CardDescription>{total} registro(s) encontrados en la consulta</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filas.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No se encontraron registros con los filtros seleccionados.
            </div>
          ) : (
            <TableContainer className="border-0 rounded-none">
              <TableHead>
                <tr>
                  <TableHeaderCell>Acción / Evento</TableHeaderCell>
                  <TableHeaderCell>Actor (Usuario)</TableHeaderCell>
                  <TableHeaderCell>Tabla / ID Afectado</TableHeaderCell>
                  <TableHeaderCell>Fecha y Hora</TableHeaderCell>
                  <TableHeaderCell className="text-right">Detalle</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell>
                      <Badge variant={getBadgeVariant(fila.accion)} size="sm">
                        {fila.accion}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {fila.usuario_nombre ? (
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {fila.usuario_nombre}
                          </p>
                          <p className="text-[11px] text-slate-400">{fila.usuario_email}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sistema / Anónimo</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                        {fila.tabla_afectada}
                      </span>
                      {fila.registro_id && (
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-[120px]">
                          {fila.registro_id}
                        </p>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {new Date(fila.timestamp).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Eye className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setFilaDetalle(fila);
                          setModalDetalleOpen(true);
                        }}
                      >
                        Inspeccionar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableContainer>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>
                Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({total} total)
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  icon={<ChevronLeft className="w-3.5 h-3.5" />}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  icon={<ChevronRight className="w-3.5 h-3.5" />}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── MODAL DETALLE DE AUDITORÍA ─────────────────────────────────────── */}
      <Modal
        isOpen={modalDetalleOpen}
        onClose={() => setModalDetalleOpen(false)}
        title={`Inspección de Auditoría: ${filaDetalle?.accion}`}
        description={`Registro ID: ${filaDetalle?.id}`}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
            <div>
              <span className="text-slate-400 block text-[10px]">Actor:</span>
              <strong>{filaDetalle?.usuario_nombre || "Sistema"}</strong> ({filaDetalle?.usuario_email || "N/A"})
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Timestamp:</span>
              <span>{filaDetalle?.timestamp ? new Date(filaDetalle.timestamp).toLocaleString() : "-"}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Tabla Afectada:</span>
              <span className="font-mono">{filaDetalle?.tabla_afectada}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Registro Afectado:</span>
              <span className="font-mono">{filaDetalle?.registro_id || "N/A"}</span>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valores Anteriores:
            </h4>
            <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-40">
              {JSON.stringify(filaDetalle?.valores_anteriores, null, 2) || "null"}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valores Nuevos / Detalles de la Operación:
            </h4>
            <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-48">
              {JSON.stringify(filaDetalle?.valores_nuevos, null, 2) || "null"}
            </pre>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setModalDetalleOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
