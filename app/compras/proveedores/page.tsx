import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { obtenerHistorialIncidenciasProveedores } from "@/lib/compras-actions";
import Link from "next/link";

export default async function ProveedoresIncidenciasPage() {
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
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;
  if (!restaurante_id) redirect("/seleccionar-restaurante");

  // Validación estricta de roles: solo 'gerente' o 'dueno'
  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo || !["gerente", "dueno"].includes(vinculo.rol)) {
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
          <h1 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem" }}>⛔ Acceso Denegado (403)</h1>
          <p style={{ margin: 0, fontSize: "1rem", lineHeight: 1.5 }}>
            Hola <strong>{usuario.nombre}</strong>. El historial de desempeño y calificación de proveedores
            está restringido para personal con rol de <strong>Gerente</strong> o <strong>Dueño</strong>.
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#7f1d1d" }}>
            Tu rol actual en esta sucursal es: <code>{vinculo?.rol ?? "Sin rol asignado"}</code>.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link
              href="/"
              style={{
                padding: "0.6rem 1.25rem",
                background: "#2563eb",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Volver al Inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const proveedores = await obtenerHistorialIncidenciasProveedores(restaurante_id);

  const totalIncidenciasGlobales = proveedores.reduce(
    (sum, p) => sum + p.compras_incidencia,
    0
  );

  return (
    <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.75rem", color: "#111827" }}>
            🏢 Desempeño y Calificación de Proveedores
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem" }}>
            Historial de cumplimiento y tasa de incidencias por faltante en recepciones.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link
            href="/compras/nueva"
            style={{
              padding: "0.6rem 1.25rem",
              background: "#2563eb",
              color: "#ffffff",
              borderRadius: "6px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + Nueva Orden de Compra
          </Link>

          <Link
            href="/compras"
            style={{
              padding: "0.6rem 1.25rem",
              borderRadius: "6px",
              background: "#f3f4f6",
              color: "#374151",
              textDecoration: "none",
              fontWeight: 500,
              border: "1px solid #d1d5db",
            }}
          >
            ← Volver a Compras
          </Link>
        </div>
      </div>

      {/* Resumen de Métricas de Proveedores */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: "1.25rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <span style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 600 }}>
            PROVEEDORES REGISTRADOS
          </span>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#111827", marginTop: "0.25rem" }}>
            {proveedores.length}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "1.25rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <span style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 600 }}>
            TOTAL DE INCIDENCIAS HISTÓRICAS
          </span>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: "bold",
              color: totalIncidenciasGlobales > 0 ? "#dc2626" : "#16a34a",
              marginTop: "0.25rem",
            }}
          >
            {totalIncidenciasGlobales}
          </div>
        </div>
      </div>

      {/* Tabla de Proveedores */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
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
            Registro de Proveedores y Confiabilidad
          </h2>
        </div>

        {proveedores.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
            No hay proveedores registrados aún en este restaurante.
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
                  <th style={{ padding: "0.75rem 1rem" }}>Proveedor</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Contacto</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Total Compras</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Compras Conformes</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Compras con Incidencia</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Tasa de Incidencia</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Calificación Actual</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((p) => {
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <strong style={{ fontSize: "0.95rem", color: "#111827" }}>
                          {p.nombre}
                        </strong>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#4b5563" }}>
                        {p.contacto && <div>👤 {p.contacto}</div>}
                        {p.telefono && <div style={{ fontSize: "0.8rem" }}>📞 {p.telefono}</div>}
                        {p.email && <div style={{ fontSize: "0.8rem" }}>✉️ {p.email}</div>}
                        {!p.contacto && !p.telefono && !p.email && "—"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        {p.total_compras}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#16a34a", fontWeight: 600 }}>
                        {p.compras_recibidas}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {p.compras_incidencia > 0 ? (
                          <span
                            style={{
                              background: "#fee2e2",
                              color: "#dc2626",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontWeight: 600,
                              fontSize: "0.85rem",
                            }}
                          >
                            ⚠️ {p.compras_incidencia}
                          </span>
                        ) : (
                          <span style={{ color: "#16a34a" }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            fontWeight: "bold",
                            color:
                              p.tasa_incidencia === 0
                                ? "#16a34a"
                                : p.tasa_incidencia <= 10
                                ? "#d97706"
                                : "#dc2626",
                          }}
                        >
                          {p.tasa_incidencia}%
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {p.calificacion !== null ? (
                          <span style={{ fontWeight: 600, color: "#d97706" }}>
                            ⭐ {p.calificacion.toFixed(1)} / 5.0
                          </span>
                        ) : (
                          <span style={{ color: "#9ca3af" }}>Sin calificación</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

