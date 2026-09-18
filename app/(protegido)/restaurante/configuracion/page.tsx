"use client";

import React, { useEffect, useState } from "react";
import {
  Store,
  CreditCard,
  ExternalLink,
  Receipt,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Save,
  Loader2,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  obtenerConfiguracionRestauranteAction,
  actualizarConfiguracionRestauranteAction,
} from "@/lib/restaurante-actions";
import {
  crearPortalClienteStripeAction,
  obtenerFacturasStripeAction,
} from "@/lib/stripe-billing-actions";
import { PLANES_DETALLE, type Plan } from "@/lib/planes";

interface FacturaItem {
  id: string;
  numero: string | null;
  fecha: string;
  monto: string;
  moneda: string;
  estado?: string | null;
  pdfUrl?: string | null;
  reciboUrl?: string | null;
}

export default function ConfiguracionRestaurantePage() {
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [abriendoPortal, setAbriendoPortal] = useState(false);

  // Datos del restaurante
  const [restauranteId, setRestauranteId] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [umbralFotoMerma, setUmbralFotoMerma] = useState(200);
  const [emailAlertas, setEmailAlertas] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [plan, setPlan] = useState<Plan>("basico");
  const [estadoSuscripcion, setEstadoSuscripcion] = useState<string>("trial");
  const [fechaFinTrial, setFechaFinTrial] = useState<string | null>(null);
  const [tieneStripe, setTieneStripe] = useState(false);
  const [rolUsuario, setRolUsuario] = useState<string>("");

  // Facturas
  const [facturas, setFacturas] = useState<FacturaItem[]>([]);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);

  useEffect(() => {
    async function cargarDatos() {
      try {
        const res = await obtenerConfiguracionRestauranteAction();
        const r = res.restaurante;
        setRestauranteId(r.id);
        setNombre(r.nombre);
        setDireccion(r.direccion);
        setTimezone(r.timezone || "America/Mexico_City");
        setUmbralFotoMerma(r.umbralFotoMerma || 200);
        setEmailAlertas(r.emailAlertas || "");
        setTelegramChatId(r.telegramChatId || "");
        setPlan((r.plan as Plan) || "basico");
        setEstadoSuscripcion(r.estadoSuscripcion || "trial");
        setFechaFinTrial(r.fechaFinTrial);
        setTieneStripe(r.tieneStripe);
        setRolUsuario(res.rol);

        if (r.tieneStripe) {
          setCargandoFacturas(true);
          const facRes = await obtenerFacturasStripeAction(r.id);
          setFacturas(facRes.facturas || []);
          setCargandoFacturas(false);
        }
      } catch (err: any) {
        toast(err.message || "Error al cargar configuración", "error");
      } finally {
        setCargando(false);
      }
    }
    cargarDatos();
  }, [toast]);

  async function handleGuardarDatos(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      toast("El nombre comercial es obligatorio.", "warning");
      return;
    }

    setGuardando(true);
    try {
      await actualizarConfiguracionRestauranteAction(restauranteId, {
        nombre,
        direccion,
        timezone,
        umbralFotoMerma: Number(umbralFotoMerma),
        emailAlertas,
        telegramChatId,
      });
      toast("Configuración guardada exitosamente.", "success");
    } catch (err: any) {
      toast(err.message || "Error al actualizar.", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function handleAbrirPortalStripe() {
    setAbriendoPortal(true);
    try {
      const res = await crearPortalClienteStripeAction(restauranteId);
      if (res.url) {
        window.location.href = res.url;
      } else {
        toast(res.error || "No se pudo acceder al portal de Stripe.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error al contactar con Stripe.", "error");
    } finally {
      setAbriendoPortal(false);
    }
  }

  const esDuenoOGerente = rolUsuario === "dueno" || rolUsuario === "gerente";

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-2" />
        <p className="text-sm">Cargando configuración de la sucursal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ─── HEADER ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <Store className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          Configuración de Sucursal y Suscripción
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Gestiona los parámetros de operación, membresía en Stripe y facturas de este restaurante.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── COLUMNA IZQUIERDA: TARJETA DE MEMBRESÍA ──────────────────────── */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="border-orange-200 dark:border-orange-950/60 shadow-sm">
            <CardHeader className="bg-orange-50/50 dark:bg-orange-950/20 pb-4 border-b border-orange-100 dark:border-orange-950/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <CreditCard className="w-4 h-4 text-orange-600" />
                  Membresía RestauraCore
                </CardTitle>
                <Badge
                  variant={
                    estadoSuscripcion === "activa"
                      ? "success"
                      : estadoSuscripcion === "trial"
                      ? "info"
                      : "warning"
                  }
                  size="sm"
                >
                  {estadoSuscripcion.toUpperCase()}
                </Badge>
              </div>
              <CardDescription>
                Plan actual: <span className="font-semibold text-orange-600 dark:text-orange-400 capitalize">{plan}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Cuota mensual:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {PLANES_DETALLE[plan].precioTexto}
                  </span>
                </div>
                {fechaFinTrial && (
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Fin de prueba:
                    </span>
                    <span className="font-medium">
                      {new Date(fechaFinTrial).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
                <p className="font-semibold text-slate-800 dark:text-slate-100">Módulos incluidos:</p>
                <ul className="space-y-1 text-[11px]">
                  {PLANES_DETALLE[plan].caracteristicas.slice(0, 5).map((c, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {tieneStripe ? (
                <div className="pt-2">
                  <Button
                    onClick={handleAbrirPortalStripe}
                    loading={abriendoPortal}
                    variant="outline"
                    className="w-full justify-center gap-2 border-slate-300 dark:border-slate-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Gestionar en Stripe
                  </Button>
                  <p className="text-[10px] text-slate-400 text-center mt-1.5">
                    Cambia método de pago, actualiza plan o descarga comprobantes fiscales.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-[11px]">
                  Restaurante configurado localmente sin ID de Stripe asociado.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── COLUMNA DERECHA: AJUSTES OPERATIVOS Y FACTURAS ────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Formulario de Parámetros */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="w-4 h-4 text-orange-600" />
                Parámetros Operativos de la Sucursal
              </CardTitle>
              <CardDescription>
                Información comercial utilizada en comandas, tickets y reportes fiscales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGuardarDatos} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nombre Comercial de la Sucursal *
                    </label>
                    <Input
                      type="text"
                      required
                      disabled={!esDuenoOGerente}
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ej: RestauraCore Centro"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Zona Horaria Operativa
                    </label>
                    <select
                      disabled={!esDuenoOGerente}
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
                      <option value="America/Monterrey">Monterrey (GMT-6)</option>
                      <option value="America/Tijuana">Tijuana (GMT-8)</option>
                      <option value="America/Bogota">Bogotá / Lima (GMT-5)</option>
                      <option value="America/Santiago">Santiago (GMT-4)</option>
                      <option value="America/Buenos_Aires">Buenos Aires (GMT-3)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dirección Física / Ubicación
                  </label>
                  <Input
                    type="text"
                    disabled={!esDuenoOGerente}
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Calle, Número, Colonia, Ciudad"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Umbral Fotográfico para Registro de Mermas ($ MXN)
                  </label>
                  <Input
                    type="number"
                    step="10"
                    disabled={!esDuenoOGerente}
                    value={umbralFotoMerma}
                    onChange={(e) => setUmbralFotoMerma(Number(e.target.value))}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Toda merma con costo estimado igual o superior a este monto requerirá fotografía obligatoria para ser registrada.
                  </p>
                </div>

                {/* ─── CANALES DE NOTIFICACIÓN DE ALERTAS OPERATIVAS ─── */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-orange-600" />
                      Canales para Alertas Operativas Críticas
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Recibe avisos inmediatos ante discrepancias en caja, robo sospechado, incidencias de compra y cancelaciones.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Email de Alertas Operativas
                    </label>
                    <Input
                      type="email"
                      disabled={!esDuenoOGerente}
                      value={emailAlertas}
                      onChange={(e) => setEmailAlertas(e.target.value)}
                      placeholder="alertas@turestaurante.com (o déjalo vacío para usar el email de los dueños)"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Si especificas un correo, las alertas llegarán a este buzón general además de enviarse a todos los usuarios con rol de Dueño.
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Chat ID de Telegram para Alertas
                      </label>
                      <Badge variant="neutral" size="sm">Opcional</Badge>
                    </div>
                    <Input
                      type="text"
                      disabled={!esDuenoOGerente}
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="Ej: 123456789 (privado) o -1001234567890 (grupo)"
                    />
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="font-semibold text-slate-700 dark:text-slate-300">¿Cómo vincular tu Telegram o grupo?</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-[10.5px]">
                        <li>Inicia chat con tu bot de alertas de RestauraCore o agrégalo a tu grupo de gerentes.</li>
                        <li>Para conocer tu Chat ID numérico, reenvía cualquier mensaje al bot gratuito <code className="text-orange-600 dark:text-orange-400 font-mono">@userinfobot</code> o <code className="text-orange-600 dark:text-orange-400 font-mono">@RawDataBot</code> en Telegram.</li>
                        <li>Copia el número resultante (ej. <code>423720063</code>) y pégalo arriba.</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {esDuenoOGerente && (
                  <div className="flex justify-end pt-2">
                    <Button type="submit" loading={guardando} className="gap-2 bg-orange-600 hover:bg-orange-500">
                      <Save className="w-4 h-4" />
                      Guardar Parámetros
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Historial de Facturas Stripe */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Facturas y Recibos de Membresía
              </CardTitle>
              <CardDescription>
                Historial de cobros de tu suscripción mensual procesados vía Stripe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cargandoFacturas ? (
                <div className="py-6 flex justify-center text-slate-400 text-xs gap-2 items-center">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                  Consultando facturas en Stripe...
                </div>
              ) : facturas.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No hay facturas registradas aún. El primer cobro se generará al finalizar los 14 días de prueba.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Número</th>
                        <th className="py-2.5 px-3">Monto</th>
                        <th className="py-2.5 px-3">Estado</th>
                        <th className="py-2.5 px-3 text-right">Comprobante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {facturas.map((fac) => (
                        <tr key={fac.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {new Date(fac.fecha).toLocaleDateString("es-MX", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {fac.numero || fac.id.slice(0, 10)}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            ${fac.monto} {fac.moneda}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={
                                fac.estado === "paid"
                                  ? "success"
                                  : fac.estado === "open"
                                  ? "warning"
                                  : "neutral"
                              }
                              size="sm"
                            >
                              {fac.estado === "paid" ? "Pagado" : fac.estado || "Borrador"}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {fac.pdfUrl ? (
                              <a
                                href={fac.pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-500 font-medium"
                              >
                                <Download className="w-3.5 h-3.5" /> PDF
                              </a>
                            ) : fac.reciboUrl ? (
                              <a
                                href={fac.reciboUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-500 font-medium"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Recibo
                              </a>
                            ) : (
                              <span className="text-slate-400">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

