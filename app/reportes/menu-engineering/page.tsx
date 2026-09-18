import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes, restaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generarReporteMenuEngineering } from "@/lib/ai/menuEngineering";
import {
  ETIQUETA_CUADRANTE,
  ORDEN_CUADRANTES,
  type Cuadrante,
  type PlatilloAnalizado,
} from "@/lib/ai/menuEngineeringCalculo";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MenuEngineeringPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) redirect("/login");

  const cookieStore = await cookies();
  const restauranteActivo = cookieStore.get("restaurante_activo")?.value;

  if (!restauranteActivo) redirect("/seleccionar-restaurante");

  // Validar rol en el restaurante activo (solo gerente o dueño)
  const vinculo = await db
    .select({
      rol: usuarioRestaurantes.rol,
      nombreRestaurante: restaurantes.nombre,
    })
    .from(usuarioRestaurantes)
    .innerJoin(restaurantes, eq(restaurantes.id, usuarioRestaurantes.restaurante_id))
    .where(
      and(
        eq(usuarioRestaurantes.usuario_id, usuario.id),
        eq(usuarioRestaurantes.restaurante_id, restauranteActivo),
        eq(usuarioRestaurantes.activo, true)
      )
    )
    .limit(1);

  if (!vinculo[0] || !["gerente", "dueno"].includes(vinculo[0].rol)) {
    redirect("/dashboard?error=sin-permiso");
  }

  const resolvedSearchParams = await searchParams;
  const diasParam = Number(resolvedSearchParams.dias);
  const dias = [30, 60, 90, 180].includes(diasParam) ? diasParam : 90;
  const filtroCuadrante =
    typeof resolvedSearchParams.cuadrante === "string" ? resolvedSearchParams.cuadrante : "todos";

  const reporte = await generarReporteMenuEngineering(restauranteActivo, { dias });
  const { platillos, umbrales, sugerencias } = reporte;

  // Filtrado de la tabla según tab seleccionado
  const platillosFiltrados =
    filtroCuadrante === "todos"
      ? platillos
      : platillos.filter((p) => p.cuadrante === filtroCuadrante);

  // Conteo por cuadrante
  const conteoPorCuadrante: Record<string, number> = {
    todos: platillos.length,
    estrella: 0,
    caballo_de_batalla: 0,
    rompecabezas: 0,
    perro: 0,
    sin_datos: 0,
  };

  for (const p of platillos) {
    if (conteoPorCuadrante[p.cuadrante] !== undefined) {
      conteoPorCuadrante[p.cuadrante]++;
    }
  }

  const formatearFecha = (d: Date) =>
    d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "1300px", margin: "0 auto" }}>
      {/* Navegación y encabezado */}
      <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link href="/dashboard" style={linkNav}>
          ← Volver al Dashboard
        </Link>
        <span style={{ color: "#aaa" }}>|</span>
        <Link href="/inventario" style={linkNav}>
          📦 Inventario
        </Link>
        <span style={{ color: "#aaa" }}>|</span>
        <Link href="/cocina" style={linkNav}>
          🍳 Cocina
        </Link>
      </nav>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: "1.25rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 700, margin: 0, color: "#111827" }}>
            Menu Engineering & Rentabilidad
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#6b7280", fontSize: "0.95rem" }}>
            {vinculo[0].nombreRestaurante} • Ventana de análisis:{" "}
            <strong>
              {formatearFecha(reporte.ventana.inicio)} — {formatearFecha(reporte.ventana.fin)}
            </strong>{" "}
            ({dias} días)
          </p>
        </div>

        {/* Selector de ventana de tiempo */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "#4b5563", fontWeight: 600 }}>Periodo:</span>
          {[30, 60, 90, 180].map((d) => (
            <Link
              key={d}
              href={`/reportes/menu-engineering?dias=${d}${filtroCuadrante !== "todos" ? `&cuadrante=${filtroCuadrante}` : ""}`}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                border: "1px solid",
                borderColor: dias === d ? "#2563eb" : "#d1d5db",
                background: dias === d ? "#2563eb" : "#ffffff",
                color: dias === d ? "#ffffff" : "#374151",
                textDecoration: "none",
              }}
            >
              {d} días
            </Link>
          ))}
        </div>
      </header>

      {/* Tarjetas de KPIs y Umbrales */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div style={cardKpi}>
          <div style={labelKpi}>Platillos Analizados</div>
          <div style={valorKpi}>{platillos.length}</div>
          <div style={subKpi}>
            {umbrales.platillos_clasificados} clasificados ({conteoPorCuadrante.sin_datos} sin datos)
          </div>
        </div>

        <div style={cardKpi}>
          <div style={labelKpi}>Unidades Vendidas</div>
          <div style={valorKpi}>{umbrales.unidades_totales.toLocaleString("es-MX")}</div>
          <div style={subKpi}>En órdenes pagadas y entregadas</div>
        </div>

        <div style={cardKpi}>
          <div style={labelKpi}>Margen Promedio Ponderado</div>
          <div style={valorKpi}>${umbrales.margen_minimo.toFixed(2)}</div>
          <div style={subKpi}>Umbral mínimo de rentabilidad</div>
        </div>

        <div style={cardKpi}>
          <div style={labelKpi}>Umbral Popularidad (70% cuota)</div>
          <div style={valorKpi}>{(umbrales.participacion_minima * 100).toFixed(1)}%</div>
          <div style={subKpi}>Participación mínima para ser popular</div>
        </div>
      </section>

      {/* Matriz 2x2 de Menu Engineering */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem", color: "#1f2937" }}>
          Matriz de Cuadrantes (Kasavana & Smith)
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Estrella */}
          <div style={{ ...cuadranteCard, borderColor: "#10b981", background: "#f0fdf4" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#065f46" }}>⭐ Estrella</h3>
              <span style={{ ...badgeConteo, background: "#10b981", color: "#fff" }}>
                {conteoPorCuadrante.estrella} platillos
              </span>
            </div>
            <p style={cuadranteSub}>Alta Popularidad + Alto Margen</p>
            <div style={cuadranteLista}>
              {platillos
                .filter((p) => p.cuadrante === "estrella")
                .map((p) => (
                  <span key={p.platillo_id} style={platilloTag}>
                    {p.nombre} ({p.unidades_vendidas} uds • ${p.margen_contribucion.toFixed(1)} mg)
                  </span>
                ))}
              {conteoPorCuadrante.estrella === 0 && <span style={sinPlatillos}>Sin platillos en este cuadrante</span>}
            </div>
            <div style={accionSugerida}>
              <strong>Acción clave:</strong> Mantener calidad inalterable, ubicar en la zona dorada del menú y potenciar upsell con bebidas y complementos de alto margen.
            </div>
          </div>

          {/* Caballo de batalla */}
          <div style={{ ...cuadranteCard, borderColor: "#3b82f6", background: "#eff6ff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#1e40af" }}>🐴 Caballo de batalla</h3>
              <span style={{ ...badgeConteo, background: "#3b82f6", color: "#fff" }}>
                {conteoPorCuadrante.caballo_de_batalla} platillos
              </span>
            </div>
            <p style={cuadranteSub}>Alta Popularidad + Bajo Margen</p>
            <div style={cuadranteLista}>
              {platillos
                .filter((p) => p.cuadrante === "caballo_de_batalla")
                .map((p) => (
                  <span key={p.platillo_id} style={platilloTag}>
                    {p.nombre} ({p.unidades_vendidas} uds • ${p.margen_contribucion.toFixed(1)} mg)
                  </span>
                ))}
              {conteoPorCuadrante.caballo_de_batalla === 0 && (
                <span style={sinPlatillos}>Sin platillos en este cuadrante</span>
              )}
            </div>
            <div style={accionSugerida}>
              <strong>Acción clave:</strong> Optimizar costos de receta y mermas. Armar combos con postres o entradas rentables y evaluar alza gradual de precio.
            </div>
          </div>

          {/* Rompecabezas */}
          <div style={{ ...cuadranteCard, borderColor: "#f59e0b", background: "#fffbeb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#92400e" }}>🧩 Rompecabezas</h3>
              <span style={{ ...badgeConteo, background: "#f59e0b", color: "#fff" }}>
                {conteoPorCuadrante.rompecabezas} platillos
              </span>
            </div>
            <p style={cuadranteSub}>Baja Popularidad + Alto Margen</p>
            <div style={cuadranteLista}>
              {platillos
                .filter((p) => p.cuadrante === "rompecabezas")
                .map((p) => (
                  <span key={p.platillo_id} style={platilloTag}>
                    {p.nombre} ({p.unidades_vendidas} uds • ${p.margen_contribucion.toFixed(1)} mg)
                  </span>
                ))}
              {conteoPorCuadrante.rompecabezas === 0 && (
                <span style={sinPlatillos}>Sin platillos en este cuadrante</span>
              )}
            </div>
            <div style={accionSugerida}>
              <strong>Acción clave:</strong> Venta sugestiva directa de meseros, mejor fotografía, renombrar platillo o reubicarlo como recomendación especial del chef.
            </div>
          </div>

          {/* Perro */}
          <div style={{ ...cuadranteCard, borderColor: "#ef4444", background: "#fef2f2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#991b1b" }}>🐕 Perro</h3>
              <span style={{ ...badgeConteo, background: "#ef4444", color: "#fff" }}>
                {conteoPorCuadrante.perro} platillos
              </span>
            </div>
            <p style={cuadranteSub}>Baja Popularidad + Bajo Margen</p>
            <div style={cuadranteLista}>
              {platillos
                .filter((p) => p.cuadrante === "perro")
                .map((p) => (
                  <span key={p.platillo_id} style={platilloTag}>
                    {p.nombre} ({p.unidades_vendidas} uds • ${p.margen_contribucion.toFixed(1)} mg)
                  </span>
                ))}
              {conteoPorCuadrante.perro === 0 && <span style={sinPlatillos}>Sin platillos en este cuadrante</span>}
            </div>
            <div style={accionSugerida}>
              <strong>Acción clave:</strong> Rediseñar para reducir costos significativamente o descontinuar para evitar congelar inventario y tiempo de cocina.
            </div>
          </div>
        </div>
      </section>

      {/* Sugerencias de IA y Estrategia de Upsell */}
      <section
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <span style={{ fontSize: "1.3rem" }}>💡</span>
          <div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
              Recomendaciones del Asistente & Estrategias de Upsell
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
              Sugerencias automáticas y tácticas de venta sugerida para optimizar el ticket promedio
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.85rem" }}>
          {ORDEN_CUADRANTES.filter((c) => c !== "sin_datos" || conteoPorCuadrante.sin_datos > 0).map((c) => (
            <div
              key={c}
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "0.85rem 1.15rem",
              }}
            >
              <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                {ETIQUETA_CUADRANTE[c as Cuadrante]}
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#334155", lineHeight: "1.45" }}>
                {sugerencias[c as Cuadrante]}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Tabla detallada de Platillos con Filtros */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#1f2937" }}>
            Detalle por Platillo ({platillosFiltrados.length})
          </h2>

          {/* Filtros de Cuadrante */}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {[
              { id: "todos", label: `Todos (${conteoPorCuadrante.todos})` },
              { id: "estrella", label: `⭐ Estrellas (${conteoPorCuadrante.estrella})` },
              { id: "caballo_de_batalla", label: `🐴 Caballos (${conteoPorCuadrante.caballo_de_batalla})` },
              { id: "rompecabezas", label: `🧩 Rompecabezas (${conteoPorCuadrante.rompecabezas})` },
              { id: "perro", label: `🐕 Perros (${conteoPorCuadrante.perro})` },
              { id: "sin_datos", label: `❔ Sin datos (${conteoPorCuadrante.sin_datos})` },
            ].map((tab) => (
              <Link
                key={tab.id}
                href={`/reportes/menu-engineering?dias=${dias}&cuadrante=${tab.id}`}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  border: "1px solid",
                  borderColor: filtroCuadrante === tab.id ? "#1f2937" : "#e5e7eb",
                  background: filtroCuadrante === tab.id ? "#1f2937" : "#ffffff",
                  color: filtroCuadrante === tab.id ? "#ffffff" : "#4b5563",
                  textDecoration: "none",
                }}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {platillosFiltrados.length === 0 ? (
          <div
            style={{
              padding: "3rem 1.5rem",
              textAlign: "center",
              background: "#f9fafb",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              color: "#6b7280",
            }}
          >
            <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
              No hay platillos que coincidan con este filtro en el periodo seleccionado.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={th}>Platillo</th>
                  <th style={th}>Cuadrante</th>
                  <th style={{ ...th, textAlign: "right" }}>Uds. Vendidas</th>
                  <th style={{ ...th, textAlign: "right" }}>% Venta</th>
                  <th style={{ ...th, textAlign: "right" }}>Precio Real</th>
                  <th style={{ ...th, textAlign: "right" }}>Costo Receta</th>
                  <th style={{ ...th, textAlign: "right" }}>Margen Contribución</th>
                  <th style={{ ...th, textAlign: "right" }}>Food Cost %</th>
                  <th style={th}>Acción Sugerida</th>
                </tr>
              </thead>
              <tbody>
                {platillosFiltrados.map((platillo) => {
                  const badge = badgeCuadrante(platillo.cuadrante);
                  const foodCostBadge = badgeFoodCost(platillo.food_cost_pct);

                  return (
                    <tr key={platillo.platillo_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={td}>
                        <strong>{platillo.nombre}</strong>
                        {platillo.precio_promedio_real !== platillo.precio_catalogo && platillo.unidades_vendidas > 0 && (
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            Catálogo: ${platillo.precio_catalogo.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.texto}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                        {platillo.unidades_vendidas.toLocaleString("es-MX")}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {(platillo.participacion * 100).toFixed(1)}%
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        ${platillo.precio_promedio_real.toFixed(2)}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {platillo.tiene_receta ? (
                          `$${platillo.costo_receta.toFixed(2)}`
                        ) : (
                          <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Sin receta</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontWeight: 600,
                          color: platillo.rentable ? "#15803d" : "#b91c1c",
                        }}
                      >
                        ${platillo.margen_contribucion.toFixed(2)}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {platillo.food_cost_pct !== null ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              background: foodCostBadge.bg,
                              color: foodCostBadge.color,
                            }}
                          >
                            {platillo.food_cost_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: "#9ca3af" }}>—</span>
                        )}
                      </td>
                      <td style={{ ...td, fontSize: "0.82rem", color: "#374151" }}>
                        {accionCorta(platillo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function accionCorta(p: PlatilloAnalizado): string {
  switch (p.cuadrante) {
    case "estrella":
      return "⭐ Mantener calidad y hacer upsell";
    case "caballo_de_batalla":
      return "🐴 Optimizar costo o armar combo";
    case "rompecabezas":
      return "🧩 Impulsar con venta sugestiva";
    case "perro":
      return "🐕 Rediseñar costo o retirar";
    case "sin_datos":
      return p.motivo_sin_datos === "sin_receta" ? "Registrar receta" : "Esperar ventas";
  }
}

function badgeCuadrante(cuadrante: Cuadrante): { bg: string; color: string; texto: string } {
  switch (cuadrante) {
    case "estrella":
      return { bg: "#dcfce7", color: "#166534", texto: "Estrella" };
    case "caballo_de_batalla":
      return { bg: "#dbeafe", color: "#1e40af", texto: "Caballo de batalla" };
    case "rompecabezas":
      return { bg: "#fef3c7", color: "#92400e", texto: "Rompecabezas" };
    case "perro":
      return { bg: "#fee2e2", color: "#991b1b", texto: "Perro" };
    case "sin_datos":
      return { bg: "#f3f4f6", color: "#6b7280", texto: "Sin datos" };
  }
}

function badgeFoodCost(pct: number | null): { bg: string; color: string } {
  if (pct === null) return { bg: "#f3f4f6", color: "#6b7280" };
  if (pct <= 30) return { bg: "#dcfce7", color: "#166534" }; // Ideal
  if (pct <= 35) return { bg: "#fef3c7", color: "#92400e" }; // Alerta moderada
  return { bg: "#fee2e2", color: "#991b1b" }; // Crítico / Alto
}

const th: React.CSSProperties = {
  padding: "0.75rem 1rem",
  fontWeight: 700,
  fontSize: "0.82rem",
  textTransform: "uppercase",
  letterSpacing: "0.025em",
  color: "#4b5563",
};

const td: React.CSSProperties = {
  padding: "0.75rem 1rem",
  verticalAlign: "middle",
};

const cardKpi: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "1.15rem",
  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
};

const labelKpi: React.CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "#6b7280",
};

const valorKpi: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 700,
  color: "#111827",
  marginTop: "0.25rem",
};

const subKpi: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#9ca3af",
  marginTop: "0.25rem",
};

const cuadranteCard: React.CSSProperties = {
  border: "1px solid",
  borderRadius: "8px",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const cuadranteSub: React.CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  color: "#4b5563",
  fontWeight: 500,
};

const cuadranteLista: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  margin: "0.5rem 0",
  minHeight: "4.5rem",
};

const platilloTag: React.CSSProperties = {
  fontSize: "0.82rem",
  background: "#ffffff",
  padding: "0.25rem 0.5rem",
  borderRadius: "4px",
  border: "1px solid rgba(0,0,0,0.08)",
  color: "#1f2937",
  fontWeight: 500,
};

const sinPlatillos: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#9ca3af",
  fontStyle: "italic",
};

const accionSugerida: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#374151",
  lineHeight: "1.35",
  borderTop: "1px solid rgba(0,0,0,0.06)",
  paddingTop: "0.5rem",
  marginTop: "auto",
};

const badgeConteo: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 700,
};

const linkNav: React.CSSProperties = {
  color: "#2563eb",
  fontWeight: 600,
  textDecoration: "none",
};

