"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UtensilsCrossed,
  CheckCircle2,
  ArrowRight,
  Store,
  BookOpen,
  QrCode,
  Users,
  Loader2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  obtenerDatosWizardAction,
  guardarPaso1Action,
  guardarPaso2MenuAction,
  guardarPaso3MesaAction,
  guardarPaso4InvitarAction,
  type Rol,
} from "@/lib/wizard-actions";

export default function BienvenidaWizardPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paso 1: Datos Básicos
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [emailAlertas, setEmailAlertas] = useState("");

  // Paso 2: Menú Inicial
  const [categoriaNombre, setCategoriaNombre] = useState("Bebidas");
  const [platilloNombre, setPlatilloNombre] = useState("Limonada Natural");
  const [precioPlatillo, setPrecioPlatillo] = useState("45.00");

  // Paso 3: Mesa 1
  const [mesaGenerada, setMesaGenerada] = useState<{
    id: string;
    numero: number;
    qrToken: string;
  } | null>(null);

  // Paso 4: Colaborador
  const [invitarNombre, setInvitarNombre] = useState("");
  const [invitarEmail, setInvitarEmail] = useState("");
  const [invitarRol, setInvitarRol] = useState<Rol>("mesero");

  useEffect(() => {
    async function cargar() {
      try {
        const datos = await obtenerDatosWizardAction();
        setNombre(datos.restaurante.nombre);
        setDireccion(datos.restaurante.direccion);
        setTimezone(datos.restaurante.timezone || "America/Mexico_City");
        setEmailAlertas(datos.restaurante.emailAlertas || "");
        if (datos.mesaInicial) {
          setMesaGenerada(datos.mesaInicial);
        }
      } catch (err: any) {
        console.error("Error cargando datos del restaurante:", err);
        setError("No se pudo cargar la información inicial. Asegúrate de tener una sucursal activa.");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  const handlePaso1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarPaso1Action(nombre, direccion, timezone, emailAlertas);
      setPaso(2);
    } catch (err: any) {
      setError(err.message || "Error al actualizar los datos.");
    } finally {
      setGuardando(false);
    }
  };

  const handlePaso2 = async (omitir = false) => {
    setGuardando(true);
    setError(null);
    try {
      if (!omitir && categoriaNombre.trim() && platilloNombre.trim() && parseFloat(precioPlatillo)) {
        await guardarPaso2MenuAction(
          categoriaNombre,
          platilloNombre,
          parseFloat(precioPlatillo)
        );
      }
      // Avanzar al paso 3 y generar la mesa
      const mesaRes = await guardarPaso3MesaAction();
      if (mesaRes.mesa) {
        setMesaGenerada(mesaRes.mesa);
      }
      setPaso(3);
    } catch (err: any) {
      setError(err.message || "Error al guardar el menú inicial.");
    } finally {
      setGuardando(false);
    }
  };

  const handlePaso3 = () => {
    setPaso(4);
  };

  const handlePaso4 = async (omitir = false) => {
    setGuardando(true);
    setError(null);
    try {
      if (!omitir && invitarEmail.trim() && invitarNombre.trim()) {
        await guardarPaso4InvitarAction(invitarEmail, invitarNombre, invitarRol);
      }
      // Finalizado -> Al dashboard
      router.push("/home");
    } catch (err: any) {
      setError(err.message || "Error al invitar colaborador.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
        <p className="text-neutral-400">Preparando tu asistente de bienvenida...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">RestauraCore</span>
        </div>
        <button
          onClick={() => router.push("/home")}
          className="text-xs text-neutral-400 hover:text-neutral-200 transition"
        >
          Saltar configuración e ir al panel &rarr;
        </button>
      </header>

      {/* Main Wizard */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex flex-col justify-center">
        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 text-xs text-neutral-400 font-medium">
            <span className={paso >= 1 ? "text-orange-400 font-bold" : ""}>1. Datos Básicos</span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            <span className={paso >= 2 ? "text-orange-400 font-bold" : ""}>2. Menú Inicial</span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            <span className={paso >= 3 ? "text-orange-400 font-bold" : ""}>3. Mesa y QR</span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            <span className={paso >= 4 ? "text-orange-400 font-bold" : ""}>4. Colaboradores</span>
          </div>
          <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-orange-500 h-full transition-all duration-300 ease-out rounded-full"
              style={{ width: `${(paso / 4) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* PASO 1 */}
        {paso === 1 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2 text-orange-400">
              <Store className="w-6 h-6" />
              <h2 className="text-xl font-bold text-white">Confirma los datos de tu sucursal</h2>
            </div>
            <p className="text-sm text-neutral-400 mb-6">
              Asegúrate de que el nombre comercial y la zona horaria sean correctos para las comandas y reportes.
            </p>

            <form onSubmit={handlePaso1} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Nombre del Restaurante / Sucursal *
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                  placeholder="Ej: La Trattoria Roma"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Dirección o Ubicación (Opcional)
                </label>
                <input
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                  placeholder="Ej: Av. Álvaro Obregón 120, Roma Norte, CDMX"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Zona Horaria
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                >
                  <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
                  <option value="America/Monterrey">Monterrey (GMT-6)</option>
                  <option value="America/Tijuana">Tijuana (GMT-8)</option>
                  <option value="America/Bogota">Bogotá / Lima (GMT-5)</option>
                  <option value="America/Santiago">Santiago (GMT-4)</option>
                  <option value="America/Buenos_Aires">Buenos Aires (GMT-3)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Email para Alertas Operativas Críticas (Caja, Robo, Cancelaciones)
                </label>
                <input
                  type="email"
                  value={emailAlertas}
                  onChange={(e) => setEmailAlertas(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                  placeholder="alertas@tudominio.com"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Por defecto usamos tu correo de registro. Puedes cambiarlo si prefieres recibir las alertas del negocio en otro buzón.
                </p>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={guardando || !nombre.trim()}
                  className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold px-6 py-2.5 rounded-xl transition shadow-lg shadow-orange-600/20 text-sm disabled:opacity-50"
                >
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continuar"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* PASO 2 */}
        {paso === 2 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2 text-orange-400">
              <BookOpen className="w-6 h-6" />
              <h2 className="text-xl font-bold text-white">Crea tu primer platillo o bebida</h2>
            </div>
            <p className="text-sm text-neutral-400 mb-6">
              Para probar el menú digital y el pedido QR, registra tu primer producto ahora, o impórtalos más tarde.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Categoría
                </label>
                <input
                  type="text"
                  value={categoriaNombre}
                  onChange={(e) => setCategoriaNombre(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                  placeholder="Ej: Entradas, Bebidas, Tacos..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Nombre del Platillo / Producto
                  </label>
                  <input
                    type="text"
                    value={platilloNombre}
                    onChange={(e) => setPlatilloNombre(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                    placeholder="Ej: Tacos de Ribeye (3 pzas)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Precio ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="0.50"
                    value={precioPlatillo}
                    onChange={(e) => setPrecioPlatillo(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                    placeholder="120.00"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handlePaso2(true)}
                  disabled={guardando}
                  className="text-neutral-400 hover:text-neutral-200 text-xs font-medium transition"
                >
                  Omitir por ahora
                </button>
                <button
                  type="button"
                  onClick={() => handlePaso2(false)}
                  disabled={guardando}
                  className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold px-6 py-2.5 rounded-xl transition shadow-lg shadow-orange-600/20 text-sm disabled:opacity-50"
                >
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar y Continuar"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PASO 3 */}
        {paso === 3 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2 text-orange-400">
              <QrCode className="w-6 h-6" />
              <h2 className="text-xl font-bold text-white">Mesa 1 generada automáticamente</h2>
            </div>
            <p className="text-sm text-neutral-400 mb-6">
              Tu restaurante ya cuenta con la Mesa #1 activa para recibir pedidos desde el código QR.
            </p>

            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-6 mb-6">
              <div className="w-28 h-28 bg-white p-2 rounded-xl flex items-center justify-center shadow-inner">
                {/* Visual Placeholder QR */}
                <div className="w-full h-full border-4 border-neutral-900 flex flex-col items-center justify-center text-neutral-900">
                  <QrCode className="w-12 h-12" />
                  <span className="text-[9px] font-black uppercase tracking-tighter mt-1">MESA 1</span>
                </div>
              </div>

              <div className="flex-1 text-center sm:text-left space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/60 text-emerald-400 text-xs font-medium mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Lista para recibir comandas
                </div>
                <h3 className="font-bold text-base text-white">Mesa #1 - Salón Principal</h3>
                <p className="text-xs text-neutral-400">
                  Token QR único: <code className="text-orange-300 font-mono">{mesaGenerada?.qrToken || "mesa_1_default"}</code>
                </p>
                <p className="text-xs text-neutral-500 pt-1">
                  Podrás descargar e imprimir todos los códigos QR desde la sección de Mesas en tu panel.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handlePaso3}
                className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold px-6 py-2.5 rounded-xl transition shadow-lg shadow-orange-600/20 text-sm"
              >
                Siguiente: Invitar Personal
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PASO 4 */}
        {paso === 4 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2 text-orange-400">
              <Users className="w-6 h-6" />
              <h2 className="text-xl font-bold text-white">Invita a tu primer colaborador</h2>
            </div>
            <p className="text-sm text-neutral-400 mb-6">
              Puedes registrar un mesero, cocinero o administrador ahora mismo, o hacerlo en cualquier momento desde Personal.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={invitarNombre}
                  onChange={(e) => setInvitarNombre(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                  placeholder="Ej: Carlos Gómez"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={invitarEmail}
                    onChange={(e) => setInvitarEmail(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                    placeholder="carlos@mitrabajo.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Rol en la Sucursal
                  </label>
                  <select
                    value={invitarRol}
                    onChange={(e) => setInvitarRol(e.target.value as Rol)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 transition text-sm"
                  >
                    <option value="mesero">Mesero / Atiende Mesas</option>
                    <option value="cocinero">Cocinero / KDS</option>
                    <option value="cajero">Cajero / Cobro</option>
                    <option value="admin">Administrador de Sucursal</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handlePaso4(true)}
                  disabled={guardando}
                  className="text-neutral-400 hover:text-neutral-200 text-xs font-medium transition"
                >
                  Omitir e ir al Panel
                </button>
                <button
                  type="button"
                  onClick={() => handlePaso4(false)}
                  disabled={guardando}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/20 text-sm disabled:opacity-50"
                >
                  {guardando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Finalizar y Comenzar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Simple Footer */}
      <footer className="text-center py-4 text-xs text-neutral-500 border-t border-neutral-900">
        RestauraCore &copy; {new Date().getFullYear()} &mdash; Todos los derechos reservados
      </footer>
    </div>
  );
}

