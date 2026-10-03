import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import {
  UtensilsCrossed,
  DollarSign,
  ChefHat,
  Package,
  Users,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Coins,
  XCircle,
  Clock,
  BookOpen,
  Wine,
  Sparkles,
} from "lucide-react";
import { db } from "@/db";
import {
  mesas,
  ordenes,
  ordenItems,
  platillos,
  turnos,
  solicitudesCancelacionItem,
  asignacionesMesa,
} from "@/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { PanelMesasOperativas } from "@/components/mesas/PanelMesasOperativas";
import { obtenerMesasOperativasAction } from "@/lib/mesas-actions";

export default async function HomePage() {
  const { user, currentBranchId } = await getProtectedLayoutData();
  const fechaHoy = new Date().toISOString().slice(0, 10);

  // ─── CONSULTAS SEGÚN ROL ───────────────────────────────────────────────────

  // Datos para Mesero y Supervisor de Piso (Mesas Operativas Exclusivas)
  let mesasOperativasData: any = null;
  if (["mesero", "supervisor_piso"].includes(user.rol)) {
    try {
      mesasOperativasData = await obtenerMesasOperativasAction();
    } catch (e) {
      console.error("Error al obtener mesas operativas:", e);
    }
  }

  // Datos para Bartender
  let itemsEnBarra = 0;
  let itemsListosBarra = 0;
  if (user.rol === "bartender" || user.rol === "gerente" || user.rol === "dueno") {
    const countsBarra = await db
      .select({
        estado: ordenItems.estado,
        total: count(),
      })
      .from(ordenItems)
      .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
      .innerJoin(platillos, eq(platillos.id, ordenItems.platillo_id))
      .where(
        and(
          eq(ordenes.restaurante_id, currentBranchId),
          eq(platillos.estacion, "bar"),
          sql`${ordenItems.estado} IN ('pendiente', 'en_preparacion', 'listo')`
        )
      )
      .groupBy(ordenItems.estado);

    for (const c of countsBarra) {
      if (c.estado === "en_preparacion" || c.estado === "pendiente") {
        itemsEnBarra += Number(c.total);
      } else if (c.estado === "listo") {
        itemsListosBarra += Number(c.total);
      }
    }
  }

  // Datos para Food Runner
  let itemsListosParaEntregar = 0;
  if (user.rol === "food_runner") {
    const [c] = await db
      .select({ total: count() })
      .from(ordenItems)
      .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
      .where(
        and(
          eq(ordenes.restaurante_id, currentBranchId),
          eq(ordenItems.estado, "listo")
        )
      );
    itemsListosParaEntregar = Number(c?.total ?? 0);
  }

  // Datos para Anfitrión
  let conteoMesasTotal = 0;
  let conteoMesasOcupadas = 0;
  if (user.rol === "anfitrion") {
    const mesasRest = await db.query.mesas.findMany({
      where: eq(mesas.restaurante_id, currentBranchId),
    });
    conteoMesasTotal = mesasRest.length;
    conteoMesasOcupadas = mesasRest.filter((m) => m.mesero_actual_id !== null).length;
  }

  // Datos para Cajero
  let turnoActivoCajero: any = null;
  if (user.rol === "cajero" || user.rol === "gerente" || user.rol === "dueno") {
    turnoActivoCajero = await db.query.turnos.findFirst({
      where: and(
        eq(turnos.restaurante_id, currentBranchId),
        eq(turnos.estado, "abierto")
      ),
      orderBy: desc(turnos.fecha_inicio),
    });
  }

  // Datos para Chef
  let itemsEnCocina = 0;
  let itemsListos = 0;
  if (user.rol === "chef" || user.rol === "gerente" || user.rol === "dueno") {
    const countsCocina = await db
      .select({
        estado: ordenItems.estado,
        total: count(),
      })
      .from(ordenItems)
      .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
      .where(
        and(
          eq(ordenes.restaurante_id, currentBranchId),
          sql`${ordenItems.estado} IN ('confirmada', 'en_preparacion', 'listo')`
        )
      )
      .groupBy(ordenItems.estado);

    for (const c of countsCocina) {
      if (c.estado === "en_preparacion" || c.estado === "confirmada") {
        itemsEnCocina += Number(c.total);
      } else if (c.estado === "listo") {
        itemsListos += Number(c.total);
      }
    }
  }

  // Datos para Gerente / Dueño
  let cancelacionesPendientes = 0;
  let ventasHoy = 0;
  if (["gerente", "dueno"].includes(user.rol)) {
    const [cancRes] = await db
      .select({ total: count() })
      .from(solicitudesCancelacionItem)
      .where(
        and(
          eq(solicitudesCancelacionItem.restaurante_id, currentBranchId),
          eq(solicitudesCancelacionItem.estado, "pendiente")
        )
      );
    cancelacionesPendientes = cancRes?.total ?? 0;

    const [ventasRes] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${ordenes.total}), 0)`,
      })
      .from(ordenes)
      .where(
        and(
          eq(ordenes.restaurante_id, currentBranchId),
          eq(ordenes.estado, "pagado"),
          sql`DATE(${ordenes.creado_en}) = CURRENT_DATE`
        )
      );
    ventasHoy = Number(ventasRes?.total ?? 0);
  }

  return (
    <div className="space-y-6">
      {/* ─── BANNER DE BIENVENIDA ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-sky-600 to-indigo-700 dark:from-sky-950 dark:to-indigo-950 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full backdrop-blur-xs">
              Estación de Trabajo
            </span>
            <span className="text-xs text-sky-100 uppercase tracking-wide">
              • Rol: <strong>{user.rol}</strong>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Hola, {user.nombre}
          </h1>
          <p className="text-xs sm:text-sm text-sky-100 mt-1 max-w-xl">
            Bienvenido al panel operativo de Restauracore. Aquí tienes el resumen y accesos
            principales para tu turno de hoy.
          </p>
        </div>
      </div>

      {/* ─── VISTA PARA MESERO Y SUPERVISOR DE PISO (MESAS EXCLUSIVAS) ──────── */}
      {["mesero", "supervisor_piso"].includes(user.rol) && mesasOperativasData && (
        <PanelMesasOperativas
          usuarioActual={mesasOperativasData.usuario_actual}
          mesasIniciales={mesasOperativasData.mesas}
          meserosDisponibles={mesasOperativasData.meseros_disponibles}
        />
      )}

      {/* ─── VISTA PARA BARTENDER ───────────────────────────────────────────── */}
      {user.rol === "bartender" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wine className="w-4 h-4 text-purple-600" />
                Comandas en Barra
              </CardTitle>
              <CardDescription>Bebidas y cocteles pendientes de preparación</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-purple-600 dark:text-purple-400">
                {itemsEnBarra}
              </div>
              <p className="text-xs text-slate-500 mt-1">Tragos y bebidas en preparación actualmente.</p>
              <Link href="/barra" className="mt-4 block">
                <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                  Abrir Monitor KDS Barra <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-emerald-600" />
                Bebidas Listas para Servir
              </CardTitle>
              <CardDescription>Esperando que el mesero o food runner las recoja</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {itemsListosBarra}
              </div>
              <p className="text-xs text-slate-500 mt-1">Listas en barra para entrega a sala.</p>
              <Link href="/barra" className="mt-4 block">
                <Button variant="secondary" size="sm" className="w-full">
                  Ver KDS Barra
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── VISTA PARA FOOD RUNNER ─────────────────────────────────────────── */}
      {user.rol === "food_runner" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
                Platillos y Bebidas Listas para Entrega
              </CardTitle>
              <CardDescription>Esperando ser llevados a las mesas de los comensales</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {itemsListosParaEntregar}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Órdenes listas en barra o cocina esperando a ser servidas.
              </p>
              <div className="flex gap-2 mt-4">
                <Link href="/cocina" className="flex-1">
                  <Button size="sm" className="w-full">
                    KDS Cocina <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
                <Link href="/barra" className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full">
                    KDS Barra <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── VISTA PARA ANFITRIÓN ───────────────────────────────────────────── */}
      {user.rol === "anfitrion" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <UtensilsCrossed className="w-4 h-4 text-sky-600" />
                Ocupación de Mesas en Sala
              </CardTitle>
              <CardDescription>Monitoreo de disponibilidad para asignación de comensales</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-slate-900 dark:text-slate-100">
                {conteoMesasTotal - conteoMesasOcupadas} / {conteoMesasTotal}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {conteoMesasTotal - conteoMesasOcupadas} mesa(s) disponibles para sentar clientes.
              </p>
              <Link href="/mesas" className="mt-4 block">
                <Button size="sm" className="w-full">
                  Ver Plano de Mesas <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── VISTA PARA CAJERO ──────────────────────────────────────────────── */}
      {user.rol === "cajero" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Estado del Turno de Caja
              </CardTitle>
              <CardDescription>Control de turno y apertura</CardDescription>
            </CardHeader>
            <CardContent>
              {turnoActivoCajero ? (
                <div>
                  <Badge variant="success" dot size="md">
                    Turno Abierto
                  </Badge>
                  <p className="text-xs text-slate-500 mt-2">
                    Iniciado a las:{" "}
                    <strong>
                      {new Date(turnoActivoCajero.fecha_inicio).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                  </p>
                  <Link href="/caja" className="mt-4 block">
                    <Button size="sm" className="w-full">
                      Realizar Arqueo / Cierre <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div>
                  <Badge variant="warning" dot size="md">
                    Sin Turno Abierto
                  </Badge>
                  <p className="text-xs text-slate-500 mt-2">
                    Debes abrir un nuevo turno de caja para procesar pagos.
                  </p>
                  <Link href="/caja" className="mt-4 block">
                    <Button size="sm" className="w-full">
                      Abrir Turno de Caja
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Coins className="w-4 h-4 text-amber-600" />
                Reporte de Propinas
              </CardTitle>
              <CardDescription>Desglose por método de pago del turno</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">
                Consulta y audita las propinas registradas en efectivo, tarjeta y transferencia
                para el reparto equitativo.
              </p>
              <Link href="/caja/propinas" className="mt-4 block">
                <Button variant="secondary" size="sm" className="w-full">
                  Ver Desglose de Propinas
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── VISTA PARA CHEF ────────────────────────────────────────────────── */}
      {user.rol === "chef" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ChefHat className="w-4 h-4 text-rose-600" />
                Tickets en Cocina
              </CardTitle>
              <CardDescription>Platillos pendientes de preparación</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-rose-600 dark:text-rose-400">
                {itemsEnCocina}
              </div>
              <p className="text-xs text-slate-500 mt-1">Platillos en preparación actualmente.</p>
              <Link href="/cocina" className="mt-4 block">
                <Button size="sm" className="w-full">
                  Abrir Monitor KDS <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-emerald-600" />
                Platillos Listos para Entrega
              </CardTitle>
              <CardDescription>Esperando que el mesero los recoja</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {itemsListos}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Listos en barra de salida para ser servidos a la mesa.
              </p>
              <Link href="/cocina" className="mt-4 block">
                <Button variant="secondary" size="sm" className="w-full">
                  Ver Comandas en KDS
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── VISTA PARA GERENTE / DUEÑO ─────────────────────────────────────── */}
      {["gerente", "dueno"].includes(user.rol) && (
        <div className="space-y-6">
          {/* Alerta prioritaria si hay cancelaciones pendientes */}
          {cancelacionesPendientes > 0 && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-900 dark:text-rose-100">
                    {cancelacionesPendientes} Solicitud(es) de Cancelación Pendiente(s)
                  </h4>
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    Meseros han solicitado cancelar platillos en preparación o entregados. Requieren
                    tu autorización.
                  </p>
                </div>
              </div>
              <Link href="/cancelaciones">
                <Button variant="danger" size="sm">
                  Atender Ahora
                </Button>
              </Link>
            </div>
          )}

          {/* Tarjetas KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs text-slate-500 uppercase">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Ventas Pagadas Hoy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  ${ventasHoy.toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Total cobrado en el día</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs text-slate-500 uppercase">
                  <DollarSign className="w-4 h-4 text-sky-600" />
                  Caja y Turno Activo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {turnoActivoCajero ? (
                  <div>
                    <Badge variant="success" dot size="sm">
                      Abierto
                    </Badge>
                    <p className="text-[11px] text-slate-500 mt-1">Turno en operación</p>
                  </div>
                ) : (
                  <div>
                    <Badge variant="warning" dot size="sm">
                      Cerrado
                    </Badge>
                    <p className="text-[11px] text-slate-500 mt-1">Sin turno activo</p>
                  </div>
                )}
                <Link href="/caja" className="mt-2 block text-xs text-sky-600 font-semibold hover:underline">
                  Ver detalles de caja →
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs text-slate-500 uppercase">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Gestión de Personal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Administra roles, invita personal y asigna mesas.
                </p>
                <Link href="/personal" className="mt-2 block text-xs text-indigo-600 font-semibold hover:underline">
                  Ir al módulo de personal →
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Accesos rápidos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Accesos Operativos Rápidos</CardTitle>
              <CardDescription>Módulos de supervisión y control</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Link href="/mesas">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 dark:hover:border-sky-500 transition-colors flex flex-col items-center text-center gap-2">
                    <UtensilsCrossed className="w-5 h-5 text-sky-600" />
                    <span className="text-xs font-semibold">Mesas</span>
                  </div>
                </Link>
                <Link href="/cocina">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 dark:hover:border-sky-500 transition-colors flex flex-col items-center text-center gap-2">
                    <ChefHat className="w-5 h-5 text-rose-600" />
                    <span className="text-xs font-semibold">Cocina KDS</span>
                  </div>
                </Link>
                <Link href="/barra">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-500 transition-colors flex flex-col items-center text-center gap-2">
                    <Wine className="w-5 h-5 text-purple-600" />
                    <span className="text-xs font-semibold">Barra KDS</span>
                  </div>
                </Link>
                <Link href="/inventario">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 dark:hover:border-sky-500 transition-colors flex flex-col items-center text-center gap-2">
                    <Package className="w-5 h-5 text-amber-600" />
                    <span className="text-xs font-semibold">Inventario</span>
                  </div>
                </Link>
                <Link href="/caja/propinas">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 dark:hover:border-sky-500 transition-colors flex flex-col items-center text-center gap-2">
                    <Coins className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-semibold">Propinas</span>
                  </div>
                </Link>
                <Link href="/menu/administrar">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-orange-500 dark:hover:border-orange-500 transition-colors flex flex-col items-center text-center gap-2">
                    <BookOpen className="w-5 h-5 text-orange-600" />
                    <span className="text-xs font-semibold">Menú & Recetas</span>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
