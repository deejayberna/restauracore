import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logoutAction } from "@/lib/auth-actions";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { obtenerMetricasMultiSucursal } from "@/lib/dashboard-actions";
import { GraficasDashboard } from "@/components/dashboard/GraficasDashboard";

interface PropsPage {
  searchParams: Promise<{ restaurante?: string }>;
}

export default async function DashboardPage({ searchParams }: PropsPage) {
  const params = await searchParams;
  const filtroRestaurante = params.restaurante ?? "todos";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) redirect("/login");

  // 1. Control de acceso: consultar métricas multi-sucursal con verificación de rol 'dueno'
  const resultado = await obtenerMetricasMultiSucursal(usuario.id, filtroRestaurante);

  // Si el usuario no tiene ningún rol de dueño, denegar acceso
  if (!resultado.autorizado) {
    return (
      <main style={{ padding: "3rem", maxWidth: "800px", margin: "0 auto", fontFamily: "sans-serif" }}>
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            borderRadius: "8px",
            padding: "2rem",
            color: "#991b1b",
          }}
        >
          <h1 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem" }}>⛔ Acceso Restringido al Dashboard del Dueño</h1>
          <p style={{ margin: 0, fontSize: "1rem", lineHeight: 1.5 }}>
            Hola <strong>{usuario.nombre}</strong>. Esta vista ejecutiva multi-sucursal está reservada exclusivamente para usuarios con rol de <strong>Dueño</strong>.
          </p>
          <p style={{ marginTop: "1rem" }}>
            Tu usuario actual cuenta con permisos operativos en el sistema. Puedes dirigirte a tus módulos asignados:
          </p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
            <Link
              href="/caja/cierre"
              style={{
                padding: "0.75rem 1.25rem",
                background: "#d97706",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              💵 Corte de Caja
            </Link>
            <Link
              href="/inventario/merma"
              style={{
                padding: "0.75rem 1.25rem",
                background: "#dc2626",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              📸 Registrar Mermas
            </Link>
            <Link
              href="/cocina"
              style={{
                padding: "0.75rem 1.25rem",
                background: "#2563eb",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              🍳 Cocina (KDS)
            </Link>
          </div>
          <div style={{ marginTop: "2rem" }}>
            <form action={logoutAction}>
              <button
                type="submit"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6b7280",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: "0.9rem",
                }}
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const { restaurantes_disponibles, sucursales, consolidado } = resultado;

  return (
    <main style={{ padding: "2rem 3rem", maxWidth: "1400px", margin: "0 auto", fontFamily: "sans-serif" }}>
      {/* Header Ejecutivo */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: "1.5rem",
          marginBottom: "2rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.8rem", color: "#111827", fontWeight: 700 }}>
            🏢 Dashboard del Dueño (Multi-Sucursal)
          </h1>
          <p style={{ margin: "0.35rem 0 0 0", color: "#6b7280", fontSize: "0.95rem" }}>
            Bienvenido, <strong>{usuario.nombre}</strong> · Supervisión consolidada de tus negocios
          </p>
        </div>

        {/* Controles de Filtro y Sesión */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {restaurantes_disponibles.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="filtro-rest" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>
                Sucursal:
              </label>
              <form method="GET" style={{ margin: 0, display: "flex", gap: "0.5rem" }}>
                <select
                  id="filtro-rest"
                  name="restaurante"
                  defaultValue={filtroRestaurante}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "0.9rem",
                    background: "#ffffff",
                    fontWeight: 500,
                  }}
                >
                  <option value="todos">🌐 Todas las sucursales (Consolidado)</option>
                  {restaurantes_disponibles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  style={{
                    padding: "0.45rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    background: "#f3f4f6",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Filtrar
                </button>
              </form>
            </div>
          )}

          <form action={logoutAction}>
            <button
              type="submit"
              style={{
                padding: "0.45rem 0.95rem",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      {/* 2. Total Consolidado (Visible solo si administra > 1 restaurante y no hay filtro individual) */}
      {consolidado && (
        <section
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)",
            color: "#ffffff",
            padding: "1.75rem 2rem",
            borderRadius: "12px",
            marginBottom: "2.5rem",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span
                style={{
                  background: "#3b82f6",
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Métrica Agregada
              </span>
              <h2 style={{ margin: "0.6rem 0 0.2rem 0", fontSize: "1.4rem", fontWeight: 700 }}>
                {consolidado.etiqueta}
              </h2>
              <p style={{ margin: 0, opacity: 0.85, fontSize: "0.9rem" }}>
                Suma consolidada de todas las órdenes cobradas y alertas de tus {consolidado.num_restaurantes} restaurantes
              </p>
            </div>

            <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ opacity: 0.8, fontSize: "0.85rem", fontWeight: 500 }}>Ventas Hoy (Consolidado)</div>
                <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>${consolidado.ventas_hoy.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.8, fontSize: "0.85rem", fontWeight: 500 }}>Últimos 7 Días</div>
                <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>${consolidado.ventas_semana.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.8, fontSize: "0.85rem", fontWeight: 500 }}>Últimos 30 Días</div>
                <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>${consolidado.ventas_mes.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.8, fontSize: "0.85rem", fontWeight: 500 }}>Alertas / Anomalías</div>
                <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>
                  {consolidado.total_alertas_inventario + consolidado.total_anomalias}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Métricas por Restaurante (Segregadas estrictamente) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
        {sucursales.map((sucursal) => (
          <section
            key={sucursal.restaurante.id}
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "2rem",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            {/* Título de la Sucursal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid #f3f4f6",
                paddingBottom: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "#111827" }}>
                  🏠 {sucursal.restaurante.nombre}
                </h2>
                <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  Zona horaria: {sucursal.restaurante.timezone} · Plan: {sucursal.restaurante.plan.toUpperCase()}
                </span>
              </div>
              <span
                style={{
                  background: "#f3f4f6",
                  color: "#374151",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                Métricas Exclusivas
              </span>
            </div>

            {/* Fila de Tarjetas de Ventas */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>VENTAS DE HOY</span>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                  ${sucursal.ventas.hoy.toFixed(2)}
                </div>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{sucursal.ventas.ordenes_hoy} órdenes cobradas</span>
              </div>

              <div style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>ÚLTIMOS 7 DÍAS</span>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                  ${sucursal.ventas.semana.toFixed(2)}
                </div>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{sucursal.ventas.ordenes_semana} órdenes cobradas</span>
              </div>

              <div style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>ÚLTIMOS 30 DÍAS</span>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginTop: "0.25rem" }}>
                  ${sucursal.ventas.mes.toFixed(2)}
                </div>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{sucursal.ventas.ordenes_mes} órdenes cobradas</span>
              </div>

              {/* Tarjeta de Último Cierre de Caja */}
              <div
                style={{
                  background: sucursal.ultimo_cierre_caja?.hay_discrepancia ? "#fef2f2" : "#f0fdf4",
                  padding: "1.25rem",
                  borderRadius: "8px",
                  border: `1px solid ${sucursal.ultimo_cierre_caja?.hay_discrepancia ? "#fecaca" : "#bbf7d0"}`,
                }}
              >
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>ÚLTIMO CORTE DE CAJA</span>
                {sucursal.ultimo_cierre_caja ? (
                  <>
                    <div
                      style={{
                        fontSize: "1.2rem",
                        fontWeight: 800,
                        color: sucursal.ultimo_cierre_caja.hay_discrepancia ? "#dc2626" : "#16a34a",
                        marginTop: "0.25rem",
                      }}
                    >
                      {sucursal.ultimo_cierre_caja.hay_discrepancia
                        ? `Discrepancia $${sucursal.ultimo_cierre_caja.diferencia_total.toFixed(2)}`
                        : "Conciliado Exacto ($0.00)"}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Turno: {sucursal.ultimo_cierre_caja.codigo}
                    </span>
                  </>
                ) : (
                  <div style={{ fontSize: "0.9rem", color: "#64748b", marginTop: "0.5rem" }}>
                    Sin turnos cerrados aún
                  </div>
                )}
              </div>
            </div>

            {/* Fila de Top Platillos y Alertas */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
              {/* Top 5 Rentabilidad */}
              <div style={{ border: "1px solid #f1f5f9", borderRadius: "8px", padding: "1rem", background: "#ffffff" }}>
                <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", color: "#1e293b", fontWeight: 600 }}>
                  💎 Top 5 por Margen / Rentabilidad
                </h4>
                {sucursal.top_rentabilidad.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.85rem" }}>
                    {sucursal.top_rentabilidad.map((p, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.4rem 0",
                          borderBottom: "1px solid #f8fafc",
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>
                          {p.margen_pct !== null ? `${p.margen_pct.toFixed(1)}% margen` : "S/D"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>Sin datos de recetas o ventas</p>
                )}
              </div>

              {/* Top 5 Volumen */}
              <div style={{ border: "1px solid #f1f5f9", borderRadius: "8px", padding: "1rem", background: "#ffffff" }}>
                <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", color: "#1e293b", fontWeight: 600 }}>
                  🔥 Top 5 por Volumen de Ventas
                </h4>
                {sucursal.top_volumen.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.85rem" }}>
                    {sucursal.top_volumen.map((p, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.4rem 0",
                          borderBottom: "1px solid #f8fafc",
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                        <span style={{ color: "#2563eb", fontWeight: 700 }}>
                          {p.unidades} un. (${p.ingreso.toFixed(2)})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>Sin ventas registradas</p>
                )}
              </div>

              {/* Alertas de Inventario y Anomalías */}
              <div style={{ border: "1px solid #f1f5f9", borderRadius: "8px", padding: "1rem", background: "#ffffff" }}>
                <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", color: "#dc2626", fontWeight: 600 }}>
                  🚨 Alertas & Anomalías ({sucursal.alertas_inventario.length + sucursal.anomalias_activas.length})
                </h4>
                <div style={{ maxHeight: "160px", overflowY: "auto", fontSize: "0.85rem" }}>
                  {sucursal.alertas_inventario.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: "0.35rem 0.5rem",
                        background: a.nivel === "critico" ? "#fee2e2" : "#fef3c7",
                        borderRadius: "4px",
                        marginBottom: "0.4rem",
                        color: a.nivel === "critico" ? "#991b1b" : "#92400e",
                      }}
                    >
                      <strong>Stock {a.nivel}:</strong> {a.ingrediente}
                    </div>
                  ))}
                  {sucursal.anomalias_activas.map((anom) => (
                    <div
                      key={anom.id}
                      style={{
                        padding: "0.35rem 0.5rem",
                        background: "#ede9fe",
                        borderRadius: "4px",
                        marginBottom: "0.4rem",
                        color: "#5b21b6",
                      }}
                    >
                      <strong>Anomalía:</strong> {anom.explicacion}
                    </div>
                  ))}
                  {sucursal.alertas_inventario.length === 0 && sucursal.anomalias_activas.length === 0 && (
                    <p style={{ margin: 0, color: "#16a34a", fontSize: "0.85rem" }}>
                      ✅ Todo en orden: sin alertas activas
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Gráfica Interactiva Recharts para esta sucursal */}
            <GraficasDashboard
              serieHoras={sucursal.ventas.serie_horas}
              serieDias={sucursal.ventas.serie_dias}
            />
          </section>
        ))}
      </div>

      {/* Gráfica Comparativa Multi-Sucursal (si el dueño tiene > 1 restaurante) */}
      {consolidado && consolidado.comparativa.length > 1 && (
        <section style={{ marginTop: "2.5rem" }}>
          <GraficasDashboard
            serieHoras={sucursales[0]?.ventas.serie_horas ?? []}
            serieDias={sucursales[0]?.ventas.serie_dias ?? []}
            comparativaSucursales={consolidado.comparativa}
          />
        </section>
      )}

      {/* Barra Inferior de Navegación Operativa */}
      <footer style={{ marginTop: "4rem", paddingTop: "1.5rem", borderTop: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: "1rem", color: "#6b7280", marginBottom: "1rem" }}>
          Accesos Rápidos a Módulos Operativos
        </h3>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <Link
            href="/caja/cierre"
            style={{ padding: "0.6rem 1rem", background: "#d97706", color: "#ffffff", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}
          >
            💵 Arqueo y Cierre de Caja
          </Link>
          <Link
            href="/reportes/rentabilidad"
            style={{ padding: "0.6rem 1rem", background: "#059669", color: "#ffffff", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}
          >
            💰 Food Cost Real
          </Link>
          <Link
            href="/reportes/menu-engineering"
            style={{ padding: "0.6rem 1rem", background: "#2563eb", color: "#ffffff", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}
          >
            📊 Menu Engineering
          </Link>
          <Link
            href="/inventario/merma"
            style={{ padding: "0.6rem 1rem", background: "#dc2626", color: "#ffffff", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}
          >
            📸 Registro de Mermas
          </Link>
          <Link
            href="/inventario"
            style={{ padding: "0.6rem 1rem", background: "#f3f4f6", color: "#374151", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600, border: "1px solid #d1d5db" }}
          >
            📦 Inventario
          </Link>
        </div>
      </footer>
    </main>
  );
}
