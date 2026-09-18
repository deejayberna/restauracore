import React from "react";
import Link from "next/link";
import { UtensilsCrossed, ShieldCheck } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-900 text-neutral-400 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white">
            <UtensilsCrossed className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold text-white">
            Restaura<span className="text-orange-500">Core</span>
          </span>
          <span className="text-xs text-neutral-500 ml-2">
            © {new Date().getFullYear()} RestauraCore SaaS. Todos los derechos reservados.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-neutral-400">
          <Link href="/precios" className="hover:text-white transition-colors">
            Planes y Precios
          </Link>
          <Link href="/registro" className="hover:text-white transition-colors">
            Registrar Restaurante
          </Link>
          <Link href="/login" className="hover:text-white transition-colors">
            Acceso Personal / Login
          </Link>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            Pagos seguros con Stripe
          </span>
        </div>
      </div>
    </footer>
  );
}

