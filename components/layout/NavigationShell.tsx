"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  UtensilsCrossed,
  DollarSign,
  ChefHat,
  Package,
  ShoppingCart,
  Users,
  ShieldAlert,
  BarChart3,
  LayoutDashboard,
  Coins,
  XCircle,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  Store,
} from "lucide-react";
import { BranchSwitcher, type BranchInfo } from "./BranchSwitcher";
import { NotificationBell, type NotificationCounts } from "./NotificationBell";
import { Badge } from "@/components/ui/Badge";
import { logoutAction } from "@/lib/auth-actions";

export interface NavUser {
  id: string;
  nombre: string;
  email: string;
  rol: "mesero" | "cajero" | "chef" | "gerente" | "dueno";
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  roles: Array<NavUser["rol"]>;
}

export function NavigationShell({
  user,
  currentBranchId,
  branches,
  notificationCounts,
  trialBanner,
  children,
}: {
  user: NavUser;
  currentBranchId: string;
  branches: BranchInfo[];
  notificationCounts: NotificationCounts;
  trialBanner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Definición completa de rutas por rol
  const allNavItems: NavItem[] = [
    {
      label: "Inicio",
      href: "/home",
      icon: <Home className="w-5 h-5" />,
      roles: ["mesero", "cajero", "chef", "gerente", "dueno"],
    },
    {
      label: "Mesas & Comandas",
      href: "/mesas",
      icon: <UtensilsCrossed className="w-5 h-5" />,
      roles: ["mesero", "gerente", "dueno"],
    },
    {
      label: "Cocina KDS",
      href: "/cocina",
      icon: <ChefHat className="w-5 h-5" />,
      roles: ["chef", "gerente", "dueno"],
    },
    {
      label: "Caja & Turnos",
      href: "/caja",
      icon: <DollarSign className="w-5 h-5" />,
      roles: ["cajero", "mesero", "gerente", "dueno"],
    },
    {
      label: "Propinas del Turno",
      href: "/caja/propinas",
      icon: <Coins className="w-5 h-5" />,
      roles: ["cajero", "gerente", "dueno"],
    },
    {
      label: "Aprobación Cancelaciones",
      href: "/cancelaciones",
      icon: <XCircle className="w-5 h-5" />,
      badge: notificationCounts.cancelacionesPendientes,
      roles: ["gerente", "dueno"],
    },
    {
      label: "Inventario & Mermas",
      href: "/inventario",
      icon: <Package className="w-5 h-5" />,
      roles: ["gerente", "dueno"],
    },
    {
      label: "Compras & Proveedores",
      href: "/compras",
      icon: <ShoppingCart className="w-5 h-5" />,
      roles: ["gerente", "dueno"],
    },
    {
      label: "Personal & Permisos",
      href: "/personal",
      icon: <Users className="w-5 h-5" />,
      roles: ["gerente", "dueno"],
    },
    {
      label: "Notificaciones",
      href: "/notificaciones",
      icon: <Bell className="w-5 h-5" />,
      badge: notificationCounts.totalAlertas,
      roles: ["gerente", "dueno"],
    },
    {
      label: "Dashboard Dueño",
      href: "/dashboard",
      icon: <LayoutDashboard className="w-5 h-5" />,
      roles: ["dueno"],
    },
    {
      label: "Reportes Financieros",
      href: "/reportes",
      icon: <BarChart3 className="w-5 h-5" />,
      roles: ["gerente", "dueno"],
    },
    {
      label: "Log de Auditoría",
      href: "/auditoria",
      icon: <ShieldAlert className="w-5 h-5" />,
      roles: ["dueno"],
    },
    {
      label: "Configuración & Suscripción",
      href: "/restaurante/configuracion",
      icon: <Store className="w-5 h-5" />,
      roles: ["dueno"],
    },
  ];

  // Filtrar según el rol del usuario
  const allowedItems = allNavItems.filter((item) => item.roles.includes(user.rol));

  // Ítems para la barra inferior fija en móvil (máximo 4 principales + botón "Más")
  const mobileBottomItems = allowedItems.slice(0, 4);

  const roleColors: Record<NavUser["rol"], "info" | "warning" | "success" | "neutral" | "danger"> = {
    dueno: "warning",
    gerente: "info",
    chef: "danger",
    cajero: "success",
    mesero: "neutral",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row text-slate-900 dark:text-slate-100">
      {/* ─── BARRA SUPERIOR MÓVIL (< 768px) ────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="touch-target p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Link href="/home" className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center text-white font-black text-sm">
              R
            </span>
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
              Restauracore
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell counts={notificationCounts} />
          <Link
            href="/perfil"
            className="touch-target w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200"
            aria-label="Mi perfil"
          >
            {user.nombre.charAt(0).toUpperCase()}
          </Link>
        </div>
      </header>

      {/* ─── SIDEBAR ESCRITORIO (>= 768px) ─────────────────────────────────── */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen sticky top-0 z-20">
        {/* Logo & Brand */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-white font-black text-base shadow-sm">
              R
            </span>
            <div>
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white block leading-none">
                Restauracore
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Gestión Inteligente</span>
            </div>
          </Link>
          <NotificationBell counts={notificationCounts} />
        </div>

        {/* Branch Switcher */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/80">
          <BranchSwitcher currentBranchId={currentBranchId} branches={branches} />
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {allowedItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 font-bold shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? "text-sky-600 dark:text-sky-400" : "text-slate-400"}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Card Footer */}
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between">
            <Link
              href="/perfil"
              className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/80 text-sky-700 dark:text-sky-300 font-bold flex items-center justify-center text-xs shrink-0">
                {user.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 truncate">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">
                  {user.nombre}
                </p>
                <Badge variant={roleColors[user.rol]} size="sm" className="mt-0.5 uppercase tracking-wider text-[9px]">
                  {user.rol}
                </Badge>
              </div>
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                className="touch-target p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ─── CONTENIDO PRINCIPAL ───────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto pb-24 md:pb-8">
        {trialBanner}
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      {/* ─── BARRA DE NAVEGACIÓN INFERIOR MÓVIL (< 768px) ─────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-around py-1.5 px-2 safe-area-bottom">
        {mobileBottomItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`touch-target flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isActive
                  ? "text-sky-600 dark:text-sky-400"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <div className="relative">
                {item.icon}
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[8px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="truncate max-w-[64px]">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}

        {/* Botón "Más" para abrir Drawer móvil */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="touch-target flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400"
          aria-label="Más opciones"
        >
          <Menu className="w-5 h-5" />
          <span>Más</span>
        </button>
      </nav>

      {/* ─── DRAWER / MENÚ LATERAL MÓVIL (< 768px) ─────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-4/5 max-w-xs bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {/* Header del drawer */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center text-white font-black text-sm">
                  R
                </span>
                <span className="font-bold text-sm">Restauracore</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="touch-target p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Branch switcher en drawer */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
              <BranchSwitcher currentBranchId={currentBranchId} branches={branches} />
            </div>

            {/* Enlaces de navegación */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {allowedItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-3 rounded-xl text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={isActive ? "text-sky-600 dark:text-sky-400" : "text-slate-400"}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {typeof item.badge === "number" && item.badge > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}

              <Link
                href="/perfil"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <User className="w-5 h-5 text-slate-400" />
                <span>Mi Perfil</span>
              </Link>
            </nav>

            {/* Logout footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 font-semibold text-xs hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar Sesión</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

