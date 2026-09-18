"use client";

import { useCarrito } from "./CarritoContext";

interface Props {
  platillo_id: string;
  nombre: string;
  precio: number;
}

export function BotonAgregar({ platillo_id, nombre, precio }: Props) {
  const { agregar, items, cambiarCantidad, quitar } = useCarrito();
  const item = items.find((i) => i.platillo_id === platillo_id);

  if (item) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button onClick={() => cambiarCantidad(platillo_id, item.cantidad - 1)}>−</button>
        <span>{item.cantidad}</span>
        <button onClick={() => cambiarCantidad(platillo_id, item.cantidad + 1)}>+</button>
      </div>
    );
  }

  return (
    <button onClick={() => agregar({ platillo_id, nombre, precio })}>
      Agregar
    </button>
  );
}
