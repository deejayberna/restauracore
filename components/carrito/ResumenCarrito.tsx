"use client";

import { useCarrito } from "./CarritoContext";
import { useParams } from "next/navigation";

export function ResumenCarrito() {
  const { total, totalItems } = useCarrito();
  const params = useParams<{ qrToken: string }>();

  if (totalItems === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#000",
        color: "#fff",
        padding: "1rem 2rem",
        borderRadius: "2rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        zIndex: 100,
      }}
    >
      <span>{totalItems} {totalItems === 1 ? "item" : "items"}</span>
      <a
        href={`/menu/${params.qrToken}/carrito`}
        style={{ color: "#fff", fontWeight: "bold", textDecoration: "none" }}
      >
        Ver pedido — ${total.toFixed(2)}
      </a>
    </div>
  );
}
