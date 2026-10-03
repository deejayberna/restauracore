"use client";

import React, { useState, useTransition } from "react";
import {
  UtensilsCrossed,
  UserCheck,
  UserX,
  ArrowRightLeft,
  AlertCircle,
  Clock,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Coffee,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  tomarMesaAction,
  liberarMesaAction,
  transferirMesaAction,
} from "@/lib/mesas-actions";
import { useRouter } from "next/navigation";

export interface MesaOperativa {
  id: string;
  numero: number;
  qr_token: string;
  mesero_actual_id: string | null;
  asignado_en: Date | string | null;
  mesero_nombre: string | null;
  mesero_email: string | null;
  es_mi_mesa: boolean;
  disponible_para_tomar: boolean;
  tiene_orden_activa: boolean;
  orden_id: string | null;
  orden_total: string | null;
  orden_estado: string | null;
  pedido_sin_mesero: boolean;
}

export interface MeseroDisponible {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export function PanelMesasOperativas({
  usuarioActual,
  mesasIniciales,
  meserosDisponibles,
}: {
  usuarioActual: { id: string; nombre: string; rol: string };
  mesasIniciales: MesaOperativa[];
  meserosDisponibles: MeseroDisponible[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaOperativa[]>(mesasIniciales);
  const [isPending, startTransition] = useTransition();

  // Modal de transferencia
  const [mesaParaTransferir, setMesaParaTransferir] = useState<MesaOperativa | null>(null);
  const [nuevoMeseroId, setNuevoMeseroId] = useState<string>("");

  const esSupervisor = ["supervisor_piso", "gerente", "dueno"].includes(usuarioActual.rol);
  const esMesero = usuarioActual.rol === "mesero";

  // Secciones
  const misMesas = mesas.filter((m) => m.es_mi_mesa);
  const mesasDisponibles = mesas.filter((m) => m.disponible_para_tomar);
  const mesasDeOtros = mesas.filter((m) => !m.es_mi_mesa && !m.disponible_para_tomar);

  // Alerta de pedidos sin mesero
  const mesasSinAtender = mesas.filter((m) => m.pedido_sin_mesero);

  async function handleTomarMesa(mesaId: string) {
    startTransition(async () => {
      try {
        const res = await tomarMesaAction(mesaId);
        if (!res.ok) {
          toast(res.error || "No fue posible tomar la mesa.", "error");
        } else {
          toast(`¡Mesa tomada con éxito!`, "success");
          router.refresh();
        }
      } catch (err: any) {
        toast(err.message || "Error al tomar mesa", "error");
      }
    });
  }

  async function handleLiberarMesa(mesaId: string) {
    startTransition(async () => {
      try {
        const res = await liberarMesaAction(mesaId);
        if (res.ok) {
          toast("Mesa liberada correctamente.", "success");
          router.refresh();
        }
      } catch (err: any) {
        toast(err.message || "Error al liberar mesa", "error");
      }
    });
  }

  async function handleTransferirMesa() {
    if (!mesaParaTransferir || !nuevoMeseroId) return;

    startTransition(async () => {
      try {
        const res = await transferirMesaAction(mesaParaTransferir.id, nuevoMeseroId);
        if (res.ok) {
          toast("Mesa transferida exitosamente.", "success");
          setMesaParaTransferir(null);
          setNuevoMeseroId("");
          router.refresh();
        }
      } catch (err: any) {
        toast(err.message || "Error al transferir mesa", "error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ─── ALERTA DESTACADA: PEDIDOS VÍA QR SIN MESERO ASIGNADO ─────────── */}
      {mesasSinAtender.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                ¡{mesasSinAtender.length} Mesa(s) con pedido nuevo sin mesero asignado!
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Clientes ordenaron mediante código QR en las mesas:{" "}
                <strong>{mesasSinAtender.map((m) => `Mesa ${m.numero}`).join(", ")}</strong>.
                Toma la mesa para brindar seguimiento de servicio.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECCIÓN 1: MIS MESAS ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-600" />
            Mis Mesas Asignadas ({misMesas.length})
          </h2>
          <span className="text-xs text-slate-500">Bajo tu atención directa</span>
        </div>

        {misMesas.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center bg-white dark:bg-slate-900">
            <Coffee className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">
              Actualmente no tienes mesas tomadas. Puedes tomar cualquiera de las mesas disponibles abajo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {misMesas.map((m) => (
              <Card key={m.id} className="border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-black">Mesa {m.numero}</CardTitle>
                    <Badge variant="success" size="sm" dot>
                      Atendiendo
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Mesa de salón
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {m.tiene_orden_activa ? (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span>Cuenta activa:</span>
                        <span className="text-emerald-600">${m.orden_total ?? "0.00"}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase">
                        Estado: {m.orden_estado}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">Sin cuenta activa</p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => handleLiberarMesa(m.id)}
                      disabled={isPending}
                    >
                      <UserX className="w-3.5 h-3.5 mr-1" />
                      Liberar Mesa
                    </Button>
                    {esSupervisor && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="px-2"
                        title="Transferir mesa a otro mesero"
                        onClick={() => {
                          setMesaParaTransferir(m);
                          setNuevoMeseroId("");
                        }}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── SECCIÓN 2: MESAS DISPONIBLES PARA TOMAR ───────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-sky-600" />
            Mesas Disponibles para Tomar ({mesasDisponibles.length})
          </h2>
          <span className="text-xs text-slate-500">Cualquier mesero del turno puede tomarlas</span>
        </div>

        {mesasDisponibles.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center bg-white dark:bg-slate-900">
            <p className="text-xs text-slate-500">Todas las mesas están actualmente asignadas a meseros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {mesasDisponibles.map((m) => (
              <Card
                key={m.id}
                className={
                  m.pedido_sin_mesero
                    ? "border-amber-400 bg-amber-50/30 dark:bg-amber-950/20 shadow-sm"
                    : ""
                }
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-black">Mesa {m.numero}</CardTitle>
                    {m.pedido_sin_mesero ? (
                      <Badge variant="warning" size="sm" dot>
                        Pedido sin mesero
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        Disponible
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    Mesa de salón
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {m.tiene_orden_activa && (
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span>Total cuenta:</span>
                        <span className="text-emerald-600">${m.orden_total ?? "0.00"}</span>
                      </div>
                    </div>
                  )}

                  {(esMesero || esSupervisor) && (
                    <Button
                      size="sm"
                      className="w-full text-xs bg-sky-600 hover:bg-sky-700 text-white"
                      onClick={() => handleTomarMesa(m.id)}
                      disabled={isPending}
                    >
                      <UserCheck className="w-3.5 h-3.5 mr-1" />
                      Tomar Mesa
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── SECCIÓN 3: MESAS DE OTROS COMPAÑEROS ───────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-600 dark:text-slate-400 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Mesas Atendidas por Otros ({mesasDeOtros.length})
          </h2>
          <span className="text-xs text-slate-500">
            {esSupervisor
              ? "Como supervisor puedes liberar o reasignar cualquiera"
              : "Atendidas por otros compañeros"}
          </span>
        </div>

        {mesasDeOtros.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {mesasDeOtros.map((m) => (
              <Card
                key={m.id}
                className="opacity-75 hover:opacity-100 transition-opacity border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold text-slate-700 dark:text-slate-300">
                      Mesa {m.numero}
                    </CardTitle>
                    <Badge variant="neutral" size="sm">
                      {m.mesero_nombre ?? "Otro mesero"}
                    </Badge>
                  </div>
                  <CardDescription className="text-[11px]">
                    Mesa de salón
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {m.asignado_en && (
                    <p className="text-[10px] text-slate-500">
                      Tomada: {new Date(m.asignado_en).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                  {esSupervisor && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-[11px]"
                        onClick={() => {
                          setMesaParaTransferir(m);
                          setNuevoMeseroId("");
                        }}
                      >
                        <ArrowRightLeft className="w-3 h-3 mr-1" />
                        Transferir
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="px-2 text-rose-600 hover:text-rose-700"
                        title="Liberar mesa de la atención actual"
                        onClick={() => handleLiberarMesa(m.id)}
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL DE TRANSFERENCIA DE MESA ───────────────────────────────── */}
      {mesaParaTransferir && (
        <Modal
          isOpen={true}
          onClose={() => setMesaParaTransferir(null)}
          title={`Transferir Mesa ${mesaParaTransferir.numero}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Selecciona el mesero que asumirá la atención de la <strong>Mesa {mesaParaTransferir.numero}</strong>.
              {mesaParaTransferir.mesero_nombre && (
                <span> (Actualmente atendida por: <em>{mesaParaTransferir.mesero_nombre}</em>)</span>
              )}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nuevo Mesero Responsable *
              </label>
              <select
                value={nuevoMeseroId}
                onChange={(e) => setNuevoMeseroId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-sky-500"
              >
                <option value="">-- Seleccionar mesero --</option>
                {meserosDisponibles
                  .filter((p) => p.id !== mesaParaTransferir.mesero_actual_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rol})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMesaParaTransferir(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700 text-white"
                onClick={handleTransferirMesa}
                disabled={!nuevoMeseroId || isPending}
              >
                Confirmar Transferencia
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
