"use client";

import React, { useState } from "react";
import {
  Bell,
  XCircle,
  AlertTriangle,
  ShoppingCart,
  Package,
  CheckCircle2,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { marcarMermaRevisadaAction } from "@/lib/notificaciones-queries";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface NotificacionesData {
  totalAlertas: number;
  cancelacionesPendientes: number;
  mermasRevision: number;
  incidenciasCompras: number;
  stockBajo: number;
  listaCancelaciones: Array<{
    id: string;
    mesa_numero: number;
    platillo_nombre: string;
    cantidad: number;
    solicitante_nombre: string;
    motivo: string;
    creado_en: Date | string;
  }>;
  listaMermas: Array<{
    id: string;
    ingrediente_nombre: string;
    cantidad: string;
    unidad_medida: string;
    motivo: string | null;
    creado_en: Date | string;
    creado_por_nombre: string;
  }>;
  listaIncidencias: Array<{
    id: string;
    total_real: string | null;
    total_estimado: string | null;
    creado_en: Date | string;
  }>;
  listaStockBajo: Array<{
    id: string;
    nombre: string;
    stock_actual: string;
    stock_minimo: string;
    unidad_medida: string;
  }>;
}

export function NotificacionesView({ data }: { data: NotificacionesData }) {
  const { toast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("todas");
  const [marcandoId, setMarcandoId] = useState<string | null>(null);

  async function handleMarcarRevisada(movimientoId: string) {
    setMarcandoId(movimientoId);
    try {
      const res = await marcarMermaRevisadaAction(movimientoId);
      if (res.ok) {
        toast("Merma marcada como revisada.", "success");
        router.refresh();
      }
    } catch (err: any) {
      toast(err.message || "Error al actualizar", "error");
    } finally {
      setMarcandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── ENCABEZADO ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            Bandeja de Notificaciones y Alertas
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Centro de monitoreo operativo y triage de anomalías, mermas sobre umbral e incidencias.
          </p>
        </div>

        <Badge variant={data.totalAlertas > 0 ? "danger" : "success"} size="md">
          {data.totalAlertas} alerta(s) activas
        </Badge>
      </div>

      {/* ─── PESTAÑAS ───────────────────────────────────────────────────────── */}
      <Tabs
        tabs={[
          { id: "todas", label: "Todas las Alertas", count: data.totalAlertas },
          { id: "cancelaciones", label: "Cancelaciones", count: data.cancelacionesPendientes },
          { id: "mermas", label: "Mermas > Umbral", count: data.mermasRevision },
          { id: "compras", label: "Incidencias Compras", count: data.incidenciasCompras },
          { id: "stock", label: "Stock Crítico", count: data.stockBajo },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ─── SECCIÓN 1: CANCELACIONES PENDIENTES ────────────────────────────── */}
      {(activeTab === "todas" || activeTab === "cancelaciones") && data.listaCancelaciones.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <XCircle className="w-4 h-4" />
                Solicitudes de Cancelación de Platillos ({data.listaCancelaciones.length})
              </CardTitle>
              <CardDescription>Requieren aprobación o rechazo de supervisión</CardDescription>
            </div>
            <Link href="/cancelaciones">
              <Button size="sm" variant="danger">
                Ir a Aprobar <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {data.listaCancelaciones.map((canc) => (
              <div
                key={canc.id}
                className="p-3 rounded-xl border border-rose-100 dark:border-rose-950/80 bg-rose-50/40 dark:bg-rose-950/30 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Mesa #{canc.mesa_numero} • {canc.cantidad}x {canc.platillo_nombre}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Solicitado por: <strong>{canc.solicitante_nombre}</strong> — "{canc.motivo}"
                  </p>
                </div>
                <Link href="/cancelaciones">
                  <Button size="sm" variant="outline">
                    Revisar
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── SECCIÓN 2: MERMAS PENDIENTES DE REVISIÓN ────────────────────────── */}
      {(activeTab === "todas" || activeTab === "mermas") && data.listaMermas.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                Mermas sobre Umbral sin Revisar ({data.listaMermas.length})
              </CardTitle>
              <CardDescription>
                Mermas automáticas o manuales que superaron el umbral monetario de tolerancia
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {data.listaMermas.map((merma) => (
              <div
                key={merma.id}
                className="p-3.5 rounded-xl border border-amber-100 dark:border-amber-950/80 bg-amber-50/40 dark:bg-amber-950/30 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {merma.ingrediente_nombre} — {parseFloat(merma.cantidad)} {merma.unidad_medida}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Registrado por: <strong>{merma.creado_por_nombre}</strong> • Motivo:{" "}
                    {merma.motivo || "Sin nota"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={marcandoId === merma.id}
                  onClick={() => handleMarcarRevisada(merma.id)}
                >
                  Marcar Revisada
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── SECCIÓN 3: INCIDENCIAS EN COMPRAS ──────────────────────────────── */}
      {(activeTab === "todas" || activeTab === "compras") && data.listaIncidencias.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <ShoppingCart className="w-4 h-4" />
                Incidencias en Recepción de Mercancía ({data.listaIncidencias.length})
              </CardTitle>
              <CardDescription>Órdenes de compra recibidas con faltantes o anomalías</CardDescription>
            </div>
            <Link href="/compras">
              <Button size="sm" variant="outline">
                Ir a Compras
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {data.listaIncidencias.map((compra) => (
              <div
                key={compra.id}
                className="p-3 rounded-xl border border-purple-100 dark:border-purple-950/80 bg-purple-50/40 dark:bg-purple-950/30 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Compra con Incidencia • Total: ${compra.total_real || compra.total_estimado || "0.00"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Registrada el {new Date(compra.creado_en).toLocaleDateString()}
                  </p>
                </div>
                <Link href="/compras">
                  <Button size="sm" variant="ghost">
                    Ver Pedido
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── SECCIÓN 4: STOCK CRÍTICO ───────────────────────────────────────── */}
      {(activeTab === "todas" || activeTab === "stock") && data.listaStockBajo.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2 text-sky-600 dark:text-sky-400">
                <Package className="w-4 h-4" />
                Ingredientes Bajo Stock Mínimo ({data.listaStockBajo.length})
              </CardTitle>
              <CardDescription>Insumos agotados o por debajo de su punto de reorden</CardDescription>
            </div>
            <Link href="/inventario">
              <Button size="sm" variant="outline">
                Ir a Inventario
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.listaStockBajo.map((ing) => (
                <div key={ing.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{ing.nombre}</p>
                    <p className="text-[11px] text-slate-400">
                      Actual:{" "}
                      <strong className="text-rose-600">
                        {parseFloat(ing.stock_actual)} {ing.unidad_medida}
                      </strong>{" "}
                      (Mínimo: {parseFloat(ing.stock_minimo)} {ing.unidad_medida})
                    </p>
                  </div>
                  <Link href="/compras">
                    <Button size="sm" variant="ghost">
                      Sugerir Compra
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── ESTADO VACÍO ───────────────────────────────────────────────────── */}
      {data.totalAlertas === 0 && (
        <div className="p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-90" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Bandeja Limpia
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No hay solicitudes de cancelación pendientes, mermas sobre el umbral sin revisar, ni
            incidencias operativas activas.
          </p>
        </div>
      )}
    </div>
  );
}
