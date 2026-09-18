import React from "react";
import Link from "next/link";
import { UtensilsCrossed, ArrowRight } from "lucide-react";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm shadow-orange-500/30">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-neutral-900">
            Restaura<span className="text-orange-600">Core</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-600">
          <Link href="/#modulos" className="hover:text-neutral-900 transition-colors">
            Módulos
          </Link>
          <Link href="/#como-funciona" className="hover:text-neutral-900 transition-colors">
            Cómo Funciona
          </Link>
          <Link href="/precios" className="hover:text-neutral-900 transition-colors">
            Planes y Precios
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-3.5 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            Iniciar Sesión
          </Link>
          <Link
            href="/registro"
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
          >
            <span>Prueba Gratis 14 Días</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

