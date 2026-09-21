import React from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { UtensilsCrossed } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500 selection:text-white relative">
      {/* Fondo con gradiente y destellos */}
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(249,115,22,0.15),rgba(255,255,255,0))]" />

      {/* Header simple */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="h-4 w-4" />
            </div>
            <span className="text-base font-black text-white">
              Restaura<span className="text-orange-500">Core</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/"
              className="text-slate-400 hover:text-white transition-colors hidden sm:inline"
            >
              Inicio
            </Link>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <Link
              href="/precios"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Planes & Precios
            </Link>
            <Link
              href="/registro"
              className="px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-semibold border border-orange-500/30 transition-colors"
            >
              Probar Gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Contenido Central */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-6">
        <LoginForm initialError={params.error} />
      </main>

      {/* Footer simple */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/60 py-4 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} RestauraCore. Todos los derechos reservados.</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Soporte 24/7</span>
            <span>•</span>
            <span>Infraestructura Cloud</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
