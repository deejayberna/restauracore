"use client";

import React, { useState } from "react";
import {
  Users,
  UserX,
  MessageSquare,
  Send,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { enviarMensajeRecuperacionAction } from "@/lib/telegram-actions";

export interface ClienteItem {
  id: string;
  chatId: string;
  nombre: string;
  totalVisitas: number;
  ultimaVisita: Date;
  ultimoMensajeRecuperacion: Date | null;
  activo: boolean;
  esInactivo: boolean;
}

export function ClientesTelegramClient({
  iniciales,
  diasInactividadInicial,
  restauranteNombre,
  restauranteId,
  bloqueadoPorPlan,
}: {
  iniciales: ClienteItem[];
  diasInactividadInicial: number;
  restauranteNombre: string;
  restauranteId: string;
  bloqueadoPorPlan?: boolean;
}) {
  const [clientes, setClientes] = useState<ClienteItem[]>(iniciales);
  const [diasInactividad, setDiasInactividad] = useState(diasInactividadInicial);
  const [modalCliente, setModalCliente] = useState<ClienteItem | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [notificacion, setNotificacion] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  if (bloqueadoPorPlan) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-8 text-center max-w-xl mx-auto my-8">
        <Sparkles className="w-12 h-12 text-amber-600 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-amber-900">Módulo Exclusivo Enterprise</h2>
        <p className="text-sm text-amber-700 mt-2">
          La fidelización y recuperación de clientes mediante Telegram está disponible exclusivamente para restaurantes con plan <strong>Enterprise</strong>.
        </p>
      </div>
    );
  }

  const inactivosCount = clientes.filter((c) => c.esInactivo).length;
  const activosCount = clientes.length - inactivosCount;

  const handleEnviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCliente || !mensaje.trim()) return;

    setEnviando(true);
    setNotificacion(null);

    try {
      const res = await enviarMensajeRecuperacionAction(modalCliente.id, mensaje);
      if (res.ok) {
        setNotificacion({
          tipo: "exito",
          texto: `Mensaje enviado correctamente a ${modalCliente.nombre}.`,
        });
        setClientes((prev) =>
          prev.map((c) =>
            c.id === modalCliente.id ? { ...c, ultimoMensajeRecuperacion: new Date() } : c
          )
        );
        setModalCliente(null);
        setMensaje("");
      } else {
        setNotificacion({
          tipo: "error",
          texto: res.error || "No se pudo enviar el mensaje.",
        });
      }
    } catch {
      setNotificacion({
        tipo: "error",
        texto: "Error de conexión al enviar el mensaje.",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alerta de notificación */}
      {notificacion && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium ${
            notificacion.tipo === "exito"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notificacion.tipo === "exito" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notificacion.texto}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotificacion(null)}
            className="text-xs font-bold hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Clientes Vinculados
            </span>
            <Users className="w-5 h-5 text-sky-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {clientes.length}
          </div>
          <p className="text-xs text-slate-500 mt-1">Comensales registrados vía QR</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              En Riesgo / Inactivos
            </span>
            <UserX className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-amber-600">
            {inactivosCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Sin visitar en &gt; {diasInactividad} días</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Frecuentes / Activos
            </span>
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-600">
            {activosCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Visita reciente en regla</p>
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Directorio de Comensales Registrados
            </h2>
            <p className="text-xs text-slate-500">
              Monitorea el ciclo de retorno y envía mensajes de reactivación personalizados.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Umbral de inactividad:</span>
            <select
              value={diasInactividad}
              onChange={(e) => setDiasInactividad(Number(e.target.value))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value={14}>14 días</option>
              <option value={21}>21 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>
        </div>

        {clientes.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold">Aún no hay clientes vinculados por Telegram.</p>
            <p className="text-xs mt-1">
              Aparecerán aquí cuando los comensales escaneen el QR y confirmen su pedido.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 pl-5 font-bold">Comensal</th>
                  <th className="p-3.5 font-bold">Visitas</th>
                  <th className="p-3.5 font-bold">Última Visita</th>
                  <th className="p-3.5 font-bold">Estado</th>
                  <th className="p-3.5 font-bold">Último Mensaje</th>
                  <th className="p-3.5 pr-5 font-bold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {clientes.map((c) => {
                  const diasDesdeVisita = Math.floor(
                    (Date.now() - new Date(c.ultimaVisita).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const diasDesdeMensaje = c.ultimoMensajeRecuperacion
                    ? Math.floor(
                        (Date.now() - new Date(c.ultimoMensajeRecuperacion).getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    : null;
                  const bloqueadoPorAntispam = diasDesdeMensaje !== null && diasDesdeMensaje < 7;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3.5 pl-5">
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {c.nombre}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {c.chatId}
                        </span>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">
                        {c.totalVisitas} {c.totalVisitas === 1 ? "visita" : "visitas"}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {new Date(c.ultimaVisita).toLocaleDateString()}
                        <span className="text-[10px] text-slate-400 block">
                          hace {diasDesdeVisita} {diasDesdeVisita === 1 ? "día" : "días"}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {c.esInactivo ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Inactivo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500">
                        {c.ultimoMensajeRecuperacion ? (
                          <>
                            <span>{new Date(c.ultimoMensajeRecuperacion).toLocaleDateString()}</span>
                            <span className="text-[10px] block text-slate-400">
                              hace {diasDesdeMensaje}d
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">Ninguno</span>
                        )}
                      </td>
                      <td className="p-3.5 pr-5 text-right">
                        <button
                          type="button"
                          disabled={bloqueadoPorAntispam}
                          onClick={() => {
                            setModalCliente(c);
                            setMensaje(
                              `¡Hola ${c.nombre}! Te extrañamos en ${restauranteNombre}. En tu próxima visita presenta este mensaje para recibir un beneficio especial.`
                            );
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:hover:bg-orange-600 text-white transition-colors"
                          title={bloqueadoPorAntispam ? "Protección antispam (1 mensaje por semana)" : "Enviar mensaje"}
                        >
                          {bloqueadoPorAntispam ? "En espera (7d)" : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Redactar Mensaje */}
      {modalCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Mensaje de Recuperación a {modalCliente.nombre}
                </h3>
                <p className="text-xs text-slate-400">
                  Se enviará a su cuenta personal de Telegram (protegido por regla antispam de 7 días).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalCliente(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnviarMensaje} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Texto del Mensaje:
                </label>
                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  rows={4}
                  required
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  placeholder="Escribe el mensaje de invitación o promoción..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCliente(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando || !mensaje.trim()}
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{enviando ? "Enviando..." : "Enviar Mensaje"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

