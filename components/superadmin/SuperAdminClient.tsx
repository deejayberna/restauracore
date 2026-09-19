"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  extenderTrialAction,
  responderTicketAction,
  obtenerDetalleRestauranteAction,
  type ExtenderTrialInput,
} from "@/lib/superadmin-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Building2,
  Users,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Calendar,
  LifeBuoy,
  CreditCard,
  ExternalLink,
  MessageSquare,
  Send,
  X,
  Shield,
  Layers,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/lib/auth-actions";

export interface MetricasGlobales {
  totalRestaurantes: number;
  activos: number;
  trial: number;
  cancelados: number;
  pagoFallido: number;
  mrrEstimado: number;
  ticketsAbiertos: number;
}

export interface RestauranteSuperAdmin {
  id: string;
  nombre: string;
  plan: string;
  estado_suscripcion: string;
  fecha_fin_trial: string | Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  creado_en: string | Date;
  timezone: string;
  direccion: string | null;
  dueno: {
    id: string;
    nombre: string;
    email: string;
    telefono: string | null;
  } | null;
  ticketsCount: number;
}

export interface TicketGlobal {
  id: string;
  restaurante_id: string;
  restaurante_nombre: string;
  usuario_id: string;
  usuario_nombre: string;
  usuario_email: string;
  asunto: string;
  mensaje: string;
  estado: string;
  respuesta: string | null;
  creado_en: string | Date;
  respondido_en: string | Date | null;
}

interface SuperAdminClientProps {
  adminEmail: string;
  metricas: MetricasGlobales;
  restaurantesIniciales: RestauranteSuperAdmin[];
  ticketsIniciales: TicketGlobal[];
}

export function SuperAdminClient({
  adminEmail,
  metricas: metricasIniciales,
  restaurantesIniciales,
  ticketsIniciales,
}: SuperAdminClientProps) {
  const [tab, setTab] = useState<"restaurantes" | "tickets">("restaurantes");
  const [restaurantes, setRestaurantes] = useState<RestauranteSuperAdmin[]>(restaurantesIniciales);
  const [tickets, setTickets] = useState<TicketGlobal[]>(ticketsIniciales);
  const [metricas, setMetricas] = useState<MetricasGlobales>(metricasIniciales);

  // Filtros de Restaurantes
  const [busquedaRest, setBusquedaRest] = useState("");
  const [filtroEstadoRest, setFiltroEstadoRest] = useState("todos");

  // Filtro de Tickets
  const [filtroEstadoTicket, setFiltroEstadoTicket] = useState("todos");

  // Modal Extender Trial
  const [restauranteExtender, setRestauranteExtender] = useState<RestauranteSuperAdmin | null>(null);
  const [diasExtender, setDiasExtender] = useState<number>(7);
  const [motivoExtender, setMotivoExtender] = useState("");
  const [isPendingExtender, startTransitionExtender] = useTransition();
  const [errorExtender, setErrorExtender] = useState<string | null>(null);
  const [exitoExtender, setExitoExtender] = useState<string | null>(null);

  // Modal Detalle Restaurante
  const [restauranteDetalle, setRestauranteDetalle] = useState<any | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Modal Responder Ticket
  const [ticketResponder, setTicketResponder] = useState<TicketGlobal | null>(null);
  const [textoRespuesta, setTextoRespuesta] = useState("");
  const [estadoRespuesta, setEstadoRespuesta] = useState<"resuelto" | "en_proceso">("resuelto");
  const [isPendingResponder, startTransitionResponder] = useTransition();
  const [errorResponder, setErrorResponder] = useState<string | null>(null);

  // Filtrado de restaurantes
  const restaurantesFiltrados = useMemo(() => {
    return restaurantes.filter((r) => {
      const coincideEstado =
        filtroEstadoRest === "todos" || r.estado_suscripcion === filtroEstadoRest;
      const b = busquedaRest.toLowerCase().trim();
      const coincideBusqueda =
        !b ||
        r.nombre.toLowerCase().includes(b) ||
        r.dueno?.email.toLowerCase().includes(b) ||
        r.dueno?.nombre.toLowerCase().includes(b);
      return coincideEstado && coincideBusqueda;
    });
  }, [restaurantes, busquedaRest, filtroEstadoRest]);

  // Filtrado de tickets
  const ticketsFiltrados = useMemo(() => {
    return tickets.filter((t) => {
      return filtroEstadoTicket === "todos" || t.estado === filtroEstadoTicket;
    });
  }, [tickets, filtroEstadoTicket]);

  // Cálculo explícito previo de la fecha calculada de trial
  const fechaCalculadaPreview = useMemo(() => {
    if (!restauranteExtender) return null;
    const ahora = new Date();
    const fechaFinActual = restauranteExtender.fecha_fin_trial
      ? new Date(restauranteExtender.fecha_fin_trial)
      : ahora;

    const baseDate = fechaFinActual > ahora ? fechaFinActual : ahora;
    const esBaseHoy = !(fechaFinActual > ahora);
    const nuevaFecha = new Date(baseDate.getTime() + diasExtender * 24 * 60 * 60 * 1000);

    return {
      fechaFormateada: new Intl.DateTimeFormat("es-MX", {
        dateStyle: "full",
        timeStyle: "short",
      }).format(nuevaFecha),
      esBaseHoy,
      fechaBase: baseDate,
      dias: diasExtender,
    };
  }, [restauranteExtender, diasExtender]);

  function abrirModalExtender(r: RestauranteSuperAdmin) {
    setRestauranteExtender(r);
    setDiasExtender(7);
    setMotivoExtender("");
    setErrorExtender(null);
    setExitoExtender(null);
  }

  function handleConfirmarExtender() {
    if (!restauranteExtender) return;
    setErrorExtender(null);
    setExitoExtender(null);

    startTransitionExtender(async () => {
      try {
        const res = await extenderTrialAction({
          restauranteId: restauranteExtender.id,
          diasAdicionales: diasExtender,
          motivo: motivoExtender.trim() || undefined,
        });

        if (res.success) {
          // Actualizar estado local del restaurante
          setRestaurantes((prev) =>
            prev.map((r) =>
              r.id === restauranteExtender.id
                ? {
                    ...r,
                    fecha_fin_trial: res.nuevaFechaFin,
                    estado_suscripcion: "trial",
                  }
                : r
            )
          );
          setExitoExtender(`✓ Periodo de prueba extendido exitosamente hasta el ${new Date(res.nuevaFechaFin).toLocaleDateString()}`);
          setTimeout(() => {
            setRestauranteExtender(null);
          }, 1500);
        }
      } catch (err: any) {
        setErrorExtender(err.message || "Error al extender periodo de prueba.");
      }
    });
  }

  async function abrirDetalleRestaurante(restauranteId: string) {
    setLoadingDetalle(true);
    setRestauranteDetalle(null);
    try {
      const data = await obtenerDetalleRestauranteAction(restauranteId);
      setRestauranteDetalle(data);
    } catch (err: any) {
      alert("Error al cargar detalle: " + err.message);
    } finally {
      setLoadingDetalle(false);
    }
  }

  function abrirModalResponder(t: TicketGlobal) {
    setTicketResponder(t);
    setTextoRespuesta(t.respuesta || "");
    setEstadoRespuesta("resuelto");
    setErrorResponder(null);
  }

  function handleConfirmarResponder() {
    if (!ticketResponder) return;
    setErrorResponder(null);

    startTransitionResponder(async () => {
      try {
        await responderTicketAction({
          ticketId: ticketResponder.id,
          respuesta: textoRespuesta.trim(),
          nuevoEstado: estadoRespuesta,
        });

        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketResponder.id
              ? {
                  ...t,
                  respuesta: textoRespuesta.trim(),
                  estado: estadoRespuesta,
                  respondido_en: new Date(),
                }
              : t
          )
        );

        // Disminuir contador de tickets abiertos si se resolvió
        if (ticketResponder.estado === "abierto" && estadoRespuesta === "resuelto") {
          setMetricas((prev) => ({
            ...prev,
            ticketsAbiertos: Math.max(0, prev.ticketsAbiertos - 1),
          }));
        }

        setTicketResponder(null);
      } catch (err: any) {
        setErrorResponder(err.message || "Error al responder ticket.");
      }
    });
  }

  function getBadgeEstado(estado: string) {
    switch (estado) {
      case "activa":
        return <Badge variant="success" size="sm">ACTIVA</Badge>;
      case "trial":
        return <Badge variant="warning" size="sm">TRIAL</Badge>;
      case "pago_fallido":
        return <Badge variant="danger" size="sm">PAGO FALLIDO</Badge>;
      case "cancelada":
        return <Badge variant="neutral" size="sm">CANCELADA</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{estado.toUpperCase()}</Badge>;
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Barra superior de Super-Admin */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-600/20 border border-orange-500/40 rounded-xl text-orange-400">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  RestauraCore
                </h1>
                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full">
                  Super-Admin SaaS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Operador Global de Plataforma • Sesión: <strong className="text-slate-200">{adminEmail}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/home"
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors"
            >
              Ir a Restaurante Activo →
            </Link>
            <form action={logoutAction}>
              <Button variant="danger" size="sm" type="submit">
                Cerrar Sesión
              </Button>
            </form>
          </div>
        </div>

        {/* Tarjetas KPIs Globales */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Restaurantes</span>
              <Building2 className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white mt-1">{metricas.totalRestaurantes}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Total registrados</div>
          </div>

          <div className="bg-slate-800/60 border border-emerald-500/30 p-4 rounded-xl">
            <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
              <span>Activos</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{metricas.activos}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Suscripciones pagadas</div>
          </div>

          <div className="bg-slate-800/60 border border-amber-500/30 p-4 rounded-xl">
            <div className="text-[11px] font-semibold text-amber-400 flex items-center justify-between">
              <span>En Trial</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{metricas.trial}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Prueba gratuita</div>
          </div>

          <div className="bg-slate-800/60 border border-rose-500/30 p-4 rounded-xl">
            <div className="text-[11px] font-semibold text-rose-400 flex items-center justify-between">
              <span>Cancelados</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {metricas.cancelados + metricas.pagoFallido}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Canceladas / Fallidas</div>
          </div>

          <div className="bg-slate-800/60 border border-emerald-500/30 p-4 rounded-xl">
            <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
              <span>MRR Estimado</span>
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              ${metricas.mrrEstimado.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">MXN mensual recurrente</div>
          </div>

          <div className="bg-slate-800/60 border border-orange-500/30 p-4 rounded-xl">
            <div className="text-[11px] font-semibold text-orange-400 flex items-center justify-between">
              <span>Tickets Abiertos</span>
              <LifeBuoy className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-orange-400 mt-1">{metricas.ticketsAbiertos}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Pendientes de atención</div>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setTab("restaurantes")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              tab === "restaurantes"
                ? "bg-orange-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Directorio de Restaurantes ({restaurantes.length})
          </button>
          <button
            onClick={() => setTab("tickets")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              tab === "tickets"
                ? "bg-orange-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <LifeBuoy className="w-4 h-4" />
            Bandeja de Tickets ({tickets.length})
            {metricas.ticketsAbiertos > 0 && (
              <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
                {metricas.ticketsAbiertos}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: RESTAURANTES */}
        {tab === "restaurantes" && (
          <div className="space-y-4">
            {/* Controles de Búsqueda y Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar restaurante por nombre, dueño o email..."
                  value={busquedaRest}
                  onChange={(e) => setBusquedaRest(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-800/80 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <select
                value={filtroEstadoRest}
                onChange={(e) => setFiltroEstadoRest(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-800/80 border border-slate-700 rounded-lg text-slate-200 focus:outline-none"
              >
                <option value="todos">Todos los Estados</option>
                <option value="activa">Suscripción Activa</option>
                <option value="trial">En Periodo de Prueba (Trial)</option>
                <option value="pago_fallido">Pago Fallido</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>

            {/* Listado de Restaurantes */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="py-3 px-4">Restaurante</th>
                      <th className="py-3 px-4">Contacto / Dueño</th>
                      <th className="py-3 px-4">Plan</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4">Trial / Vencimiento</th>
                      <th className="py-3 px-4">Registro</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {restaurantesFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No se encontraron restaurantes con los filtros indicados.
                        </td>
                      </tr>
                    ) : (
                      restaurantesFiltrados.map((r) => {
                        const esTrialVencido =
                          r.estado_suscripcion === "trial" &&
                          r.fecha_fin_trial &&
                          new Date(r.fecha_fin_trial) < new Date();

                        return (
                          <tr key={r.id} className="hover:bg-slate-750/30 transition-colors">
                            <td className="py-3 px-4 font-semibold text-white">
                              {r.nombre}
                              {r.ticketsCount > 0 && (
                                <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
                                  <LifeBuoy className="w-2.5 h-2.5" />
                                  {r.ticketsCount}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {r.dueno ? (
                                <div>
                                  <div className="text-slate-200">{r.dueno.nombre}</div>
                                  <div className="text-slate-400 text-[11px] font-mono">
                                    {r.dueno.email}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">Sin dueño asignado</span>
                              )}
                            </td>
                            <td className="py-3 px-4 uppercase font-semibold text-slate-300">
                              {r.plan}
                            </td>
                            <td className="py-3 px-4">{getBadgeEstado(r.estado_suscripcion)}</td>
                            <td className="py-3 px-4">
                              {r.fecha_fin_trial ? (
                                <div>
                                  <span
                                    className={
                                      esTrialVencido ? "text-rose-400 font-semibold" : "text-slate-300"
                                    }
                                  >
                                    {new Date(r.fecha_fin_trial).toLocaleDateString([], {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                  {esTrialVencido && (
                                    <span className="block text-[10px] text-rose-400 font-semibold">
                                      Vencido
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-400">
                              {new Date(r.creado_en).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <button
                                onClick={() => abrirDetalleRestaurante(r.id)}
                                className="px-2.5 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium transition-colors"
                              >
                                Ver Detalle
                              </button>
                              <button
                                onClick={() => abrirModalExtender(r)}
                                disabled={r.estado_suscripcion === "cancelada"}
                                className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                                  r.estado_suscripcion === "cancelada"
                                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                    : "bg-orange-600 hover:bg-orange-500 text-white"
                                }`}
                                title={
                                  r.estado_suscripcion === "cancelada"
                                    ? "No se puede extender un restaurante cancelado"
                                    : "Extender periodo de prueba"
                                }
                              >
                                Extender Trial
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BANDEJA DE TICKETS */}
        {tab === "tickets" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Tickets de soporte recibidos desde todos los restaurantes.
              </div>
              <select
                value={filtroEstadoTicket}
                onChange={(e) => setFiltroEstadoTicket(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none"
              >
                <option value="todos">Todos los Estados</option>
                <option value="abierto">Abiertos (Pendientes)</option>
                <option value="en_proceso">En Proceso</option>
                <option value="resuelto">Resueltos</option>
              </select>
            </div>

            <div className="space-y-3">
              {ticketsFiltrados.length === 0 ? (
                <div className="bg-slate-800/40 border border-slate-700/50 p-8 text-center text-xs text-slate-400 rounded-xl">
                  No hay tickets que coincidan con el filtro seleccionado.
                </div>
              ) : (
                ticketsFiltrados.map((t) => (
                  <div
                    key={t.id}
                    className="bg-slate-800/70 border border-slate-700 p-4 rounded-xl space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {t.estado === "resuelto" ? (
                          <Badge variant="success" size="sm">RESUELTO</Badge>
                        ) : t.estado === "en_proceso" ? (
                          <Badge variant="info" size="sm">EN PROCESO</Badge>
                        ) : (
                          <Badge variant="warning" size="sm">ABIERTO</Badge>
                        )}
                        <span className="font-bold text-white text-sm">{t.asunto}</span>
                      </div>

                      <div className="text-xs text-slate-400 flex items-center gap-3">
                        <span className="bg-slate-700/60 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-300">
                          {t.restaurante_nombre}
                        </span>
                        <span>{new Date(t.creado_en).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-900/60 p-3 rounded-lg whitespace-pre-wrap border border-slate-800">
                      <div className="text-[10px] text-slate-500 mb-1 font-semibold uppercase">
                        Mensaje del usuario: {t.usuario_nombre} ({t.usuario_email})
                      </div>
                      {t.mensaje}
                    </div>

                    {t.respuesta && (
                      <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 p-3 rounded-lg whitespace-pre-wrap">
                        <div className="text-[10px] text-emerald-400 font-semibold mb-1">
                          Respuesta oficial enviada:
                        </div>
                        {t.respuesta}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        onClick={() => abrirModalResponder(t)}
                        className="px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {t.respuesta ? "Editar Respuesta" : "Responder Ticket"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* MODAL: EXTENDER TRIAL (Con cálculo previo explícito) */}
        {restauranteExtender && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4 text-slate-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-white text-sm">Extender Periodo de Prueba</h3>
                </div>
                <button
                  onClick={() => setRestauranteExtender(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <div className="text-xs text-slate-400">Restaurante seleccionado:</div>
                <div className="font-bold text-base text-white">{restauranteExtender.nombre}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Estado actual:{" "}
                  <strong className="text-orange-400 uppercase">
                    {restauranteExtender.estado_suscripcion}
                  </strong>{" "}
                  • Fin actual de trial:{" "}
                  {restauranteExtender.fecha_fin_trial
                    ? new Date(restauranteExtender.fecha_fin_trial).toLocaleDateString()
                    : "No asignado"}
                </div>
              </div>

              {/* Selector de días */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Días adicionales a conceder:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[7, 14, 21, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDiasExtender(d)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                        diasExtender === d
                          ? "bg-orange-600 border-orange-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      +{d} días
                    </button>
                  ))}
                </div>
              </div>

              {/* REQUISITO CRÍTICO: Muestra explícitamente la fecha calculada ANTES de confirmar */}
              {fechaCalculadaPreview && (
                <div className="p-3.5 bg-orange-950/30 border border-orange-500/40 rounded-xl space-y-1">
                  <div className="text-[11px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Fecha Final Calculada (Previsualización)
                  </div>
                  <div className="text-sm font-black text-white">
                    {fechaCalculadaPreview.fechaFormateada}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    {fechaCalculadaPreview.esBaseHoy ? (
                      <span className="text-amber-300 font-medium">
                        ⚠️ Dado que el trial ya expiró o venció previamente, los {fechaCalculadaPreview.dias} días se suman a partir de <strong>hoy (fecha actual)</strong>, reactivando la cuenta de inmediato.
                      </span>
                    ) : (
                      <span>
                        Calculada sumando {fechaCalculadaPreview.dias} días a partir de la fecha de vencimiento vigente.
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Motivo de la extensión (para log de auditoría):
                </label>
                <input
                  type="text"
                  value={motivoExtender}
                  onChange={(e) => setMotivoExtender(e.target.value)}
                  placeholder="Ej. Cortesía por retraso en capacitación del personal"
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              {errorExtender && (
                <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorExtender}</span>
                </div>
              )}

              {exitoExtender && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{exitoExtender}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRestauranteExtender(null)}
                  disabled={isPendingExtender}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmarExtender}
                  disabled={isPendingExtender}
                  className="bg-orange-600 hover:bg-orange-500"
                >
                  {isPendingExtender ? "Guardando extensión..." : "Confirmar Extensión de Trial"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: DETALLE RESTAURANTE & STRIPE */}
        {restauranteDetalle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 text-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-white text-base">{restauranteDetalle.nombre}</h3>
                </div>
                <button
                  onClick={() => setRestauranteDetalle(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-500">ID Restaurante:</span>
                  <div className="font-mono text-slate-300 text-[11px]">{restauranteDetalle.id}</div>
                </div>
                <div>
                  <span className="text-slate-500">Plan actual:</span>
                  <div className="font-bold uppercase text-white">{restauranteDetalle.plan}</div>
                </div>
                <div>
                  <span className="text-slate-500">Zona horaria:</span>
                  <div className="text-slate-300">{restauranteDetalle.timezone}</div>
                </div>
                <div>
                  <span className="text-slate-500">Stripe Customer ID:</span>
                  <div className="font-mono text-slate-300 text-[11px]">
                    {restauranteDetalle.stripe_customer_id || "Sin ID Stripe registrado"}
                  </div>
                </div>
              </div>

              {/* Historial de Facturación Stripe */}
              <div>
                <h4 className="font-semibold text-xs text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  Historial de Pagos / Facturas en Stripe
                </h4>
                {restauranteDetalle.historialStripe && restauranteDetalle.historialStripe.length > 0 ? (
                  <div className="border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-slate-400">
                        <tr>
                          <th className="p-2">Factura</th>
                          <th className="p-2">Fecha</th>
                          <th className="p-2">Monto</th>
                          <th className="p-2">Estado</th>
                          <th className="p-2 text-right">Comprobante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {restauranteDetalle.historialStripe.map((f: any) => (
                          <tr key={f.id} className="hover:bg-slate-800/40">
                            <td className="p-2 font-mono text-[11px]">{f.numero || f.id}</td>
                            <td className="p-2">{new Date(f.fecha).toLocaleDateString()}</td>
                            <td className="p-2 font-bold">${f.total.toFixed(2)} {f.moneda}</td>
                            <td className="p-2 capitalize">{f.estado}</td>
                            <td className="p-2 text-right">
                              {f.urlPdf ? (
                                <a
                                  href={f.urlPdf}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-orange-400 hover:underline inline-flex items-center gap-1"
                                >
                                  Ver PDF <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-800/30 border border-slate-800 rounded-lg text-xs text-slate-500 text-center">
                    {restauranteDetalle.stripe_customer_id
                      ? "No se registran facturas aún en Stripe para este cliente."
                      : "Este restaurante aún no cuenta con un Customer ID en Stripe (en trial directo)."}
                  </div>
                )}
              </div>

              {/* Tickets de Soporte asociados */}
              <div>
                <h4 className="font-semibold text-xs text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <LifeBuoy className="w-4 h-4 text-orange-400" />
                  Tickets de Soporte de este Restaurante
                </h4>
                {restauranteDetalle.ticketsSoporte && restauranteDetalle.ticketsSoporte.length > 0 ? (
                  <div className="space-y-2">
                    {restauranteDetalle.ticketsSoporte.map((tk: any) => (
                      <div key={tk.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span>{tk.asunto}</span>
                          <span className="uppercase text-[10px] text-slate-400">{tk.estado}</span>
                        </div>
                        <p className="text-slate-400 text-[11px]">{tk.mensaje}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-800/30 border border-slate-800 rounded-lg text-xs text-slate-500 text-center">
                    Sin tickets de soporte registrados.
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <Button variant="ghost" size="sm" onClick={() => setRestauranteDetalle(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: RESPONDER TICKET */}
        {ticketResponder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4 text-slate-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-white text-sm">Atender Ticket de Soporte</h3>
                </div>
                <button
                  onClick={() => setTicketResponder(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-800/50 p-3 rounded-lg text-xs space-y-1 border border-slate-800">
                <div className="font-bold text-white">{ticketResponder.asunto}</div>
                <div className="text-slate-400">
                  {ticketResponder.restaurante_nombre} • {ticketResponder.usuario_nombre} ({ticketResponder.usuario_email})
                </div>
                <div className="text-slate-300 pt-1 border-t border-slate-700 mt-2">
                  {ticketResponder.mensaje}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Respuesta Oficial de RestauraCore:
                </label>
                <textarea
                  rows={5}
                  value={textoRespuesta}
                  onChange={(e) => setTextoRespuesta(e.target.value)}
                  placeholder="Escribe la solución o respuesta clara para el cliente..."
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nuevo estado del ticket:
                </label>
                <select
                  value={estadoRespuesta}
                  onChange={(e) => setEstadoRespuesta(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none"
                >
                  <option value="resuelto">✓ Resuelto (Cerrar ticket)</option>
                  <option value="en_proceso">⏳ En Proceso (Continuar seguimiento)</option>
                </select>
              </div>

              {errorResponder && (
                <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-lg">
                  {errorResponder}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTicketResponder(null)}
                  disabled={isPendingResponder}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmarResponder}
                  disabled={isPendingResponder}
                  className="bg-orange-600 hover:bg-orange-500 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPendingResponder ? "Enviando respuesta..." : "Enviar Respuesta"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

