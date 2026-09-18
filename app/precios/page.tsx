import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Minus, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PLANES_DETALLE } from "@/lib/planes";

export const metadata: Metadata = {
  title: "Planes y Precios — RestauraCore SaaS",
  description:
    "Compara nuestros planes Básico ($799), Pro ($1,499) y Enterprise ($2,999 MXN/mes). Incluye 14 días de prueba gratuita. Sin contratos forzosos.",
};

const FEATURES_COMPARATIVA = [
  { nombre: "Menú digital QR autogestionable", basico: true, pro: true, enterprise: true },
  { nombre: "Pedido por mesa / QR dinámico", basico: true, pro: true, enterprise: true },
  { nombre: "Comandera de cocina en tiempo real (KDS)", basico: true, pro: true, enterprise: true },
  { nombre: "Cuenta abierta y cobros en mesa", basico: true, pro: true, enterprise: true },
  { nombre: "Inventario automático descontado por recetas", basico: false, pro: true, enterprise: true },
  { nombre: "Alertas de stock bajo y crítico en tiempo real", basico: false, pro: true, enterprise: true },
  { nombre: "Cálculo de Food Cost y reporte de rentabilidad", basico: false, pro: true, enterprise: true },
  { nombre: "Control de turnos y arqueo ciego de caja", basico: false, pro: true, enterprise: true },
  { nombre: "Mermas con foto obligatoria y justificación", basico: false, pro: true, enterprise: true },
  { nombre: "Control anti-fraude de cancelaciones de comandas", basico: false, pro: true, enterprise: true },
  { nombre: "IA: Predicción de demanda a 7 días (clima y festivos)", basico: false, pro: false, enterprise: true },
  { nombre: "IA: Detección estadística de anomalías y mermas", basico: false, pro: false, enterprise: true },
  { nombre: "IA: Menu Engineering (Matriz BCG de rentabilidad)", basico: false, pro: false, enterprise: true },
  { nombre: "Dashboard multi-sucursal consolidado para dueños", basico: false, pro: false, enterprise: true },
  { nombre: "Gestión de compras, recepción y comparador de insumos", basico: false, pro: false, enterprise: true },
  { nombre: "Pistas de auditoría forense inmutable", basico: false, pro: false, enterprise: true },
];

export default function PreciosPage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900">
      <MarketingHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-900 border border-orange-200 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
            <span>14 Días de Prueba Gratuita en Todos los Planes</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-neutral-900">
            Precios justos, sin letras chiquitas
          </h1>
          <p className="mt-4 text-lg text-neutral-600">
            Escoge el plan ideal para tu restaurante. Puedes actualizar o cancelar en cualquier
            momento desde el portal de facturación de Stripe.
          </p>
        </div>

        {/* ─── Tarjetas de Planes ──────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {(["basico", "pro", "enterprise"] as const).map((key) => {
            const p = PLANES_DETALLE[key];
            return (
              <div
                key={key}
                className={`relative rounded-3xl p-8 bg-white border flex flex-col justify-between ${
                  p.destacado
                    ? "border-2 border-orange-600 shadow-xl shadow-orange-500/10 scale-100 lg:scale-105 z-10"
                    : "border-neutral-200 shadow-xs"
                }`}
              >
                {p.destacado && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-orange-600 text-white text-xs font-bold uppercase tracking-wider">
                    Plan Recomendado
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h2 className="text-2xl font-bold text-neutral-900">{p.nombre}</h2>
                  </div>
                  <p className="text-sm text-neutral-500 mb-6 min-h-[40px]">{p.descripcion}</p>

                  <div className="mb-8">
                    <span className="text-5xl font-extrabold text-neutral-900">${p.precioMensual}</span>
                    <span className="text-sm font-medium text-neutral-500 ml-1">MXN / mes</span>
                  </div>

                  <Link
                    href={`/registro?plan=${key}`}
                    className={`w-full py-3.5 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2 transition-all ${
                      p.destacado
                        ? "bg-orange-600 hover:bg-orange-700 text-white shadow-md hover:shadow-lg shadow-orange-600/25"
                        : "bg-neutral-900 hover:bg-neutral-800 text-white"
                    }`}
                  >
                    <span>Empezar Prueba Gratis</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                <div className="mt-8 pt-6 border-t border-neutral-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
                    Incluye:
                  </p>
                  <ul className="space-y-3 text-sm text-neutral-600">
                    {p.caracteristicas.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Tabla Comparativa Completa ─────────────────────────── */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 sm:p-10 shadow-sm mb-20 overflow-x-auto">
          <h2 className="text-2xl font-bold text-neutral-900 mb-6">Comparativa de Características</h2>

          <table className="w-full text-left text-sm text-neutral-700 border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-900">
                <th className="py-4 pr-4 font-bold text-base">Funcionalidad</th>
                <th className="py-4 px-4 font-bold text-center w-28 sm:w-36">Básico</th>
                <th className="py-4 px-4 font-bold text-center w-28 sm:w-36 text-orange-600 bg-orange-50/50 rounded-t-xl">
                  Pro
                </th>
                <th className="py-4 pl-4 font-bold text-center w-28 sm:w-36">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {FEATURES_COMPARATIVA.map((row, idx) => (
                <tr key={idx} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="py-3.5 pr-4 font-medium text-neutral-800">{row.nombre}</td>
                  <td className="py-3.5 px-4 text-center">
                    {row.basico ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
                    ) : (
                      <Minus className="w-5 h-5 text-neutral-300 mx-auto" />
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center bg-orange-50/30">
                    {row.pro ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
                    ) : (
                      <Minus className="w-5 h-5 text-neutral-300 mx-auto" />
                    )}
                  </td>
                  <td className="py-3.5 pl-4 text-center">
                    {row.enterprise ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
                    ) : (
                      <Minus className="w-5 h-5 text-neutral-300 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ─── Preguntas Frecuentes ───────────────────────────────── */}
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-8">
            Preguntas Frecuentes
          </h2>

          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-neutral-200">
              <h3 className="font-bold text-neutral-900">¿Cómo funciona la prueba gratuita de 14 días?</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Al registrarte, ingresas tus datos y tarjeta mediante la pasarela segura de Stripe.
                Tienes acceso inmediato y completo a todas las funciones de tu plan elegido. Durante
                los primeros 14 días no se cobra un solo peso.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-neutral-200">
              <h3 className="font-bold text-neutral-900">¿Puedo cambiar de plan o cancelar en cualquier momento?</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Sí. Desde el portal de facturación de Stripe en la configuración de tu restaurante
                puedes subir o bajar de plan, actualizar tu tarjeta o cancelar tu suscripción con un
                clic, sin penalizaciones.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-neutral-200">
              <h3 className="font-bold text-neutral-900">¿Qué pasa con mis datos si cancelo?</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Tus datos históricos (órdenes, auditoría, recetas, inventario) nunca se borran. Se
                mantienen respaldados de forma segura en caso de que decidas reactivar tu servicio en
                el futuro.
              </p>
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

