"use client";

import React, { useState } from "react";
import {
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  UtensilsCrossed,
  FileText,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import {
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  aprobarCancelacionItemAction,
  rechazarCancelacionItemAction,
} from "@/lib/cancelaciones-actions";
import { useRouter } from "next/navigation";

export interface SolicitudCancelacionUI {
  id: string;
  orden_id: string;
  orden_item_id: string;
  mesa_numero: number;
  platillo_nombre: string;
  cantidad: number;
  precio_unitario: string;
  total_congelado: number;
  solicitante_nombre: string;
  estado_item: string;
  motivo: string;
  estado: string; // 'pendiente' | 'aprobada' | 'rechazada'
  motivo_resolucion?: string | null;
  aprobado_por_nombre?: string | null;
  creado_en: Date | string;
  resuelto_en?: Date | string | null;
}

export function CancelacionesView({
  solicitudesPendientes,
  solicitudesHistorial,
}: {
  solicitudesPendientes: SolicitudCancelacionUI[];
  solicitudesHistorial: SolicitudCancelacionUI[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("pendientes");

  // Modal Aprobar
  const [modalAprobarOpen, setModalAprobarOpen] = useState(false);
  const [solicitudAprobar, setSolicitudAprobar] = useState<SolicitudCancelacionUI | null>(null);
  const [motivoAprobacion, setMotivoAprobacion] = useState("");
  const [procesandoAprobacion, setProcesandoAprobacion] = useState(false);

  // Modal Rechazar
  const [modalRechazarOpen, setModalRechazarOpen] = useState(false);
  const [solicitudRechazar, setSolicitudRechazar] = useState<SolicitudCancelacionUI | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [procesandoRechazo, setProcesandoRechazo] = useState(false);

  async function handleAprobar() {
    if (!solicitudAprobar) return;

    if (
      solicitudAprobar.estado_item === "entregado" &&
      motivoAprobacion.trim().length < 10
    ) {
      toast(
        "Para platillos entregados, debes ingresar una explicación detallada (mínimo 10 caracteres).",
        "warning"
      );
      return;
    }

    setProcesandoAprobacion(true);
    try {
      const res = await aprobarCancelacionItemAction({
        solicitudId: solicitudAprobar.id,
        motivoResolucion: motivoAprobacion.trim() || undefined,
      });

      if (res.ok) {
        toast("Solicitud de cancelación aprobada con éxito.", "success");
        setModalAprobarOpen(false);
        setSolicitudAprobar(null);
        setMotivoAprobacion("");
        router.refresh();
      } else {
        toast(res.error || "No se pudo aprobar la solicitud.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error al procesar la aprobación.", "error");
    } finally {
      setProcesandoAprobacion(false);
    }
  }

  async function handleRechazar() {
    if (!solicitudRechazar) return;

    if (motivoRechazo.trim().length < 3) {
      toast("El motivo del rechazo debe tener al menos 3 caracteres.", "warning");
      return;
    }

    setProcesandoRechazo(true);
    try {
      const res = await rechazarCancelacionItemAction({
        solicitudId: solicitudRechazar.id,
        motivoRechazo: motivoRechazo.trim(),
      });

      if (res.ok) {
        toast("Solicitud rechazada. El platillo regresó a su estado anterior.", "info");
        setModalRechazarOpen(false);
        setSolicitudRechazar(null);
        setMotivoRechazo("");
        router.refresh();
      } else {
        toast(res.error || "No se pudo rechazar la solicitud.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error al rechazar la solicitud.", "error");
    } finally {
      setProcesandoRechazo(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── ENCABEZADO ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
          Aprobación de Cancelaciones
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Control anti-fraude: autorización de cancelaciones de platillos en preparación o
          entregados.
        </p>
      </div>

      {/* ─── PESTAÑAS ───────────────────────────────────────────────────────── */}
      <Tabs
        tabs={[
          {
            id: "pendientes",
            label: "Solicitudes Pendientes",
            count: solicitudesPendientes.length,
          },
          {
            id: "historial",
            label: "Historial de Resoluciones",
            count: solicitudesHistorial.length,
          },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ─── TAB 1: PENDIENTES ──────────────────────────────────────────────── */}
      {activeTab === "pendientes" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bandeja de Aprobaciones Pendientes</CardTitle>
            <CardDescription>
              Platillos enviados a cocina o servidos cuya cancelación requiere visto bueno de
              gerencia.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {solicitudesPendientes.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Sin solicitudes pendientes
                </p>
                <p className="mt-0.5">Todas las cancelaciones de la sucursal han sido atendidas.</p>
              </div>
            ) : (
              <TableContainer className="border-0 rounded-none">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Mesa & Platillo</TableHeaderCell>
                    <TableHeaderCell>Estado en Cocina</TableHeaderCell>
                    <TableHeaderCell>Solicitante & Motivo</TableHeaderCell>
                    <TableHeaderCell>Monto</TableHeaderCell>
                    <TableHeaderCell className="text-right">Resolución</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {solicitudesPendientes.map((sol) => (
                    <TableRow key={sol.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold flex items-center justify-center text-xs shrink-0">
                            M{sol.mesa_numero}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {sol.cantidad}x {sol.platillo_nombre}
                            </p>
                            <p className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(sol.creado_en).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={sol.estado_item === "entregado" ? "danger" : "warning"}
                          size="sm"
                          className="uppercase font-semibold text-[10px]"
                        >
                          {sol.estado_item}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {sol.solicitante_nombre}
                        </p>
                        <p className="text-xs text-slate-500 italic mt-0.5 max-w-xs truncate">
                          "{sol.motivo}"
                        </p>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          ${sol.total_congelado.toFixed(2)}
                        </span>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSolicitudRechazar(sol);
                              setModalRechazarOpen(true);
                            }}
                          >
                            Rechazar
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSolicitudAprobar(sol);
                              setModalAprobarOpen(true);
                            }}
                          >
                            Aprobar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 2: HISTORIAL ───────────────────────────────────────────────── */}
      {activeTab === "historial" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Historial de Cancelaciones Resueltas</CardTitle>
            <CardDescription>
              Registro de auditoría de solicitudes aprobadas y rechazadas por la gerencia.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {solicitudesHistorial.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                No hay historial de solicitudes registradas.
              </p>
            ) : (
              <TableContainer className="border-0 rounded-none">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Platillo / Mesa</TableHeaderCell>
                    <TableHeaderCell>Estado Final</TableHeaderCell>
                    <TableHeaderCell>Motivo Inicial</TableHeaderCell>
                    <TableHeaderCell>Resolución de Gerencia</TableHeaderCell>
                    <TableHeaderCell>Fecha</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {solicitudesHistorial.map((sol) => (
                    <TableRow key={sol.id}>
                      <TableCell>
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {sol.cantidad}x {sol.platillo_nombre} (Mesa #{sol.mesa_numero})
                        </p>
                        <span className="text-[11px] text-slate-500">${sol.total_congelado.toFixed(2)}</span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={sol.estado === "aprobada" ? "success" : "danger"}
                          size="sm"
                          className="uppercase font-semibold text-[10px]"
                        >
                          {sol.estado}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {sol.motivo}
                        </p>
                        <span className="text-[10px] text-slate-400">Por {sol.solicitante_nombre}</span>
                      </TableCell>

                      <TableCell>
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {sol.motivo_resolucion || "Sin notas adicionales"}
                        </p>
                        {sol.aprobado_por_nombre && (
                          <span className="text-[10px] text-slate-400">
                            Resuelto por {sol.aprobado_por_nombre}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className="text-xs text-slate-500">
                          {sol.resuelto_en
                            ? new Date(sol.resuelto_en).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── MODAL APROBAR ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalAprobarOpen}
        onClose={() => setModalAprobarOpen(false)}
        title="Confirmar Aprobación de Cancelación"
        description="Esta acción descontará el monto de la cuenta y registrará la merma automática correspondiente."
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1 text-xs">
            <p>
              <strong>Platillo:</strong> {solicitudAprobar?.cantidad}x {solicitudAprobar?.platillo_nombre}
            </p>
            <p>
              <strong>Mesa:</strong> #{solicitudAprobar?.mesa_numero}
            </p>
            <p>
              <strong>Monto a descontar:</strong> ${solicitudAprobar?.total_congelado.toFixed(2)}
            </p>
            <p>
              <strong>Estado al solicitar:</strong>{" "}
              <Badge size="sm" variant="warning">
                {solicitudAprobar?.estado_item}
              </Badge>
            </p>
          </div>

          {solicitudAprobar?.estado_item === "entregado" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-rose-700 dark:text-rose-300">
                Justificación obligatoria (mínimo 10 caracteres):
              </label>
              <textarea
                value={motivoAprobacion}
                onChange={(e) => setMotivoAprobacion(e.target.value)}
                rows={3}
                placeholder="Explica detalladamente el motivo de la cancelación de un platillo que ya fue servido..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-2.5 text-xs bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
              <span className="text-[10px] text-slate-400">
                {motivoAprobacion.length} / 10 caracteres mínimos
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setModalAprobarOpen(false)}
              disabled={procesandoAprobacion}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleAprobar}
              loading={procesandoAprobacion}
            >
              Confirmar y Cancelar Platillo
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── MODAL RECHAZAR ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalRechazarOpen}
        onClose={() => setModalRechazarOpen(false)}
        title="Rechazar Solicitud de Cancelación"
        description="El platillo regresará a su estado operacional y el mesero podrá ver el motivo del rechazo."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Motivo del rechazo (para conocimiento del mesero):
            </label>
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={3}
              placeholder="Ej. Platillo ya fue consumido en mesa / No procede descuento..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-2.5 text-xs bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setModalRechazarOpen(false)}
              disabled={procesandoRechazo}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleRechazar}
              loading={procesandoRechazo}
            >
              Confirmar Rechazo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

