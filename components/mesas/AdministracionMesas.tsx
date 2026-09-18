"use client";

import { useState } from "react";
import { regenerarTokenMesaAction } from "@/lib/mesas-actions";

interface MesaInfo {
  id: string;
  numero: number;
  qr_token: string;
  mesero_asignado?: string | null;
}

interface Props {
  mesasIniciales: MesaInfo[];
  restauranteNombre: string;
}

export function AdministracionMesas({ mesasIniciales, restauranteNombre }: Props) {
  const [mesas, setMesas] = useState<MesaInfo[]>(mesasIniciales);
  const [cargandoId, setCargandoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "exito" | "error" } | null>(null);

  const handleRegenerarQR = async (mesaId: string, numero: number) => {
    if (!confirm(`¿Regenerar QR de la Mesa ${numero}? El código QR anterior quedará invalidado inmediatamente.`)) {
      return;
    }

    setCargandoId(mesaId);
    setMensaje(null);

    try {
      const res = await regenerarTokenMesaAction(mesaId);
      if (res.ok) {
        setMesas((prev) =>
          prev.map((m) => (m.id === mesaId ? { ...m, qr_token: res.nuevo_token } : m))
        );
        setMensaje({
          texto: `QR de la Mesa ${numero} regenerado con éxito. El QR anterior ha sido revocado.`,
          tipo: "exito",
        });
      }
    } catch (err: any) {
      setMensaje({
        texto: `Error al regenerar QR: ${err.message}`,
        tipo: "error",
      });
    } finally {
      setCargandoId(null);
    }
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "2rem auto", padding: "0 1rem", fontFamily: "sans-serif" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Administración de QR y Mesas</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Sucursal activa: <strong>{restauranteNombre}</strong>
        </p>
      </header>

      {mensaje && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            background: mensaje.tipo === "exito" ? "#d1fae5" : "#fee2e2",
            color: mensaje.tipo === "exito" ? "#065f46" : "#991b1b",
            border: `1px solid ${mensaje.tipo === "exito" ? "#6ee7b7" : "#fca5a5"}`,
          }}
        >
          {mensaje.texto}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
        {mesas.map((mesa) => {
          const urlMenu = `/menu/${mesa.qr_token}`;
          return (
            <div
              key={mesa.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                padding: "1.25rem",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Mesa {mesa.numero}</h2>
              </div>

              <div style={{ fontSize: "0.85rem", color: "#4b5563", marginBottom: "1rem" }}>
                <p style={{ margin: "0.25rem 0" }}>
                  <strong>Token QR:</strong> <code style={{ fontSize: "0.8rem" }}>{mesa.qr_token.slice(0, 8)}...</code>
                </p>
                <p style={{ margin: "0.25rem 0" }}>
                  <strong>Mesero asignado:</strong> {mesa.mesero_asignado ?? "Sin asignar"}
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <a
                  href={urlMenu}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "#f3f4f6",
                    color: "#111827",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontSize: "0.85rem",
                    textAlign: "center",
                    flex: 1,
                  }}
                >
                  Ver Menú
                </a>
                <button
                  type="button"
                  onClick={() => handleRegenerarQR(mesa.id, mesa.numero)}
                  disabled={cargandoId === mesa.id}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: cargandoId === mesa.id ? "#d1d5db" : "#dc2626",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: cargandoId === mesa.id ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                    flex: 1,
                  }}
                >
                  {cargandoId === mesa.id ? "Regenerando..." : "Regenerar QR"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

