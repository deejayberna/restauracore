"use client";

import React, { useState } from "react";
import {
  ChefHat,
  QrCode,
  Store,
  Boxes,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
  Flame,
  Smartphone,
  Eye,
} from "lucide-react";

type TabKey = "kds" | "pos" | "qr" | "inventario";

export function HeroProductShowcase() {
  const [activeTab, setActiveTab] = useState<TabKey>("kds");

  return (
    <div className="relative mx-auto mt-12 max-w-6xl w-full">
      {/* Ambient background glow */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-3/4 h-72 bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-orange-600/20 blur-3xl rounded-full pointer-events-none" />

      {/* Floating Badges (Desktop only for luxury feel) */}
      <div className="hidden lg:flex items-center gap-3 absolute -top-5 -left-4 z-20 bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md px-4 py-2.5 rounded-2xl text-xs text-white animate-bounce-slow">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div>
          <div className="font-semibold text-slate-200">Ventas en Vivo Hoy</div>
          <div className="text-emerald-400 font-bold text-sm">$38,420 MXN <span className="text-[10px] text-slate-400 font-normal">(+18.4%)</span></div>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-3 absolute -bottom-4 -right-4 z-20 bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md px-4 py-2.5 rounded-2xl text-xs text-white">
        <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div>
          <div className="font-semibold text-slate-200">Arqueo Ciego e IA Antifraude</div>
          <div className="text-orange-400 font-bold text-sm">0 Discrepancias de Caja</div>
        </div>
      </div>

      {/* Outer Executive Frame */}
      <div className="relative rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-950/95 shadow-2xl shadow-orange-950/30 overflow-hidden text-left backdrop-blur-xl">
        {/* Device Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-800/80 bg-slate-900/80">
          {/* OS Window Controls & Restaurant Name */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-slate-200">La Trattoria Nova</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium hidden sm:inline-block">
                Sucursal Centro
              </span>
            </div>
          </div>

          {/* Real-time Heartbeat Status */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Supabase Realtime Activo
            </span>
          </div>
        </div>

        {/* Interactive Tab Switcher */}
        <div className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 pt-3 pb-2 border-b border-slate-800/60 bg-slate-950/60 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("kds")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "kds"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>KDS Cocina en Vivo</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">3 activos</span>
          </button>

          <button
            onClick={() => setActiveTab("pos")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "pos"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Punto de Venta & Mesas</span>
          </button>

          <button
            onClick={() => setActiveTab("qr")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "qr"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Menú QR & Clientes</span>
          </button>

          <button
            onClick={() => setActiveTab("inventario")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "inventario"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Recetas & Almacén IA</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="p-4 sm:p-6 bg-slate-950 min-h-[380px]">
          {/* TAB 1: KDS Cocina */}
          {activeTab === "kds" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span>Comandas asignadas a línea de cocción caliente & barra</span>
                <span className="font-mono text-orange-400">Tiempo prom. despacho: 11m 30s</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Comanda 1: Urgente */}
                <div className="rounded-xl border border-rose-500/50 bg-slate-900/90 p-4 relative overflow-hidden shadow-lg shadow-rose-950/20">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500 animate-pulse" />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-base">#142</span>
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-xs font-bold">Mesa 4</span>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-xs text-rose-400 font-bold">
                      <Clock className="w-3.5 h-3.5" /> 16:42m
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-200 mb-4">
                    <div className="flex justify-between items-center py-1 border-b border-slate-800">
                      <span><strong className="text-white">2x</strong> Ribeye al Carbón 350g</span>
                      <span className="text-[10px] text-amber-400">Término Medio</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-800">
                      <span><strong className="text-white">1x</strong> Pappardelle con Hongos</span>
                      <span className="text-[10px] text-slate-400">Sin ajo</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span><strong className="text-white">2x</strong> Copa Tinto Reserva</span>
                      <span className="text-[10px] text-emerald-400">Barra lista</span>
                    </div>
                  </div>

                  <button className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Marcar Todo Listo</span>
                  </button>
                </div>

                {/* Comanda 2: En Proceso */}
                <div className="rounded-xl border border-amber-500/40 bg-slate-900/90 p-4 relative overflow-hidden shadow-lg shadow-amber-950/20">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-base">#143</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-xs font-bold">Mesa 9</span>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-xs text-amber-400 font-bold">
                      <Clock className="w-3.5 h-3.5" /> 07:15m
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-200 mb-4">
                    <div className="flex justify-between items-center py-1 border-b border-slate-800">
                      <span><strong className="text-white">1x</strong> Pizza Burrata & Prosciutto</span>
                      <span className="text-[10px] text-orange-400">Horno leña</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-800">
                      <span><strong className="text-white">1x</strong> Carpaccio de Salmón</span>
                      <span className="text-[10px] text-slate-400">Entrada</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span><strong className="text-white">2x</strong> Mocktail Frutos Rojos</span>
                      <span className="text-[10px] text-emerald-400">En barra</span>
                    </div>
                  </div>

                  <button className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5">
                    <span>En Preparación</span>
                  </button>
                </div>

                {/* Comanda 3: Pedido QR Nuevo */}
                <div className="rounded-xl border border-emerald-500/40 bg-slate-900/90 p-4 relative overflow-hidden shadow-lg shadow-emerald-950/20">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-base">#144</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1">
                        <QrCode className="w-3 h-3" /> Mesa 14
                      </span>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-xs text-emerald-400 font-bold">
                      <Clock className="w-3.5 h-3.5" /> 01:20m
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-200 mb-4">
                    <div className="flex justify-between items-center py-1 border-b border-slate-800">
                      <span><strong className="text-white">2x</strong> Hamburguesa Trufada Angus</span>
                      <span className="text-[10px] text-amber-400">Papas rústicas</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-800">
                      <span><strong className="text-white">1x</strong> Ensalada César Clásica</span>
                      <span className="text-[10px] text-slate-400">Con pollo</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span><strong className="text-white">2x</strong> Cerveza Artesanal IPA</span>
                      <span className="text-[10px] text-slate-400">Frías</span>
                    </div>
                  </div>

                  <button className="w-full py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5">
                    <span>Aceptar y Cocinar</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: POS & Mesas */}
          {activeTab === "pos" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Mesas Ocupadas</div>
                  <div className="text-xl font-bold text-white mt-1">12 <span className="text-xs text-slate-500 font-normal">/ 16 mesas</span></div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">75% Ocupación</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Ticket Promedio</div>
                  <div className="text-xl font-bold text-white mt-1">$685 <span className="text-xs text-slate-500 font-normal">MXN</span></div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">+12% vs ayer</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Total Facturado Hoy</div>
                  <div className="text-xl font-bold text-amber-400 mt-1">$38,420 <span className="text-xs text-slate-500 font-normal">MXN</span></div>
                  <div className="text-[10px] text-slate-400 mt-0.5">56 comandas cerradas</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Arqueo Ciego Turno</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">Cuadrado</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Caja Central #1</div>
                </div>
              </div>

              {/* Plano Rápido de Mesas */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
                  <span>Mapa de Piso & Comedores</span>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Libre</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Ocupada</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Pidiendo Cuenta</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/40 text-center">
                    <div className="font-bold text-sm text-white">Mesa 1</div>
                    <div className="text-[10px] text-orange-400 font-semibold">$1,240 MXN</div>
                    <div className="text-[9px] text-slate-400">4 pax • 42m</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                    <div className="font-bold text-sm text-white">Mesa 2</div>
                    <div className="text-[10px] text-emerald-400 font-semibold">Disponible</div>
                    <div className="text-[9px] text-slate-400">2 pax</div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-center">
                    <div className="font-bold text-sm text-white">Mesa 3</div>
                    <div className="text-[10px] text-amber-400 font-semibold">Pidiendo Cuenta</div>
                    <div className="text-[9px] text-slate-400">$890 MXN</div>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/40 text-center">
                    <div className="font-bold text-sm text-white">Mesa 4</div>
                    <div className="text-[10px] text-orange-400 font-semibold">$2,450 MXN</div>
                    <div className="text-[9px] text-slate-400">6 pax • 1h 10m</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                    <div className="font-bold text-sm text-white">Mesa 5</div>
                    <div className="text-[10px] text-emerald-400 font-semibold">Disponible</div>
                    <div className="text-[9px] text-slate-400">4 pax</div>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/40 text-center">
                    <div className="font-bold text-sm text-white">Mesa 6</div>
                    <div className="text-[10px] text-orange-400 font-semibold">$1,680 MXN</div>
                    <div className="text-[9px] text-slate-400">3 pax • 25m</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Menú QR Móvil */}
          {activeTab === "qr" && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center animate-fadeIn">
              <div className="md:col-span-7 space-y-4">
                <span className="px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-bold">
                  Zero App Download
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  Tus comensales piden y pagan en segundos desde el celular
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Genera códigos QR dinámicos por mesa con un clic. Cuando el cliente escanea con la cámara de su teléfono, visualiza fotos apetitosas, agrega modificadores y envía la orden directamente a cocina sin esperar al mesero.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="font-bold text-white mb-1">⚡ Rondas Inmediatas</div>
                    <p className="text-slate-400">Aumenta el ticket promedio un +22% facilitando pedir tragos y postres.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="font-bold text-white mb-1">💳 Pago con Stripe / QR</div>
                    <p className="text-slate-400">Soporta tarjeta de crédito, Apple Pay, Google Pay y división de cuenta.</p>
                  </div>
                </div>
              </div>

              {/* Mobile Phone Mockup */}
              <div className="md:col-span-5 flex justify-center">
                <div className="w-64 rounded-3xl border-4 border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-orange-950/40">
                  <div className="w-16 h-3 bg-slate-800 rounded-full mx-auto mb-3" />
                  <div className="rounded-2xl bg-slate-950 p-3 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                      <span className="font-bold text-white">Mesa #8 • Terraza</span>
                      <span className="text-emerald-400">🟢 Activa</span>
                    </div>

                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="w-10 h-10 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center font-bold text-xs">
                        🥩
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">Corte New York 300g</div>
                        <div className="text-[10px] text-orange-400 font-semibold">$380 MXN</div>
                      </div>
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-orange-600">+</span>
                    </div>

                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="w-10 h-10 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center font-bold text-xs">
                        🍷
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">Malbec Argentino</div>
                        <div className="text-[10px] text-orange-400 font-semibold">$140 MXN</div>
                      </div>
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-orange-600">+</span>
                    </div>

                    <button className="w-full mt-2 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs shadow-md shadow-orange-600/40">
                      Enviar Pedido a Cocina ($520)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Inventario & Recetas */}
          {activeTab === "inventario" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pb-1 gap-2">
                <span>Descuento automatizado de insumos por gramaje cada vez que sale una orden</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Costo de Alimentos Actual: 28.6% (Saludable)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white">Carne Angus Prime</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Óptimo</span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between"><span>Stock en Almacén:</span> <strong className="text-white">18.4 kg</strong></div>
                    <div className="flex justify-between"><span>Consumo Hoy:</span> <strong className="text-orange-400">4.2 kg (12 platos)</strong></div>
                    <div className="flex justify-between"><span>Costo por Porción:</span> <strong className="text-slate-200">$98.50 MXN</strong></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white">Queso Parmigiano Reggiano</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">Por Reabastecer</span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between"><span>Stock en Almacén:</span> <strong className="text-white">2.1 kg</strong></div>
                    <div className="flex justify-between"><span>Mínimo Sugerido:</span> <strong className="text-amber-400">3.0 kg</strong></div>
                    <div className="flex justify-between"><span>Orden de Compra:</span> <strong className="text-emerald-400">Generada auto.</strong></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white">Vino Tinto Ribera</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Óptimo</span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between"><span>Botellas en Cava:</span> <strong className="text-white">34 botellas</strong></div>
                    <div className="flex justify-between"><span>Copas Servidas:</span> <strong className="text-orange-400">18 copas</strong></div>
                    <div className="flex justify-between"><span>Margen de Ganancia:</span> <strong className="text-emerald-400">76.2%</strong></div>
                  </div>
                </div>
              </div>

              {/* Botón de Auditoría */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-orange-950/40 via-slate-900 to-slate-900 border border-orange-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
                  <span className="text-slate-300">
                    <strong className="text-white">Auditoría IA de Mermas:</strong> Todas las salidas del almacén coinciden exactamente con las comandas cobradas en caja.
                  </span>
                </div>
                <span className="text-orange-400 font-bold hover:underline cursor-pointer flex items-center gap-1">
                  Ver detalle de escandallo <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

