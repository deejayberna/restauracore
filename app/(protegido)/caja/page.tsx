import React from "react";
import { getProtectedLayoutData } from "@/lib/layout-queries";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { DollarSign, Coins, Clock, ArrowRight, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { turnos, usuarios, ordenes, mesas } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SeccionRecibosCaja } from "@/components/caja/SeccionRecibosCaja";


export default async function CajaDashboardPage() {
  const { user, currentBranchId } = await getProtectedLayoutData();

  if (!["cajero", "mesero", "gerente", "dueno"].includes(user.rol)) {
    redirect("/home");
  }

  // Turno activo
  const turnoActivo = await db.query.turnos.findFirst({
    where: and(
      eq(turnos.restaurante_id, currentBranchId),
      eq(turnos.estado, "abierto")
    ),
    orderBy: desc(turnos.fecha_inicio),
  });

  // Turnos recientes
  const turnosRecientes = await db
    .select({
      id: turnos.id,
      estado: turnos.estado,
      fecha_inicio: turnos.fecha_inicio,
      fecha_cierre: turnos.fecha_cierre,
      responsable_nombre: usuarios.nombre,
    })
    .from(turnos)
    .leftJoin(usuarios, eq(usuarios.id, turnos.responsable_id))
    .where(eq(turnos.restaurante_id, currentBranchId))
    .orderBy(desc(turnos.fecha_inicio))
    .limit(5);

  // Órdenes cobradas recientes para emisión y reimpresión de recibos
  const ordenesCobradas = await db
    .select({
      id: ordenes.id,
      total: ordenes.total,
      creado_en: ordenes.creado_en,
      mesa_numero: mesas.numero,
    })
    .from(ordenes)
    .leftJoin(mesas, eq(mesas.id, ordenes.mesa_id))
    .where(
      and(
        eq(ordenes.restaurante_id, currentBranchId),
        eq(ordenes.estado, "pagado")
      )
    )
    .orderBy(desc(ordenes.creado_en))
    .limit(5);


  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <DollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          Módulo de Caja y Turnos
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Apertura, conciliación, arqueo de caja con control anti-robo y liquidación de propinas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tarjeta Arqueo / Cierre */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Arqueo y Cierre de Turno
            </CardTitle>
            <CardDescription>
              Captura física de efectivo, tarjetas y conciliación con el sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Estado actual:</span>
              <Badge variant={turnoActivo ? "success" : "warning"} dot size="sm">
                {turnoActivo ? "Turno en curso" : "Sin turno abierto"}
              </Badge>
            </div>

            <Link href="/caja/cierre" className="block pt-2">
              <Button size="md" className="w-full">
                {turnoActivo ? "Realizar Corte de Caja" : "Abrir / Iniciar Turno"}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Tarjeta Propinas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              Liquidación de Propinas
            </CardTitle>
            <CardDescription>
              Reporte de propinas por mesero desglosado por método de pago.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Visualiza e imprime el desglose por mesero y método (efectivo, tarjeta,
              transferencia).
            </p>

            <Link href="/caja/propinas" className="block pt-2">
              <Button variant="secondary" size="md" className="w-full">
                Consultar Reporte de Propinas
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Emisión e Impresión de Recibos Térmicos */}
      <SeccionRecibosCaja ordenesRecientes={ordenesCobradas} />

      {/* Turnos Recientes */}
      <Card>

        <CardHeader>
          <CardTitle className="text-sm">Historial de Turnos Recientes</CardTitle>
          <CardDescription>Últimos cortes registrados en esta sucursal</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {turnosRecientes.map((t) => (
              <div key={t.id} className="p-3.5 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.estado === "abierto" ? "success" : "neutral"} size="sm">
                      {t.estado.toUpperCase()}
                    </Badge>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(t.fecha_inicio).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Responsable: {t.responsable_nombre || "Sin asignar"}
                  </p>
                </div>

                <Link href={`/caja/propinas?turno_id=${t.id}`}>
                  <Button variant="ghost" size="sm">
                    Ver Propinas
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
