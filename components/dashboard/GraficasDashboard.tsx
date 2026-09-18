"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";

interface PropsGraficas {
  serieHoras: { hora: string; ventas: number }[];
  serieDias: { dia: string; ventas: number }[];
  comparativaSucursales?: {
    nombre: string;
    ventas_hoy: number;
    ventas_semana: number;
    ventas_mes: number;
  }[];
}

export function GraficasDashboard({
  serieHoras,
  serieDias,
  comparativaSucursales,
}: PropsGraficas) {
  const [vistaTiempo, setVistaTiempo] = useState<"horas" | "dias">("horas");

  const datosLinea: { etiqueta: string; ventas: number }[] =
    vistaTiempo === "horas"
      ? serieHoras.map((h) => ({ etiqueta: h.hora, ventas: h.ventas }))
      : serieDias.map((d) => ({ etiqueta: d.dia, ventas: d.ventas }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "1.5rem" }}>
      {/* Gráfica de Línea: Ventas a lo largo del tiempo */}
      <div
        style={{
          background: "#ffffff",
          padding: "1.5rem",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "#111827" }}>
            📈 Curva de Ventas {vistaTiempo === "horas" ? "(Hoy por Hora)" : "(Últimos 7 Días)"}
          </h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setVistaTiempo("horas")}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "4px",
                border: "1px solid #d1d5db",
                background: vistaTiempo === "horas" ? "#2563eb" : "#f9fafb",
                color: vistaTiempo === "horas" ? "#ffffff" : "#374151",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Por Hora (Hoy)
            </button>
            <button
              type="button"
              onClick={() => setVistaTiempo("dias")}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "4px",
                border: "1px solid #d1d5db",
                background: vistaTiempo === "dias" ? "#2563eb" : "#f9fafb",
                color: vistaTiempo === "dias" ? "#ffffff" : "#374151",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Últimos 7 Días
            </button>
          </div>
        </div>

        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datosLinea} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="etiqueta" stroke="#6b7280" fontSize={12} />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip
                formatter={(val: any) => [`$${Number(val).toFixed(2)}`, "Ventas"]}
                contentStyle={{ borderRadius: "6px", border: "1px solid #e5e7eb" }}
              />
              <Line
                type="monotone"
                dataKey="ventas"
                name="Ventas ($)"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#2563eb" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfica de Barras: Comparativa entre Sucursales (si hay múltiples) */}
      {comparativaSucursales && comparativaSucursales.length > 1 && (
        <div
          style={{
            background: "#ffffff",
            padding: "1.5rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem", color: "#111827" }}>
            📊 Comparativa de Ventas entre Restaurantes
          </h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparativaSucursales}
                margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="nombre" stroke="#6b7280" fontSize={12} />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  formatter={(val: any) => [`$${Number(val).toFixed(2)}`]}
                  contentStyle={{ borderRadius: "6px", border: "1px solid #e5e7eb" }}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="ventas_hoy" name="Ventas Hoy" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ventas_semana" name="Últimos 7 Días" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
