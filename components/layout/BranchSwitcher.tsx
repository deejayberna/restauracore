"use client";

import React, { useState } from "react";
import { Store, ChevronDown, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export interface BranchInfo {
  restaurante_id: string;
  nombre: string;
  rol: string;
}

export function BranchSwitcher({
  currentBranchId,
  branches,
}: {
  currentBranchId: string;
  branches: BranchInfo[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const router = useRouter();

  const currentBranch = branches.find((b) => b.restaurante_id === currentBranchId) || branches[0];

  async function handleSelect(branchId: string) {
    if (branchId === currentBranchId) {
      setIsOpen(false);
      return;
    }

    setIsChanging(true);
    try {
      const formData = new FormData();
      formData.append("restaurante_id", branchId);
      // Invocar cambio de cookie directamente o fetch a server action
      const res = await fetch("/api/auth/cambiar-restaurante", {
        method: "POST",
        body: JSON.stringify({ restaurante_id: branchId }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setIsOpen(false);
        router.refresh();
        window.location.reload();
      }
    } catch {
      // Fallback
    } finally {
      setIsChanging(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isChanging || branches.length <= 1}
        className="touch-target flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 transition-colors text-xs font-semibold text-slate-900 dark:text-slate-100 w-full"
        aria-label="Cambiar de sucursal"
      >
        <div className="flex items-center gap-2 truncate">
          <Store className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="truncate">{currentBranch?.nombre ?? "Restaurante"}</span>
        </div>
        {branches.length > 1 && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {isOpen && branches.length > 1 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 animate-in fade-in zoom-in-95">
            <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 px-2 py-1 tracking-wider">
              Sucursales disponibles
            </div>
            {branches.map((b) => {
              const isSelected = b.restaurante_id === currentBranchId;
              return (
                <button
                  key={b.restaurante_id}
                  type="button"
                  onClick={() => handleSelect(b.restaurante_id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                    isSelected
                      ? "bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 font-semibold"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="truncate pr-2">
                    <p className="truncate">{b.nombre}</p>
                    <span className="text-[10px] text-slate-400 uppercase">{b.rol}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

