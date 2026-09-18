"use client";

import { useActionState, useEffect } from "react";
import { useCarrito } from "@/components/carrito/CarritoContext";
import { confirmarPedido } from "@/lib/pedido-actions";
import { useParams, useRouter } from "next/navigation";

export default function CarritoPage() {
  const { items, total, totalItems, vaciar, cambiarCantidad, actualizarNotas, hidratado } =
    useCarrito();
  const params = useParams<{ qrToken: string }>();
  const router = useRouter();

  const [state, formAction, pending] = useActionState(confirmarPedido, null);

  useEffect(() => {
    if (state?.ok) {
      vaciar();
      router.push(`/menu/${params.qrToken}/confirmacion?orden=${state.orden_id}`);
    }
  }, [state, vaciar, router, params.qrToken]);

  if (!hidratado) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem", textAlign: "center" }}>
        <p>Cargando pedido...</p>
      </main>
    );
  }

  if (totalItems === 0) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem", textAlign: "center" }}>
        <h1>Tu pedido</h1>
        <p>No tienes items en tu pedido.</p>
        <a href={`/menu/${params.qrToken}`}>← Volver al menú</a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "1rem 1rem 6rem" }}>
      <a href={`/menu/${params.qrToken}`} style={{ display: "block", marginBottom: "1rem" }}>
        ← Volver al menú
      </a>
      <h1>Tu pedido</h1>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.platillo_id}
            style={{ borderBottom: "1px solid #eee", padding: "0.75rem 0" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{item.nombre}</strong>
              <span>${(item.precio * item.cantidad).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button onClick={() => cambiarCantidad(item.platillo_id, item.cantidad - 1)}>−</button>
              <span>{item.cantidad}</span>
              <button onClick={() => cambiarCantidad(item.platillo_id, item.cantidad + 1)}>+</button>
              <span style={{ opacity: 0.5, fontSize: "0.85rem" }}>
                ${item.precio.toFixed(2)} c/u
              </span>
            </div>
            <input
              type="text"
              placeholder="Notas (sin cebolla, extra salsa...)"
              value={item.notas ?? ""}
              onChange={(e) => actualizarNotas(item.platillo_id, e.target.value)}
              maxLength={200}
              style={{ width: "100%", marginTop: "0.5rem", padding: "0.4rem", fontSize: "0.9rem" }}
            />
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "1.5rem", fontSize: "1.2rem", fontWeight: "bold" }}>
        Total: ${total.toFixed(2)}
      </div>

      {state?.ok === false && (
        <p style={{ color: "red", marginTop: "1rem" }}>{state.error}</p>
      )}

      <form action={formAction} style={{ marginTop: "1.5rem" }}>
        <input type="hidden" name="qr_token" value={params.qrToken} />
        <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({
          platillo_id: i.platillo_id,
          cantidad: i.cantidad,
          notas: i.notas,
        })))} />
        <button
          type="submit"
          disabled={pending}
          style={{ width: "100%", padding: "1rem", fontSize: "1rem", cursor: "pointer" }}
        >
          {pending ? "Enviando pedido..." : "Confirmar pedido"}
        </button>
      </form>
    </main>
  );
}
