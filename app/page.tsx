import type { Metadata } from "next";
import Link from "next/link";
import {
  UtensilsCrossed,
  Sparkles,
  QrCode,
  Flame,
  Boxes,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Store,
  Clock,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PLANES_DETALLE } from "@/lib/planes";

export const metadata: Metadata = {
  title: "RestauraCore — Automatiza tu Restaurante de Punta a Punta",
  description:
    "El sistema integral para restaurantes: pedidos por QR, cocina en tiempo real (KDS), inventario con descuento automático por recetas, arqueo ciego de caja e IA predictiva.",
  openGraph: {
    title: "RestauraCore — Software Inteligente para Restaurantes",
    description:
      "Digitaliza pedidos, elimina mermas no justificadas y maximiza el margen de tu restaurante con prueba gratuita de 14 días.",
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900 selection:bg-orange-500 selection:text-white">
      <MarketingHeader />

      {/* ─── Hero Section ────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28 border-b border-neutral-200/80 bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-orange-50 text-orange-800 border border-orange-200 mb-6 shadow-xs">
            <Sparkles className="w-4 h-4 text-orange-600" />
            <span>Prueba 14 días sin costo — Activación inmediata</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-neutral-900 max-w-4xl mx-auto leading-tight sm:leading-none">
            Automatiza tu restaurante <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-orange-600 to-amber-600">
              de punta a punta sin fugas
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            Desde el código QR en mesa y la comanda digital en cocina, hasta el descuento
            automático de gramajes en almacén, arqueo de caja e IA anti-robo.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/registro"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-base shadow-lg shadow-orange-600/25 transition-all hover:shadow-orange-600/35"
            >
              <span>Comenzar Prueba Gratis (14 Días)</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/precios"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-base transition-colors"
            >
              Ver Planes y Precios
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center gap-6 text-xs sm:text-sm text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Sin tarjeta de crédito
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Acceso completo 14 días
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Sin compromisos ni contratos
            </span>
          </div>
        </div>
      </section>

      {/* ─── Módulos Principales ─────────────────────────────────── */}
      <section id="modulos" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
            Módulos Operativos
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight">
            Todo lo que tu restaurante necesita en una sola plataforma
          </p>
          <p className="mt-3 text-neutral-600">
            Diseñado para eliminar el papel, la desorganización en cocina y los errores de inventario.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* 1. Pedido QR y Cuenta Abierta */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-xs hover:border-neutral-300 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center mb-5">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              Menú Digital & QR Dinámico
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Tus comensales escanean el QR de su mesa, piden desde su celular y acumulan rondas
              en una cuenta abierta con soporte de pagos divididos.
            </p>
          </div>

          {/* 2. KDS de Cocina */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-xs hover:border-neutral-300 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-5">
              <Flame className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              Comandera en Tiempo Real (KDS)
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Notificación acústica por comandas, cronómetro de urgencia por colores y confirmación
              inmediata para que cocina y salón trabajen coordinados.
            </p>
          </div>

          {/* 3. Inventario y Food Cost */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-xs hover:border-neutral-300 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-5">
              <Boxes className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              Inventario Automático por Recetas
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Cada platillo vendido descuenta gramos y mililitros exactos de almacén en tiempo real.
              Alertas automáticas de stock bajo y cálculo de rentabilidad.
            </p>
          </div>

          {/* 4. Arqueo y Caja */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-xs hover:border-neutral-300 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-5">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              Control de Turnos y Arqueo Ciego
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Apertura y cierre de turnos por cajero o mesero con conteo ciego en efectivo, tarjeta
              y transferencias para detectar discrepancias al instante.
            </p>
          </div>

          {/* 5. Control Anti-Robo */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-xs hover:border-neutral-300 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              Control Anti-Fuga: Mermas y Cancelaciones
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Foto obligatoria para mermas que superan tu umbral, y flujo de aprobación por gerente
              con justificación obligatoria para cancelar platillos en preparación.
            </p>
          </div>

          {/* 6. IA Predictiva & Multi-Sucursal */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-xs hover:border-neutral-300 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-5">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              IA Predictiva & Multi-Sucursal
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Predicción de demanda a 7 días, detección estadística de mermas sospechosas,
              análisis de ingeniería de menú y consolidación multi-sucursal para dueños.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Cómo Funciona ───────────────────────────────────────── */}
      <section id="como-funciona" className="py-16 bg-neutral-900 text-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-2">
              Proceso Simple
            </h2>
            <p className="text-3xl font-extrabold tracking-tight">
              Pasa de comanderos de papel a control digital hoy mismo
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center sm:text-left">
            <div className="p-6 rounded-2xl bg-neutral-800/60 border border-neutral-700/60">
              <div className="w-10 h-10 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center mb-4">
                1
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Registro Self-Service</h3>
              <p className="text-sm text-neutral-400">
                Registra tu restaurante en 2 minutos con tu plan preferido y 14 días de prueba
                gratuita garantizada por Stripe.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-neutral-800/60 border border-neutral-700/60">
              <div className="w-10 h-10 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center mb-4">
                2
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Configura tu Menú y Mesas</h3>
              <p className="text-sm text-neutral-400">
                El wizard de bienvenida te ayuda a cargar tus primeros platillos y descargar los
                códigos QR listos para imprimir en mesa.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-neutral-800/60 border border-neutral-700/60">
              <div className="w-10 h-10 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center mb-4">
                3
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Opera sin Fugas</h3>
              <p className="text-sm text-neutral-400">
                Invita a tu equipo (meseros, cajeros, chefs) con roles estrictos y supervisa tu
                restaurante desde tu celular en cualquier lugar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Resumen de Planes en Landing ────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
            Precios Transparentes
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight">
            Planes diseñados para cada etapa de tu restaurante
          </p>
          <p className="mt-3 text-neutral-600">
            Todos los planes incluyen 14 días de prueba gratuita. Sin contratos forzosos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {(["basico", "pro", "enterprise"] as const).map((planKey) => {
            const plan = PLANES_DETALLE[planKey];
            return (
              <div
                key={planKey}
                className={`relative rounded-2xl p-7 flex flex-col justify-between transition-all ${
                  plan.destacado
                    ? "border-2 border-orange-600 bg-white shadow-xl shadow-orange-500/10 scale-100 sm:scale-105"
                    : "border border-neutral-200 bg-white shadow-xs"
                }`}
              >
                {plan.destacado && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-orange-600 text-white text-xs font-bold uppercase tracking-wider">
                    Más Popular
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-neutral-900">{plan.nombre}</h3>
                  <p className="text-xs text-neutral-500 mt-1 min-h-[32px]">{plan.descripcion}</p>

                  <div className="mt-5 mb-6">
                    <span className="text-4xl font-extrabold text-neutral-900">${plan.precioMensual}</span>
                    <span className="text-sm font-medium text-neutral-500 ml-1">MXN / mes</span>
                  </div>

                  <ul className="space-y-3 text-sm text-neutral-600 mb-8">
                    {plan.caracteristicas.map((c, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={`/registro?plan=${planKey}`}
                  className={`w-full py-3 rounded-xl font-semibold text-sm text-center transition-colors ${
                    plan.destacado
                      ? "bg-orange-600 hover:bg-orange-700 text-white shadow-sm"
                      : "bg-neutral-900 hover:bg-neutral-800 text-white"
                  }`}
                >
                  Empezar Prueba Gratis
                </Link>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/precios"
            className="text-sm font-semibold text-orange-600 hover:text-orange-700 underline underline-offset-4"
          >
            Ver tabla comparativa detallada de características →
          </Link>
        </div>
      </section>

      {/* ─── CTA Final ───────────────────────────────────────────── */}
      <section className="bg-orange-600 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            ¿Listo para tener el control total de tu restaurante?
          </h2>
          <p className="mt-4 text-orange-100 text-lg">
            Únete hoy con 14 días de prueba sin riesgo y experimenta la diferencia operativa.
          </p>
          <div className="mt-8">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-orange-700 font-bold text-base shadow-lg hover:bg-orange-50 transition-colors"
            >
              <span>Crear mi Restaurante Ahora</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
