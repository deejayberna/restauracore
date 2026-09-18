"use client";

import { createContext, useContext, useCallback, useEffect, useReducer, useState, ReactNode } from "react";

export interface ItemCarrito {
  platillo_id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  notas?: string;
}

interface EstadoCarrito {
  items: ItemCarrito[];
  mesa_id: string;
  restaurante_id: string;
}

type AccionCarrito =
  | { type: "AGREGAR"; item: Omit<ItemCarrito, "cantidad"> }
  | { type: "QUITAR"; platillo_id: string }
  | { type: "CAMBIAR_CANTIDAD"; platillo_id: string; cantidad: number }
  | { type: "ACTUALIZAR_NOTAS"; platillo_id: string; notas: string }
  | { type: "VACIAR" }
  | { type: "CARGAR"; estado: EstadoCarrito };

function reducer(estado: EstadoCarrito, accion: AccionCarrito): EstadoCarrito {
  switch (accion.type) {
    case "AGREGAR": {
      const existe = estado.items.find((i) => i.platillo_id === accion.item.platillo_id);
      if (existe) {
        return {
          ...estado,
          items: estado.items.map((i) =>
            i.platillo_id === accion.item.platillo_id
              ? { ...i, cantidad: i.cantidad + 1 }
              : i
          ),
        };
      }
      return { ...estado, items: [...estado.items, { ...accion.item, cantidad: 1 }] };
    }
    case "QUITAR":
      return { ...estado, items: estado.items.filter((i) => i.platillo_id !== accion.platillo_id) };
    case "CAMBIAR_CANTIDAD":
      if (accion.cantidad <= 0) {
        return { ...estado, items: estado.items.filter((i) => i.platillo_id !== accion.platillo_id) };
      }
      return {
        ...estado,
        items: estado.items.map((i) =>
          i.platillo_id === accion.platillo_id ? { ...i, cantidad: accion.cantidad } : i
        ),
      };
    case "ACTUALIZAR_NOTAS":
      return {
        ...estado,
        items: estado.items.map((i) =>
          i.platillo_id === accion.platillo_id ? { ...i, notas: accion.notas } : i
        ),
      };
    case "VACIAR":
      return { ...estado, items: [] };
    case "CARGAR":
      return accion.estado;
    default:
      return estado;
  }
}

interface CarritoContextValue {
  items: ItemCarrito[];
  mesa_id: string;
  restaurante_id: string;
  hidratado: boolean;
  agregar: (item: Omit<ItemCarrito, "cantidad">) => void;
  quitar: (platillo_id: string) => void;
  cambiarCantidad: (platillo_id: string, cantidad: number) => void;
  actualizarNotas: (platillo_id: string, notas: string) => void;
  vaciar: () => void;
  total: number;
  totalItems: number;
}

const CarritoContext = createContext<CarritoContextValue | null>(null);

const STORAGE_KEY = "restauracore_carrito";

export function CarritoProvider({
  children,
  mesa_id,
  restaurante_id,
}: {
  children: ReactNode;
  mesa_id: string;
  restaurante_id: string;
}) {
  const [estado, dispatch] = useReducer(reducer, { items: [], mesa_id, restaurante_id });
  const [hidratado, setHidratado] = useState(false);

  // Cargar desde sessionStorage al montar con chequeo de timeout (10 minutos)
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(STORAGE_KEY);
      if (guardado) {
        const parsed: EstadoCarrito & { ultima_actividad?: number } = JSON.parse(guardado);
        const diezMinutosMs = 10 * 60 * 1000;
        const expirado = parsed.ultima_actividad && Date.now() - parsed.ultima_actividad > diezMinutosMs;

        if (expirado) {
          sessionStorage.removeItem(STORAGE_KEY);
        } else if (parsed.mesa_id === mesa_id && parsed.restaurante_id === restaurante_id) {
          dispatch({ type: "CARGAR", estado: parsed });
        }
      }
    } catch {
      // sessionStorage no disponible o datos corruptos — ignorar
    } finally {
      setHidratado(true);
    }
  }, [mesa_id, restaurante_id]);

  // Persistir en sessionStorage solo después de hidratado con timestamp de última actividad
  useEffect(() => {
    if (!hidratado) return;
    try {
      if (estado.items.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...estado, ultima_actividad: Date.now() })
        );
      }
    } catch {
      // sessionStorage lleno o no disponible — ignorar
    }
  }, [estado, hidratado]);

  // Temporizador de inactividad de 10 minutos
  useEffect(() => {
    if (!hidratado || estado.items.length === 0) return;

    const diezMinutosMs = 10 * 60 * 1000;
    const interval = setInterval(() => {
      try {
        const guardado = sessionStorage.getItem(STORAGE_KEY);
        if (guardado) {
          const parsed = JSON.parse(guardado);
          if (parsed.ultima_actividad && Date.now() - parsed.ultima_actividad > diezMinutosMs) {
            sessionStorage.removeItem(STORAGE_KEY);
            dispatch({ type: "VACIAR" });
          }
        }
      } catch {
        // Ignorar errores de parsing
      }
    }, 30000); // Chequeo cada 30 segundos

    return () => clearInterval(interval);
  }, [hidratado, estado.items.length]);

  const total = estado.items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const totalItems = estado.items.reduce((sum, i) => sum + i.cantidad, 0);

  const vaciar = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignorar
    }
    dispatch({ type: "VACIAR" });
  }, []);

  return (
    <CarritoContext.Provider
      value={{
        items: estado.items,
        mesa_id: estado.mesa_id,
        restaurante_id: estado.restaurante_id,
        hidratado,
        agregar: (item) => dispatch({ type: "AGREGAR", item }),
        quitar: (platillo_id) => dispatch({ type: "QUITAR", platillo_id }),
        cambiarCantidad: (platillo_id, cantidad) =>
          dispatch({ type: "CAMBIAR_CANTIDAD", platillo_id, cantidad }),
        actualizarNotas: (platillo_id, notas) =>
          dispatch({ type: "ACTUALIZAR_NOTAS", platillo_id, notas }),
        vaciar,
        total,
        totalItems,
      }}
    >
      {children}
    </CarritoContext.Provider>
  );
}

export function useCarrito() {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error("useCarrito debe usarse dentro de CarritoProvider");
  return ctx;
}
