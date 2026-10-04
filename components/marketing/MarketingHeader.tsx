"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 dark:border-neutral-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md transition-colors">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLogo size="md" href="/" theme="auto" />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            <Link
              href="/#modulos"
              className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              Módulos
            </Link>
            <Link
              href="/#como-funciona"
              className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              Cómo Funciona
            </Link>
            <Link
              href="/precios"
              className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              Planes y Precios
            </Link>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex px-3.5 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Iniciar Sesión
            </Link>

            <Link
              href="/registro"
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-md shadow-orange-600/25 hover:bg-orange-700 transition-colors"
            >
              <span className="hidden xs:inline">Prueba Gratis 14 Días</span>
              <span className="xs:hidden">Prueba 14d</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            {/* Mobile / Tablet Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden touch-target p-2 rounded-xl text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú de navegación"}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 pt-3 pb-6 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col space-y-2">
              <Link
                href="/#modulos"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Módulos Operativos
              </Link>
              <Link
                href="/#como-funciona"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cómo Funciona
              </Link>
              <Link
                href="/precios"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Planes y Precios
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors"
              >
                Iniciar Sesión
              </Link>
            </nav>
            <div className="pt-2">
              <Link
                href="/registro"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition-colors"
              >
                <span>Comenzar Prueba Gratis (14 Días)</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
