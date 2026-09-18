"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />,
  };

  const borders = {
    success: "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-100",
    error: "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/80 text-rose-900 dark:text-rose-100",
    warning: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-100",
    info: "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/80 text-sky-900 dark:text-sky-100",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast floating container */}
      <div className="fixed bottom-18 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-2 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-lg text-xs font-medium transition-all duration-200 animate-in slide-in-from-bottom-2 ${borders[t.type]}`}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              {icons[t.type]}
              <span className="truncate">{t.message}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="p-1 hover:opacity-75 rounded transition-opacity"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: (msg: string) => console.log("[Toast fallback]", msg),
    };
  }
  return context;
}

