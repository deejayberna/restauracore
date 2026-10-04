"use client";

import React, { useState } from "react";
import { ResumenValorProtegido } from "@/lib/roi-antifraude";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  ShieldCheck,
  Coins,
  PackageX,
  Lock,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { confirmarResultadoIncidenciaAction } from "@/lib/roi-antifraude-actions";

interface WidgetProps {
  datos: ResumenValorProtegido;
  esDueno: boolean;
}

export function WidgetControlAntiFraude({ datos, esDueno }: WidgetProps) {
  const [detallesAbiertos, setDetallesAbiertos] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  // ─── REGLA DE MENOS DE 7 DÍAS ──────────────────────────────────────────
  if (!datos.elegibleParaMostrar) {
    return (
      <Card className="border-sky-200 dark:border-sky-900 bg-linear-to-r from-sky-50/50 to-indigo-50/30 dark:from-slate-900 dark:to-sky-950/20">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Control Anti-Fraude en Calibración
              </h4>
              <Badge variant="neutral" size="sm">
                Día {datos.restaurante.diasActivo} de 7
              </Badge>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Tu reporte de control anti-fraude estará disponible en unos días. Estamos registrando
              los primeros turnos y consumos para ofrecerte métricas operativas significativas.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── MANEJADOR DE CONFIRMACIÓN DEL DUEÑO ──────────────────────────────
  const handleConfirmar = async (
    tipo: "turno" | "merma",
    registroId: string,
    resultado: "robo_real" | "error_humano"
  ) => {
    if (!esDueno) return;
    setProcesandoId(registroId);
    setErrorAccion(null);
    setMensajeExito(null);

    try {
      const res = await confirmarResultadoIncidenciaAction({
        tipo,
        registroId,
        resultado,
      });
      if (res.ok) {
        setMensajeExito(res.mensaje);
      }
    } catch (err: any) {
      setErrorAccion(err.message ?? "Error al procesar la confirmación.");
    } finally {
      setProcesandoId(null);
    }
  };

  const { desglose, seguridadYAuditoria, confirmacionesDueno } = datos;
  const mesTitulo = `${datos.periodo.mesNombre} ${datos.periodo.anio}`;

  return (
    <Card className="border-indigo-200/80 dark:border-indigo-900/50 shadow-sm overflow-hidden">
      {/* Cabecera con identidad anti-fraude */}
      <CardHeader className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 border-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                Control Anti-Fraude Este Mes
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                  {mesTitulo}
                </span>
              </CardTitle>
              <CardDescription className="text-slate-300 text-xs mt-0.5">
                Auditoría visible y medible de operaciones críticas en tu negocio
              </CardDescription>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-indigo-300 font-semibold block">
              Puesto en Evidencia
            </span>
            <span className="text-2xl font-black text-emerald-400">
              ${datos.montoTotalDetectado.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400 block">MXN bajo control</span>
          </div>
        </div>

        {/* Mensaje de valor honesto */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-slate-700/50">
          <strong className="text-white">Transparencia Operativa:</strong> Esto es lo que RestauraCore
          puso bajo control este mes — sin este sistema, estos eventos habrían pasado desapercibidos.
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Notificaciones de acción rápida */}
        {mensajeExito && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{mensajeExito}</span>
          </div>
        )}
        {errorAccion && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorAccion}</span>
          </div>
        )}

        {/* ─── GRID DE 3 PILARES ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Pilar 1: Faltantes de Caja */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-600" />
                Faltantes de Caja
              </span>
              <Badge variant={desglose.discrepanciasCaja.turnosConFaltante > 0 ? "warning" : "neutral"} size="sm">
                {desglose.discrepanciasCaja.turnosConFaltante} turno(s)
              </Badge>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              ${desglose.discrepanciasCaja.montoFaltantes.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Detectados en arqueo ciego sobre {desglose.discrepanciasCaja.totalTurnosAuditados} turnos cerrados.
            </p>
          </div>

          {/* Pilar 2: Mermas Auditadas */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <PackageX className="w-4 h-4 text-rose-600" />
                Mermas Auditadas
              </span>
              <Badge variant={desglose.mermasRevision.cantidadEventos > 0 ? "danger" : "neutral"} size="sm">
                {desglose.mermasRevision.cantidadEventos} evento(s)
              </Badge>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              ${desglose.mermasRevision.montoEstimado.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Valor estimado de insumos sujetos a revisión gerencial o cancelaciones post-preparación.
            </p>
          </div>

          {/* Pilar 3: Barreras de Seguridad e Investigaciones */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-600" />
                Seguridad Activa
              </span>
              <Badge variant="info" size="sm">
                Auditado
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {seguridadYAuditoria.intentosBloqueados}
              </span>
              <span className="text-xs text-slate-500">intentos bloqueados</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {seguridadYAuditoria.alertasRoboInvestigadas} de {seguridadYAuditoria.alertasRoboSospechadoTotal} alerta(s)
              de robo sospechado investigadas.
            </p>
          </div>
        </div>

        {/* ─── ESTADÍSTICA DE CONFIRMACIONES DEL DUEÑO ────────────────── */}
        {(confirmacionesDueno.roboConfirmadoEventos > 0 || confirmacionesDueno.errorHumanoEventos > 0) && (
          <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Validación directa del dueño:
              </p>
              <p>
                De las discrepancias auditadas este mes, el dueño confirmó{" "}
                <strong className="text-rose-600 dark:text-rose-400">
                  ${confirmacionesDueno.roboConfirmadoMonto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </strong>{" "}
                como incidencias reales ({confirmacionesDueno.roboConfirmadoEventos} caso/s) y{" "}
                <strong className="text-slate-900 dark:text-slate-100">
                  ${confirmacionesDueno.errorHumanoMonto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </strong>{" "}
                como errores humanos aclarados ({confirmacionesDueno.errorHumanoEventos} caso/s).
              </p>
            </div>
          </div>
        )}

        {/* ─── SECCIÓN DESPLEGABLE DE DETALLES Y CONFIRMACIÓN MANUAL ──── */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={() => setDetallesAbiertos(!detallesAbiertos)}
            className="w-full flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-semibold hover:text-slate-900 dark:hover:text-slate-200 transition-colors py-1 cursor-pointer"
          >
            <span>
              {detallesAbiertos ? "Ocultar desglose detallado" : "Ver desglose detallado de eventos detectados"} (
              {desglose.discrepanciasCaja.detalles.length + desglose.mermasRevision.detalles.length} registros)
            </span>
            {detallesAbiertos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {detallesAbiertos && (
            <div className="mt-3 space-y-3">
              {/* Desglose de Faltantes de Caja */}
              {desglose.discrepanciasCaja.detalles.length > 0 && (
                <div className="space-y-1.5">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Faltantes de Caja por Turno
                  </h5>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                    {desglose.discrepanciasCaja.detalles.map((d) => (
                      <div
                        key={d.turnoId}
                        className="p-2.5 flex items-center justify-between text-xs flex-wrap gap-2"
                      >
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            Turno {d.codigo}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-2">
                            {d.fechaCierre ? new Date(d.fechaCierre).toLocaleDateString("es-MX") : "En curso"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-amber-600 dark:text-amber-400">
                            -${d.montoFaltante.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>

                          {/* Botones de confirmación solo para el dueño */}
                          {esDueno && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={procesandoId === d.turnoId}
                                onClick={() => handleConfirmar("turno", d.turnoId, "error_humano")}
                                className="text-[11px] h-7 px-2"
                                title="Confirmar que fue error humano de conteo o captura"
                              >
                                Error humano
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={procesandoId === d.turnoId}
                                onClick={() => handleConfirmar("turno", d.turnoId, "robo_real")}
                                className="text-[11px] h-7 px-2"
                                title="Confirmar que fue faltante real no justificado"
                              >
                                Faltante real
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Desglose de Mermas en Revisión */}
              {desglose.mermasRevision.detalles.length > 0 && (
                <div className="space-y-1.5">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Mermas Sujetas a Revisión
                  </h5>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                    {desglose.mermasRevision.detalles.map((m) => (
                      <div
                        key={m.movimientoId}
                        className="p-2.5 flex items-center justify-between text-xs flex-wrap gap-2"
                      >
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {m.ingrediente}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-2">
                            ({m.cantidad} unidades · Motivo: {m.motivo})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            ${m.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>

                          {/* Botones de confirmación solo para el dueño */}
                          {esDueno && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={procesandoId === m.movimientoId}
                                onClick={() => handleConfirmar("merma", m.movimientoId, "error_humano")}
                                className="text-[11px] h-7 px-2"
                                title="Confirmar que fue error humano o merma operativa normal"
                              >
                                Normal/Error
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={procesandoId === m.movimientoId}
                                onClick={() => handleConfirmar("merma", m.movimientoId, "robo_real")}
                                className="text-[11px] h-7 px-2"
                                title="Confirmar que fue sustracción no autorizada"
                              >
                                Robo real
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {desglose.discrepanciasCaja.detalles.length === 0 &&
                desglose.mermasRevision.detalles.length === 0 && (
                  <p className="text-xs text-slate-500 italic p-3 text-center bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                    No se han registrado discrepancias de caja ni mermas anómalas en el período actual.
                  </p>
                )}
            </div>
          )}
        </div>

        {/* Nota al pie de honestidad */}
        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic text-center">
          * Criterio de auditoría honesta: RestauraCore no afirma haber evitado el 100% de estos montos;
          garantiza visibilidad total e inmediata para que ninguna fuga pase desapercibida.
        </p>
      </CardContent>
    </Card>
  );
}
