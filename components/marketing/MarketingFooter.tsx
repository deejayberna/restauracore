import React from "react";
import Link from "next/link";
import { ShieldCheck, Heart } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-400 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left">
          <BrandLogo size="sm" theme="dark" href="/" />
          <span className="text-xs text-slate-500">
            © {new Date().getFullYear()} RestauraCore SaaS. Todos los derechos reservados.
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-slate-400">
          <Link href="/precios" className="hover:text-white transition-colors">
            Planes y Precios
          </Link>
          <Link href="/registro" className="hover:text-white transition-colors">
            Registrar Restaurante
          </Link>
          <Link href="/login" className="hover:text-white transition-colors">
            Acceso Personal
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Pagos seguros con Stripe
          </span>
        </div>
      </div>
    </footer>
  );
}
