"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearCompraAction,
  SugerenciaCompraItem,
} from "@/lib/compras-actions";
import Link from "next/link";

interface ProveedorOption {
  id: string;
  nombre: string;
}

interface Props {
  sugerencias: SugerenciaCompraItem[];
  proveedores: ProveedorOption[];
}

export function NuevaCompraForm({ sugerencias, proveedores }: Props) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [itemsSeleccionados, setItemsSeleccionados] = useState<
    Record<
      string,
      {
        incluido: boolean;
        cantidad_pedida: number;
        costo_unitario_pactado: number;
      }
    >
  >(() => {
    const initial: Record<
      string,
      {
        incluido: boolean;
        cantidad_pedida: number;
        costo_unitario_pactado: number;
      }
    > = {};
    for (const s of sugerencias) {
      initial[s.ingrediente_id] = {
        incluido: true,
        cantidad_pedida: s.cantidad_sugerida,
        costo_unitario_pactado: s.costo_unitario_actual,
      };
    }
    return initial;
  });

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setItemsSeleccionados((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        incluido: !prev[id]?.incluido,
      },
    }));
  };

  const updateCantidad = (id: string, cant: number) => {
    setItemsSeleccionados((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        cantidad_pedida: cant > 0 ? cant : 0,
      },
    }));
  };

  const updateCosto = (id: string, costo: number) => {
    setItemsSeleccionados((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        costo_unitario_pactado: costo >= 0 ? costo : 0,
      },
    }));
  };

  const itemsAEnviar = sugerencias
    .filter((s) => itemsSeleccionados[s.ingrediente_id]?.incluido)
    .map((s) => ({
      ingrediente_id: s.ingrediente_id,
      cantidad_pedida: itemsSeleccionados[s.ingrediente_id].cantidad_pedida,
      costo_unitario_pactado:
        itemsSeleccionados[s.ingrediente_id].costo_unitario_pactado,
    }));

  const totalEstimado = itemsAEnviar.reduce(
    (sum, i) => sum + i.cantidad_pedida * i.costo_unitario_pactado,
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedorId) {
      setError("Por favor selecciona un proveedor.");
      return;
    }

    if (itemsAEnviar.length === 0) {
      setError("Selecciona al menos un ingrediente para la orden de compra.");
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const res = await crearCompraAction({
        proveedor_id: proveedorId,
        items: itemsAEnviar,
      });

      if (res.ok) {
        router.push(`/compras`);
        router.refresh();
      } else {
        setError("Error al crear la orden de compra");
      }
    } catch (err: any) {
      setError(err?.message ?? "Error inesperado al generar la compra");
    } finally {
      setCargando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #ef4444",
            padding: "1rem",
            borderRadius: "6px",
            color: "#991b1b",
            marginBottom: "1.5rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Selector de Proveedor */}
      <div
        style={{
          background: "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          marginBottom: "1.5rem",
        }}
      >
        <label
          style={{
            display: "block",
            fontWeight: 600,
            marginBottom: "0.5rem",
            color: "#374151",
          }}
        >
          🏢 Proveedor Destinatario:
        </label>
        {proveedores.length === 0 ? (
          <p style={{ color: "#dc2626", margin: 0 }}>
            No hay proveedores registrados para este restaurante. Registra un
            proveedor antes de generar órdenes.
          </p>
        ) : (
          <select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            required
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              fontSize: "1rem",
              width: "100%",
              maxWidth: "400px",
            }}
          >
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tabla de Sugerencias con Comparador de Proveedores */}
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
          <h2
            style={{
              margin: 0,
              fontSize: "1.1rem",
              color: "#111827",
              fontWeight: 600,
            }}
          >
            📋 Ingredientes que Requieren Reposición ({sugerencias.length})
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
            Cálculo inteligente: Déficit sobre stock mínimo + Consumo proyectado
            por demanda a 7 días.
          </p>
        </div>

        {sugerencias.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
            🎉 Todos los ingredientes tienen niveles de stock saludables por encima
            del mínimo.
          </div>
        ) : (
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
                  <th style={{ padding: "0.75rem 1rem" }}>Incluir</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Ingrediente</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Stock Actual / Mínimo</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Demanda 7d</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Sugerido</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Cantidad a Pedir</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Precio Unitario ($)</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Comparativa Proveedores</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sugerencias.map((s) => {
                  const state = itemsSeleccionados[s.ingrediente_id] ?? {
                    incluido: true,
                    cantidad_pedida: s.cantidad_sugerida,
                    costo_unitario_pactado: s.costo_unitario_actual,
                  };
                  const subtotal = state.incluido
                    ? state.cantidad_pedida * state.costo_unitario_pactado
                    : 0;

                  return (
                    <tr
                      key={s.ingrediente_id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        background: state.incluido ? "#ffffff" : "#f9fafb",
                        opacity: state.incluido ? 1 : 0.6,
                      }}
                    >
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <input
                          type="checkbox"
                          checked={state.incluido}
                          onChange={() => toggleItem(s.ingrediente_id)}
                          style={{ cursor: "pointer", transform: "scale(1.2)" }}
                        />
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <strong>{s.nombre}</strong>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "#6b7280" }}>
                          Unidad: {s.unidad_medida}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            color: s.stock_actual <= s.stock_minimo * 0.25 ? "#dc2626" : "#d97706",
                            fontWeight: 600,
                          }}
                        >
                          {s.stock_actual}
                        </span>{" "}
                        / {s.stock_minimo} {s.unidad_medida}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        +{s.consumo_estimado_7dias} {s.unidad_medida}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: "bold", color: "#2563eb" }}>
                        {s.cantidad_sugerida} {s.unidad_medida}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <input
                          type="number"
                          step="0.1"
                          min="0.01"
                          disabled={!state.incluido}
                          value={state.cantidad_pedida}
                          onChange={(e) =>
                            updateCantidad(s.ingrediente_id, parseFloat(e.target.value) || 0)
                          }
                          style={{
                            width: "90px",
                            padding: "0.4rem",
                            borderRadius: "4px",
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={!state.incluido}
                          value={state.costo_unitario_pactado}
                          onChange={(e) =>
                            updateCosto(s.ingrediente_id, parseFloat(e.target.value) || 0)
                          }
                          style={{
                            width: "90px",
                            padding: "0.4rem",
                            borderRadius: "4px",
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </td>
                      {/* Comparador de Proveedores Históricos */}
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {s.proveedores_comparativa.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            {s.proveedores_comparativa.map((prov, idx) => (
                              <span
                                key={prov.proveedor_id}
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.2rem 0.4rem",
                                  borderRadius: "4px",
                                  background: idx === 0 ? "#dcfce7" : "#f3f4f6",
                                  color: idx === 0 ? "#166534" : "#374151",
                                  border: idx === 0 ? "1px solid #86efac" : "1px solid #e5e7eb",
                                }}
                                title={`${prov.total_compras} compras previas`}
                              >
                                {idx === 0 ? "🏷️ Más bajo: " : ""}
                                <strong>{prov.proveedor_nombre}</strong>: ${prov.precio_promedio.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                            Sin compras previas
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        ${subtotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Resumen Total y Botón de Envío */}
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
            <span style={{ fontSize: "1rem", color: "#4b5563" }}>Total Estimado: </span>
            <strong style={{ fontSize: "1.4rem", color: "#111827" }}>
              ${totalEstimado.toFixed(2)}
            </strong>
            <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "0.75rem" }}>
              ({itemsAEnviar.length} ítems seleccionados)
            </span>
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
              Cancelar
            </Link>

            <button
              type="submit"
              disabled={cargando || itemsAEnviar.length === 0 || !proveedorId}
              style={{
                padding: "0.6rem 1.5rem",
                borderRadius: "6px",
                border: "none",
                background:
                  cargando || itemsAEnviar.length === 0 || !proveedorId ? "#9ca3af" : "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                cursor:
                  cargando || itemsAEnviar.length === 0 || !proveedorId
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {cargando ? "Generando Orden..." : "Generar Orden de Compra"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

