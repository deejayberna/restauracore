"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recibirCompraAction } from "@/lib/compras-actions";
import Link from "next/link";

interface ItemRecibir {
  id: string; // compra_item_id
  ingrediente_id: string;
  ingrediente_nombre: string;
  unidad_medida: string;
  cantidad_pedida: number;
  costo_unitario_pactado: number;
}

interface Props {
  compraId: string;
  proveedorNombre: string;
  items: ItemRecibir[];
}

export function RecibirCompraForm({
  compraId,
  proveedorNombre,
  items,
}: Props) {
  const router = useRouter();
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<
    Record<string, number>
  >(() => {
    const initial: Record<string, number> = {};
    for (const item of items) {
      initial[item.id] = item.cantidad_pedida;
    }
    return initial;
  });

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    estado: "recibida" | "incidencia";
    porcentaje_faltante: number;
  } | null>(null);

  const handleUpdate = (itemId: string, val: number) => {
    setCantidadesRecibidas((prev) => ({
      ...prev,
      [itemId]: val >= 0 ? val : 0,
    }));
  };

  // Detectar faltantes dinámicamente
  const faltantes = items.filter(
    (item) => (cantidadesRecibidas[item.id] ?? 0) < item.cantidad_pedida
  );

  const totalRecibidoMonto = items.reduce((sum, item) => {
    const rec = cantidadesRecibidas[item.id] ?? 0;
    return sum + rec * item.costo_unitario_pactado;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);

    try {
      const payload = {
        compra_id: compraId,
        items: items.map((item) => ({
          compra_item_id: item.id,
          ingrediente_id: item.ingrediente_id,
          cantidad_recibida: cantidadesRecibidas[item.id] ?? 0,
        })),
      };

      const res = await recibirCompraAction(payload);

      if (!res.ok) {
        setError(res.error ?? "No se pudo procesar la recepción de la compra.");
      } else {
        setResultado({
          estado: res.estado!,
          porcentaje_faltante: res.porcentaje_faltante ?? 0,
        });
        setTimeout(() => {
          router.push("/compras");
          router.refresh();
        }, 2500);
      }
    } catch (err: any) {
      setError(err?.message ?? "Error inesperado al recibir la compra.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #ef4444",
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            color: "#991b1b",
            marginBottom: "1.5rem",
          }}
        >
          <strong style={{ display: "block", marginBottom: "0.25rem" }}>
            ⛔ Operación Rechazada
          </strong>
          {error}
        </div>
      )}

      {resultado && (
        <div
          style={{
            background: resultado.estado === "incidencia" ? "#fffbeb" : "#f0fdf4",
            border:
              resultado.estado === "incidencia"
                ? "1px solid #f59e0b"
                : "1px solid #22c55e",
            padding: "1.5rem",
            borderRadius: "8px",
            color: resultado.estado === "incidencia" ? "#92400e" : "#166534",
            marginBottom: "1.5rem",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem" }}>
            {resultado.estado === "incidencia"
              ? "⚠️ Compra Recibida con Incidencia Registrada"
              : "✅ Mercancía Recibida Satisfactoriamente"}
          </h3>
          <p style={{ margin: 0, fontSize: "0.95rem" }}>
            {resultado.estado === "incidencia"
              ? `Se detectó un faltante global del ${resultado.porcentaje_faltante}%. La orden se catalogó como 'incidencia', se notificó de inmediato a gerencia/dueño y se asentó en auditoría. Redirigiendo a compras...`
              : "El inventario ha sido actualizado con éxito. Redirigiendo a compras..."}
          </p>
        </div>
      )}

      {faltantes.length > 0 && !resultado && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            color: "#92400e",
            marginBottom: "1.5rem",
          }}
        >
          <strong>⚠️ Alerta de Posible Incidencia ({faltantes.length} ítem(s) con faltante):</strong>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Has capturado una cantidad menor a la pedida en uno o más ingredientes. Al confirmar,
            la compra se marcará como <strong>INCIDENCIA</strong>, se enviará una notificación
            inmediata multicanal y se asentará en la bitácora inmutable de auditoría.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              padding: "1rem 1.5rem",
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#111827", fontWeight: 600 }}>
              📦 Verificación de Mercancía — Proveedor: {proveedorNombre}
            </h2>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
              Ingresa la cantidad física REALMENTE recibida. El stock del sistema solo sumará lo verificado.
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Ingrediente</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Cantidad Pedida</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Cantidad Físicamente Recibida</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Diferencia / Faltante</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Precio Pactado</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Total Recibido ($)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const recibida = cantidadesRecibidas[item.id] ?? 0;
                  const dif = recibida - item.cantidad_pedida;
                  const esFaltante = dif < 0;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        background: esFaltante ? "#fffdf5" : "#ffffff",
                      }}
                    >
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <strong>{item.ingrediente_nombre}</strong>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "#6b7280" }}>
                          Unidad: {item.unidad_medida}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        {item.cantidad_pedida} {item.unidad_medida}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            disabled={cargando || resultado !== null}
                            value={recibida}
                            onChange={(e) =>
                              handleUpdate(item.id, parseFloat(e.target.value) || 0)
                            }
                            style={{
                              width: "110px",
                              padding: "0.4rem 0.6rem",
                              borderRadius: "4px",
                              border: esFaltante ? "2px solid #f59e0b" : "1px solid #d1d5db",
                              fontWeight: 600,
                            }}
                          />
                          <span style={{ fontSize: "0.85rem", color: "#4b5563" }}>
                            {item.unidad_medida}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {esFaltante ? (
                          <span
                            style={{
                              color: "#dc2626",
                              fontWeight: 600,
                              background: "#fee2e2",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                            }}
                          >
                            ⚠️ Faltan {Math.abs(dif).toFixed(2)} {item.unidad_medida}
                          </span>
                        ) : dif > 0 ? (
                          <span
                            style={{
                              color: "#16a34a",
                              fontWeight: 600,
                              background: "#dcfce7",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                            }}
                          >
                            +{dif.toFixed(2)} {item.unidad_medida} excedente
                          </span>
                        ) : (
                          <span style={{ color: "#16a34a", fontWeight: 600 }}>
                            ✓ Completo
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        ${item.costo_unitario_pactado.toFixed(2)}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        ${(recibida * item.costo_unitario_pactado).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: "1.25rem 1.5rem",
              background: "#f9fafb",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <span style={{ fontSize: "1rem", color: "#4b5563" }}>Total Real Recibido: </span>
              <strong style={{ fontSize: "1.4rem", color: "#111827" }}>
                ${totalRecibidoMonto.toFixed(2)}
              </strong>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Link
                href="/compras"
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Volver
              </Link>

              <button
                type="submit"
                disabled={cargando || resultado !== null}
                style={{
                  padding: "0.6rem 1.5rem",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    cargando || resultado !== null
                      ? "#9ca3af"
                      : faltantes.length > 0
                      ? "#d97706"
                      : "#16a34a",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: cargando || resultado !== null ? "not-allowed" : "pointer",
                }}
              >
                {cargando
                  ? "Procesando..."
                  : faltantes.length > 0
                  ? "Confirmar Recepción con Incidencia"
                  : "Confirmar Recepción Conforme"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

