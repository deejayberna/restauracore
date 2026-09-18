import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes, restaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  obtenerReporteRentabilidad,
  type NivelRentabilidad,
  type PlatilloRentabilidad,
} from "@/lib/rentabilidad";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RentabilidadPage({ searchParams }: PageProps) {
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
  const ordenParam = resolvedSearchParams.orden === "mayor_a_menor" ? "mayor_a_menor" : "menor_a_mayor";
  const filtroNivel =
    typeof resolvedSearchParams.nivel === "string" ? resolvedSearchParams.nivel : "todos";

  const reporte = await obtenerReporteRentabilidad(restauranteActivo, {
    dias,
    orden: ordenParam,
  });

  const { platillos, metricas, ventana } = reporte;

  // Filtrado según tab de nivel
  const platillosFiltrados =
    filtroNivel === "todos"
      ? platillos
      : platillos.filter((p) => p.nivel === filtroNivel);

  // Conteo por nivel de rentabilidad
  const conteoPorNivel: Record<string, number> = {
    todos: platillos.length,
    critico: 0,
    alerta: 0,
    saludable: 0,
    excelente: 0,
    sin_datos: 0,
  };

  for (const p of platillos) {
    if (conteoPorNivel[p.nivel] !== undefined) {
      conteoPorNivel[p.nivel]++;
    }
  }

  // Platillos destacados para el resumen
  const platillosConVenta = platillos.filter((p) => p.tiene_receta && p.unidades_vendidas > 0);
  const platilloMenorMargen = platillosConVenta[0]; // Como está ordenado de menor a mayor
  const platilloMayorMargen = platillosConVenta[platillosConVenta.length - 1];

  const formatearFecha = (d: Date) =>
    d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "1350px", margin: "0 auto" }}>
      {/* Navegación y breadcrumbs */}
      <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link href="/dashboard" style={linkNav}>
          ← Volver al Dashboard
        </Link>
        <span style={{ color: "#aaa" }}>|</span>
        <Link href="/reportes/menu-engineering" style={linkNav}>
          ⭐ Menu Engineering
        </Link>
        <span style={{ color: "#aaa" }}>|</span>
        <Link href="/inventario" style={linkNav}>
          📦 Inventario
        </Link>
      </nav>

      {/* Encabezado */}
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
            Reporte de Rentabilidad y Food Cost Real
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#6b7280", fontSize: "0.95rem" }}>
            {vinculo[0].nombreRestaurante} • Ventana de ventas:{" "}
            <strong>
              {formatearFecha(ventana.inicio)} — {formatearFecha(ventana.fin)}
            </strong>{" "}
            ({dias} días)
          </p>
        </div>

        {/* Controles de periodo y ordenamiento */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "#4b5563", fontWeight: 600 }}>Periodo:</span>
            {[30, 60, 90, 180].map((d) => (
              <Link
                key={d}
                href={`/reportes/rentabilidad?dias=${d}&orden=${ordenParam}${filtroNivel !== "todos" ? `&nivel=${filtroNivel}` : ""}`}
                style={{
                  padding: "0.4rem 0.8rem",
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
                {d}d
              </Link>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "#4b5563", fontWeight: 600 }}>Orden:</span>
            <Link
              href={`/reportes/rentabilidad?dias=${dias}&orden=${ordenParam === "menor_a_mayor" ? "mayor_a_menor" : "menor_a_mayor"}${filtroNivel !== "todos" ? `&nivel=${filtroNivel}` : ""}`}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#1f2937",
                textDecoration: "none",
              }}
            >
              {ordenParam === "menor_a_mayor" ? "🔻 Menor a mayor (Críticos primero)" : "🔺 Mayor a menor"}
            </Link>
          </div>
        </div>
      </header>

      {/* Tarjetas de Métricas Globales */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div style={cardKpi}>
          <div style={labelKpi}>Food Cost Global</div>
          <div
            style={{
              ...valorKpi,
              color:
                metricas.food_cost_global_pct === null
                  ? "#111827"
                  : metricas.food_cost_global_pct > 35
                  ? "#dc2626"
                  : metricas.food_cost_global_pct > 30
                  ? "#d97706"
                  : "#16a34a",
            }}
          >
            {metricas.food_cost_global_pct !== null
              ? `${metricas.food_cost_global_pct.toFixed(1)}%`
              : "Sin datos"}
          </div>
          <div style={subKpi}>Costo alimentos / Ingreso de ventas</div>
        </div>

        <div style={cardKpi}>
          <div style={labelKpi}>Margen Bruto Total</div>
          <div style={{ ...valorKpi, color: "#16a34a" }}>
            ${metricas.margen_bruto_total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={subKpi}>
            Ventas: ${metricas.ingreso_total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} • Costos: ${metricas.costo_total_alimentos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={cardKpi}>
          <div style={labelKpi}>Menor Margen (Crítico)</div>
          <div style={{ ...valorKpi, fontSize: "1.25rem", color: "#dc2626" }}>
            {platilloMenorMargen ? platilloMenorMargen.nombre : "—"}
          </div>
          <div style={subKpi}>
            {platilloMenorMargen
              ? `Margen: $${platilloMenorMargen.margen_unitario.toFixed(2)} (${platilloMenorMargen.food_cost_pct?.toFixed(1)}% FC)`
              : "Sin ventas clasificables"}
          </div>
        </div>

        <div style={cardKpi}>
          <div style={labelKpi}>Mayor Margen (Estrella)</div>
          <div style={{ ...valorKpi, fontSize: "1.25rem", color: "#16a34a" }}>
            {platilloMayorMargen ? platilloMayorMargen.nombre : "—"}
          </div>
          <div style={subKpi}>
            {platilloMayorMargen
              ? `Margen: $${platilloMayorMargen.margen_unitario.toFixed(2)} (${platilloMayorMargen.food_cost_pct?.toFixed(1)}% FC)`
              : "Sin ventas clasificables"}
          </div>
        </div>
      </section>

      {/* Alerta de Salud Financiera si hay platillos críticos */}
      {conteoPorNivel.critico > 0 && (
        <section
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
            marginBottom: "1.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "1.5rem" }}>⚠️</span>
          <div>
            <strong style={{ color: "#991b1b", fontSize: "0.95rem" }}>
              Atención: Se detectaron {conteoPorNivel.critico} platillo(s) con Food Cost Crítico (&gt;38%)
            </strong>
            <p style={{ margin: "0.2rem 0 0", color: "#7f1d1d", fontSize: "0.85rem" }}>
              Estos platillos consumen un porcentaje desproporcionado de su precio en insumos. Se recomienda auditar porciones de receta, mermas o aumentar su precio de venta inmediatamente.
            </p>
          </div>
        </section>
      )}

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
            Rentabilidad por Platillo ({platillosFiltrados.length})
          </h2>

          {/* Filtros de Nivel */}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {[
              { id: "todos", label: `Todos (${conteoPorNivel.todos})` },
              { id: "critico", label: `🚨 Críticos (${conteoPorNivel.critico})` },
              { id: "alerta", label: `⚠️ Alerta (${conteoPorNivel.alerta})` },
              { id: "saludable", label: `✓ Saludable (${conteoPorNivel.saludable})` },
              { id: "excelente", label: `⭐ Excelente (${conteoPorNivel.excelente})` },
              { id: "sin_datos", label: `❔ Sin datos (${conteoPorNivel.sin_datos})` },
            ].map((tab) => (
              <Link
                key={tab.id}
                href={`/reportes/rentabilidad?dias=${dias}&orden=${ordenParam}&nivel=${tab.id}`}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  border: "1px solid",
                  borderColor: filtroNivel === tab.id ? "#1f2937" : "#e5e7eb",
                  background: filtroNivel === tab.id ? "#1f2937" : "#ffffff",
                  color: filtroNivel === tab.id ? "#ffffff" : "#4b5563",
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
                  <th style={th}>Categoría</th>
                  <th style={{ ...th, textAlign: "right" }}>Uds. Vendidas</th>
                  <th style={{ ...th, textAlign: "right" }}>Costo Receta</th>
                  <th style={{ ...th, textAlign: "right" }}>Precio Real</th>
                  <th style={{ ...th, textAlign: "right" }}>Food Cost %</th>
                  <th style={{ ...th, textAlign: "right" }}>Margen Unitario</th>
                  <th style={{ ...th, textAlign: "right" }}>Margen Total</th>
                  <th style={th}>Diagnóstico / Acción</th>
                </tr>
              </thead>
              <tbody>
                {platillosFiltrados.map((platillo) => {
                  const badge = badgeNivel(platillo.nivel);

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
                        <span style={{ fontSize: "0.8rem", color: "#4b5563" }}>
                          {platillo.categoria_nombre ?? "Sin categoría"}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                        {platillo.unidades_vendidas.toLocaleString("es-MX")}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {platillo.tiene_receta ? (
                          `$${platillo.costo_receta.toFixed(2)}`
                        ) : (
                          <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Sin receta</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        ${platillo.precio_promedio_real.toFixed(2)}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {platillo.food_cost_pct !== null ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              background: badge.bg,
                              color: badge.color,
                            }}
                          >
                            {platillo.food_cost_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: "#9ca3af" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontWeight: 700,
                          color: platillo.margen_unitario >= 0 ? "#15803d" : "#b91c1c",
                        }}
                      >
                        ${platillo.margen_unitario.toFixed(2)}
                        {platillo.margen_pct !== null && (
                          <span style={{ fontSize: "0.75rem", display: "block", color: "#6b7280", fontWeight: 400 }}>
                            ({platillo.margen_pct.toFixed(0)}% mg)
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                        ${platillo.margen_total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ ...td, fontSize: "0.82rem", color: "#374151" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: badge.bg,
                            color: badge.color,
                            marginRight: "0.5rem",
                          }}
                        >
                          {badge.texto}
                        </span>
                        {platillo.diagnostico}
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

function badgeNivel(nivel: NivelRentabilidad): { bg: string; color: string; texto: string } {
  switch (nivel) {
    case "critico":
      return { bg: "#fee2e2", color: "#991b1b", texto: "Crítico" };
    case "alerta":
      return { bg: "#fef3c7", color: "#92400e", texto: "Alerta" };
    case "saludable":
      return { bg: "#dcfce7", color: "#166534", texto: "Saludable" };
    case "excelente":
      return { bg: "#e0e7ff", color: "#3730a3", texto: "Excelente" };
    case "sin_datos":
      return { bg: "#f3f4f6", color: "#6b7280", texto: "Sin datos" };
  }
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

const linkNav: React.CSSProperties = {
  color: "#2563eb",
  fontWeight: 600,
  textDecoration: "none",
};

