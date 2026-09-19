"use client";

import { useState } from "react";
import {
  capturarConteoFisicoAction,
  confirmarCierreCajaAction,
  type ResumenMetodosPago,
  type EstadoTurnoInfo,
} from "@/lib/caja-actions";

interface FormularioCierreProps {
  rol: "cajero" | "mesero" | "gerente" | "dueno";
  usuarioNombre: string;
  usuarioId: string;
  turnoInfo: EstadoTurnoInfo;
  sistema: ResumenMetodosPago;
}

export function FormularioCierre({
  rol,
  usuarioNombre,
  usuarioId,
  turnoInfo,
  sistema,
}: FormularioCierreProps) {
  const esSupervisor = ["gerente", "dueno"].includes(rol);
  const estaCerrado = turnoInfo.estado === "cerrado";

  const [efectivo, setEfectivo] = useState<number>(sistema.efectivo);
  const [tarjeta, setTarjeta] = useState<number>(sistema.tarjeta);
  const [transferencia, setTransferencia] = useState<number>(sistema.transferencia);
  const [notas, setNotas] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  const [resultadoFinal, setResultadoFinal] = useState<any | null>(null);

  // Cálculos en tiempo real en la UI
  const diffEfectivo = Number((efectivo - sistema.efectivo).toFixed(2));
  const diffTarjeta = Number((tarjeta - sistema.tarjeta).toFixed(2));
  const diffTransfer = Number((transferencia - sistema.transferencia).toFixed(2));
  const totalFisico = Number((efectivo + tarjeta + transferencia).toFixed(2));
  const diffTotal = Number((totalFisico - sistema.total).toFixed(2));
  const hayDescuadre =
    Math.abs(diffEfectivo) >= 0.01 ||
    Math.abs(diffTarjeta) >= 0.01 ||
    Math.abs(diffTransfer) >= 0.01;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setCargando(true);

    try {
      if (esSupervisor) {
        // ACCIÓN 2: Confirmar cierre definitivo (Gerente/Dueño)
        const res = await confirmarCierreCajaAction({
          turno_id: turnoInfo.id,
          efectivo,
          tarjeta,
          transferencia,
          capturado_por_id: usuarioId,
          capturado_por_nombre: usuarioNombre,
          capturado_por_rol: rol,
          notas,
        });

        if (!res.ok) {
          setMensaje({ tipo: "error", texto: res.error ?? "Error al procesar el cierre" });
        } else {
          setResultadoFinal(res);
          setMensaje({
            tipo: "exito",
            texto: res.hay_discrepancia
              ? `⚠️ Cierre registrado con DISCREPANCIA de $${res.diferencias.total.diferencia.toFixed(2)}. Se ha asentado en la bitácora de auditoría y se despachó alerta a gerencia.`
              : "✅ Cierre de turno CONCILIADO exitosamente. La caja cuadró con el sistema.",
          });
        }
      } else {
        // ACCIÓN 1: Captura física de mesero/cajero
        const res = await capturarConteoFisicoAction({
          turno_id: turnoInfo.id,
          efectivo,
          tarjeta,
          transferencia,
          notas,
        });

        setResultadoFinal(res);
        setMensaje({
          tipo: "exito",
          texto:
            "📋 Conteo físico registrado y entregado para revisión. Un gerente o dueño debe autorizar el cierre definitivo.",
        });
      }
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.message ?? "Ocurrió un error inesperado" });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Banner de estado del turno */}
      {estaCerrado ? (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            color: "#991b1b",
          }}
        >
          <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.05rem" }}>
            🔒 Turno Cerrado ({turnoInfo.codigo})
          </h3>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            Este turno ya fue cerrado y conciliado. El sistema rechaza cualquier intento de doble cierre para prevenir manipulación.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: esSupervisor ? "#f0fdf4" : "#eff6ff",
            border: `1px solid ${esSupervisor ? "#86efac" : "#93c5fd"}`,
            borderRadius: "8px",
            padding: "0.85rem 1.25rem",
            marginBottom: "1.5rem",
            color: esSupervisor ? "#166534" : "#1e40af",
            fontSize: "0.9rem",
          }}
        >
          <strong>Rol activo: {rol.toUpperCase()} ({usuarioNombre})</strong> •{" "}
          {esSupervisor
            ? "Tienes permiso de supervisión para AUTORIZAR Y CERRAR el corte de caja."
            : "Control anti-robo activo: Tu rol permite registrar la entrega del conteo físico; el cierre definitivo requiere autorización de Gerencia."}
        </div>
      )}

      {mensaje && (
        <div
          style={{
            background: mensaje.tipo === "exito" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${mensaje.tipo === "exito" ? "#a7f3d0" : "#fecaca"}`,
            color: mensaje.tipo === "exito" ? "#065f46" : "#991b1b",
            padding: "1rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            fontWeight: 500,
          }}
        >
          {mensaje.texto}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          {/* COLUMNA 1: Sistema (Órdenes Pagadas) */}
          <div style={panelCard}>
            <div style={panelHeader}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>1. Sistema (Ventas Pagadas)</h3>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                {sistema.ordenes_count} órdenes pagadas
              </span>
            </div>

            <div style={campoFila}>
              <span>💵 Efectivo</span>
              <strong>${sistema.efectivo.toFixed(2)}</strong>
            </div>
            <div style={campoFila}>
              <span>💳 Tarjeta / Terminal</span>
              <strong>${sistema.tarjeta.toFixed(2)}</strong>
            </div>
            <div style={campoFila}>
              <span>📱 Transferencia</span>
              <strong>${sistema.transferencia.toFixed(2)}</strong>
            </div>
            <div style={{ ...campoFila, borderTop: "2px solid #e5e7eb", marginTop: "0.75rem", paddingTop: "0.75rem" }}>
              <span style={{ fontWeight: 700 }}>Total Sistema</span>
              <strong style={{ fontSize: "1.2rem", color: "#111827" }}>
                ${sistema.total.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* COLUMNA 2: Conteo Físico en Caja */}
          <div style={panelCard}>
            <div style={panelHeader}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>2. Conteo Físico en Caja</h3>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                {estaCerrado ? "Bloqueado" : "Captura manual"}
              </span>
            </div>

            <div style={inputGrupo}>
              <label style={labelStyle}>💵 Efectivo en Billetes / Monedas ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={estaCerrado || cargando}
                value={efectivo}
                onChange={(e) => setEfectivo(Number(e.target.value))}
                style={inputStyle}
                required
              />
            </div>

            <div style={inputGrupo}>
              <label style={labelStyle}>💳 Vouchers de Tarjeta / Terminal ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={estaCerrado || cargando}
                value={tarjeta}
                onChange={(e) => setTarjeta(Number(e.target.value))}
                style={inputStyle}
                required
              />
            </div>

            <div style={inputGrupo}>
              <label style={labelStyle}>📱 Comprobantes de Transferencia ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={estaCerrado || cargando}
                value={transferencia}
                onChange={(e) => setTransferencia(Number(e.target.value))}
                style={inputStyle}
                required
              />
            </div>

            <div style={{ ...campoFila, borderTop: "2px solid #e5e7eb", marginTop: "0.75rem", paddingTop: "0.75rem" }}>
              <span style={{ fontWeight: 700 }}>Total Físico</span>
              <strong style={{ fontSize: "1.2rem", color: "#2563eb" }}>
                ${totalFisico.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* COLUMNA 3: Comparativa en Vivo & Diferencias */}
          <div style={{ ...panelCard, borderColor: hayDescuadre ? "#fca5a5" : "#86efac" }}>
            <div style={panelHeader}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>3. Diferencias Calculadas</h3>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  background: hayDescuadre ? "#fee2e2" : "#dcfce7",
                  color: hayDescuadre ? "#991b1b" : "#166534",
                }}
              >
                {hayDescuadre ? (diffTotal < 0 ? "Faltante" : "Sobrante") : "Cuadrado"}
              </span>
            </div>

            <div style={campoFila}>
              <span>Dif. Efectivo</span>
              <strong style={{ color: colorDiferencia(diffEfectivo) }}>
                {formatoDiferencia(diffEfectivo)}
              </strong>
            </div>
            <div style={campoFila}>
              <span>Dif. Tarjeta</span>
              <strong style={{ color: colorDiferencia(diffTarjeta) }}>
                {formatoDiferencia(diffTarjeta)}
              </strong>
            </div>
            <div style={campoFila}>
              <span>Dif. Transferencia</span>
              <strong style={{ color: colorDiferencia(diffTransfer) }}>
                {formatoDiferencia(diffTransfer)}
              </strong>
            </div>

            <div style={{ ...campoFila, borderTop: "2px solid #e5e7eb", marginTop: "0.75rem", paddingTop: "0.75rem" }}>
              <span style={{ fontWeight: 700 }}>Diferencia Global</span>
              <strong style={{ fontSize: "1.25rem", color: colorDiferencia(diffTotal) }}>
                {formatoDiferencia(diffTotal)}
              </strong>
            </div>

            {hayDescuadre && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "#b91c1c", lineHeight: "1.35" }}>
                ⚠️ Se registrará una discrepancia detallada en la bitácora de auditoría y se enviará una notificación automática a gerencia.
              </div>
            )}
          </div>
        </div>

        {/* Observaciones */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Observaciones / Justificación de incidencias:</label>
          <textarea
            value={notas}
            disabled={estaCerrado || cargando}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: Faltante de $20 atribuible a cambio de monedas; voucher de mesa 4 retenido en terminal."
            rows={3}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              fontFamily: "inherit",
              fontSize: "0.9rem",
            }}
          />
        </div>

        {/* Botón de acción segregado */}
        {!estaCerrado && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
            <button
              type="submit"
              disabled={cargando}
              style={{
                padding: "0.85rem 1.75rem",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "1rem",
                color: "#ffffff",
                background: esSupervisor ? (hayDescuadre ? "#dc2626" : "#16a34a") : "#2563eb",
                border: "none",
                cursor: cargando ? "not-allowed" : "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              {cargando
                ? "Procesando..."
                : esSupervisor
                ? hayDescuadre
                  ? "Autorizar Cierre con Discrepancia"
                  : "Confirmar y Cerrar Corte de Caja"
                : "Entregar Conteo Físico a Gerencia"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function colorDiferencia(diff: number): string {
  if (Math.abs(diff) < 0.01) return "#16a34a"; // Cuadrado
  if (diff < 0) return "#dc2626"; // Faltante
  return "#2563eb"; // Sobrante
}

function formatoDiferencia(diff: number): string {
  if (Math.abs(diff) < 0.01) return "$0.00";
  const signo = diff > 0 ? "+" : "";
  return `${signo}$${diff.toFixed(2)}`;
}

const panelCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "1.25rem",
  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid #f3f4f6",
  paddingBottom: "0.75rem",
  marginBottom: "1rem",
};

const campoFila: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.45rem 0",
  fontSize: "0.95rem",
};

const inputGrupo: React.CSSProperties = {
  marginBottom: "0.85rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "#4b5563",
  marginBottom: "0.35rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  fontSize: "1rem",
  fontWeight: 600,
};

