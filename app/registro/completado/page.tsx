"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle, UtensilsCrossed, ArrowRight } from "lucide-react";
import { consultarEstadoActivacionAction } from "@/lib/registro-actions";

export default function RegistroCompletadoPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = use(searchParams);
  const sessionId = params.session_id;
  const router = useRouter();

  const [estado, setEstado] = useState<"activando" | "exito" | "error">("activando");
  const [mensaje, setMensaje] = useState("Confirmando tu suscripción y activando tu sucursal...");
  const [restauranteNombre, setRestauranteNombre] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setEstado("error");
      setMensaje("No se encontró el identificador de sesión de Stripe (session_id).");
      return;
    }

    let intentos = 0;
    let cancelado = false;

    const verificar = async () => {
      intentos++;
      try {
        const res = await consultarEstadoActivacionAction(sessionId);

        if (cancelado) return;

        if (res.status === "completado") {
          setEstado("exito");
          const nombre = "nombreRestaurante" in res ? res.nombreRestaurante : null;
          setRestauranteNombre(nombre || "tu restaurante");
          setMensaje("¡Suscripción y restaurante activados con éxito!");

          // Redirigir al wizard de bienvenida después de 1.5s
          setTimeout(() => {
            router.push("/bienvenida");
          }, 1500);
          return;
        }

        if (res.status === "error") {
          setEstado("error");
          setMensaje(res.mensaje || "Ocurrió un problema durante la activación.");
          return;
        }

        // Si sigue pendiente y no hemos superado 10 intentos (15 segundos)
        if (intentos < 10) {
          setTimeout(verificar, 1500);
        } else {
          setEstado("error");
          setMensaje(
            "El proceso está tomando más tiempo de lo esperado. Tu pago fue recibido; por favor inicia sesión o recarga esta página."
          );
        }
      } catch (err: any) {
        if (!cancelado) {
          setEstado("error");
          setMensaje(err.message || "Error al verificar la activación.");
        }
      }
    };

    verificar();

    return () => {
      cancelado = true;
    };
  }, [sessionId, router]);

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-neutral-200 shadow-lg text-center space-y-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 mx-auto">
          <UtensilsCrossed className="h-7 w-7" />
        </div>

        {estado === "activando" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <Loader2 className="w-10 h-10 text-orange-600 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-neutral-900">Activando tu Restaurante</h1>
            <p className="text-sm text-neutral-600 leading-relaxed">{mensaje}</p>
            <div className="p-3 bg-neutral-50 rounded-xl text-xs text-neutral-400">
              Configurando prueba gratuita de 14 días y permisos de administrador...
            </div>
          </div>
        )}

        {estado === "exito" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 animate-bounce" />
            </div>
            <h1 className="text-xl font-bold text-neutral-900">¡Todo Listo!</h1>
            <p className="text-sm text-neutral-600">
              {restauranteNombre} ha sido registrado correctamente con 14 días de prueba gratuita.
            </p>
            <div className="pt-2">
              <button
                onClick={() => router.push("/bienvenida")}
                className="w-full py-3 rounded-xl bg-orange-600 text-white font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors cursor-pointer"
              >
                <span>Entrar al Asistente de Configuración</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {estado === "error" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <AlertCircle className="w-12 h-12 text-rose-600" />
            </div>
            <h1 className="text-xl font-bold text-neutral-900">Hubo un Inconveniente</h1>
            <p className="text-sm text-rose-700 bg-rose-50 p-3 rounded-xl text-left font-mono text-xs">
              {mensaje}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 rounded-xl bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Reintentar Verificación
              </button>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 text-neutral-600 font-medium text-sm hover:text-neutral-900 transition-colors"
              >
                Ir a Iniciar Sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

