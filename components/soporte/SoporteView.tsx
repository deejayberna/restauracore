"use client";

import React, { useState, useTransition } from "react";
import { crearTicketSoporteAction } from "@/lib/soporte-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LifeBuoy, Send, MessageSquare, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export interface TicketSoporteItem {
  id: string;
  asunto: string;
  mensaje: string;
  estado: string;
  respuesta: string | null;
  creado_en: string | Date;
  respondido_en: string | Date | null;
}

interface SoporteViewProps {
  ticketsIniciales: TicketSoporteItem[];
  restauranteNombre: string;
}

export function SoporteView({ ticketsIniciales, restauranteNombre }: SoporteViewProps) {
  const [tickets, setTickets] = useState<TicketSoporteItem[]>(ticketsIniciales);
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (asunto.trim().length < 4) {
      setError("El asunto debe tener al menos 4 caracteres.");
      return;
    }
    if (mensaje.trim().length < 8) {
      setError("Por favor detalla tu solicitud con al menos 8 caracteres.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await crearTicketSoporteAction({
          asunto: asunto.trim(),
          mensaje: mensaje.trim(),
        });

        if (res.success) {
          const nuevoTicket: TicketSoporteItem = {
            id: res.ticketId,
            asunto: asunto.trim(),
            mensaje: mensaje.trim(),
            estado: "abierto",
            respuesta: null,
            creado_en: new Date(),
            respondido_en: null,
          };
          setTickets((prev) => [nuevoTicket, ...prev]);
          setAsunto("");
          setMensaje("");
          setSuccess("¡Tu ticket de soporte ha sido levantado exitosamente! El equipo de RestauraCore te responderá a la brevedad.");
        }
      } catch (err: any) {
        setError(err.message || "Error al crear el ticket de soporte.");
      }
    });
  }

  function getEstadoBadge(estado: string) {
    switch (estado) {
      case "resuelto":
        return (
          <Badge variant="success" size="sm" className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            RESUELTO
          </Badge>
        );
      case "en_proceso":
        return (
          <Badge variant="info" size="sm" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            EN PROCESO
          </Badge>
        );
      default:
        return (
          <Badge variant="warning" size="sm" className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            ABIERTO
          </Badge>
        );
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <LifeBuoy className="w-6 h-6 text-orange-500" />
          Soporte y Atención Técnica
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Comunícate directamente con el equipo fundador y técnico de RestauraCore para resolver dudas, incidencias o solicitar asistencia.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Formulario nuevo ticket */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-orange-500" />
                Levantar Nuevo Ticket
              </CardTitle>
              <CardDescription>
                Describe la situación o solicitud para asistirte de inmediato.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                {error && (
                  <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg text-red-600 dark:text-red-400 text-xs">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-lg text-emerald-700 dark:text-emerald-300 text-xs">
                    {success}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Asunto
                  </label>
                  <input
                    type="text"
                    required
                    value={asunto}
                    onChange={(e) => setAsunto(e.target.value)}
                    placeholder="Ej. Duda con configuración de impresora o corte"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mensaje / Detalle
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder="Explica qué necesitas o qué problema estás experimentando..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPending ? "Enviando ticket..." : "Enviar Ticket"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Historial de tickets */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mis Tickets de Soporte ({tickets.length})</CardTitle>
              <CardDescription>
                Historial de solicitudes y respuestas del soporte oficial.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {tickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No has levantado ningún ticket de soporte hasta el momento.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tickets.map((t) => (
                    <div key={t.id} className="p-4 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          {getEstadoBadge(t.estado)}
                          <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                            {t.asunto}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(t.creado_en).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {t.mensaje}
                      </div>

                      {t.respuesta ? (
                        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 p-3 rounded-lg text-xs space-y-1">
                          <div className="flex items-center justify-between font-semibold text-emerald-800 dark:text-emerald-300">
                            <span>Respuesta oficial de Soporte RestauraCore:</span>
                            {t.respondido_en && (
                              <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                                {new Date(t.respondido_en).toLocaleString([], {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </span>
                            )}
                          </div>
                          <div className="text-emerald-900 dark:text-emerald-200 whitespace-pre-wrap">
                            {t.respuesta}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 italic">
                          <Clock className="w-3 h-3" />
                          Un especialista de RestauraCore está revisando tu solicitud.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

