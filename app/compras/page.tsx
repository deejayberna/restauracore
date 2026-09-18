import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { obtenerListaCompras } from "@/lib/compras-actions";
import Link from "next/link";

export default async function ComprasPage() {
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
            Hola <strong>{usuario.nombre}</strong>. El módulo de compras y gestión de proveedores está
            reservado exclusivamente para personal con rol de <strong>Gerente</strong> o <strong>Dueño</strong>.
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

  const comprasList = await obtenerListaCompras(restaurante_id);

  const pendientes = comprasList.filter((c) => c.estado === "pendiente" || c.estado === "confirmada");
  const recibidas = comprasList.filter((c) => c.estado === "recibida");
  const incidencias = comprasList.filter((c) => c.estado === "incidencia");

  return (
    <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.75rem", color: "#111827" }}>
            🛒 Gestión de Compras y Proveedores
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem" }}>
            Control de aprovisionamiento, sugerencias por demanda y recepción con inspección de fraude.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link
            href="/compras/proveedores"
            style={{
              padding: "0.6rem 1.25rem",
              borderRadius: "6px",
              background: "#ffffff",
              color: "#374151",
              textDecoration: "none",
              fontWeight: 600,
              border: "1px solid #d1d5db",
            }}
          >
            🏢 Confiabilidad de Proveedores
          </Link>

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
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <span style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 600 }}>ÓRDENES PENDIENTES</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#d97706", marginTop: "0.25rem" }}>
            {pendientes.length}
          </div>
        </div>

        <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <span style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 600 }}>COMPRAS RECIBIDAS CONFORME</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#16a34a", marginTop: "0.25rem" }}>
            {recibidas.length}
          </div>
        </div>

        <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <span style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 600 }}>INCIDENCIAS POR FALTANTE</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: incidencias.length > 0 ? "#dc2626" : "#16a34a", marginTop: "0.25rem" }}>
            {incidencias.length}
          </div>
        </div>
      </div>

      {/* Listado de Órdenes de Compra */}
      <div style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.5rem", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#111827", fontWeight: 600 }}>
            Historial de Órdenes de Compra
          </h2>
        </div>

        {comprasList.length === 0 ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "#6b7280" }}>
            No hay órdenes de compra registradas. Haz clic en <strong>+ Nueva Orden de Compra</strong> para comenzar.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Fecha Emisión</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Proveedor</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Ítems</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Total Estimado</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Total Real</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Estado</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {comprasList.map((compra) => {
                  const esPendiente = compra.estado === "pendiente" || compra.estado === "confirmada";
                  let badgeBg = "#f3f4f6";
                  let badgeColor = "#374151";

                  if (compra.estado === "pendiente") {
                    badgeBg = "#fef3c7";
                    badgeColor = "#92400e";
                  } else if (compra.estado === "recibida") {
                    badgeBg = "#dcfce7";
                    badgeColor = "#166534";
                  } else if (compra.estado === "incidencia") {
                    badgeBg = "#fee2e2";
                    badgeColor = "#991b1b";
                  }

                  return (
                    <tr key={compra.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {new Date(compra.creado_en).toLocaleDateString()}
                        <span style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af" }}>
                          <code>{compra.id.slice(0, 8)}</code>
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <strong>{compra.proveedor.nombre}</strong>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {compra.items.length} ingrediente(s)
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        ${compra.total_estimado}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        {compra.total_real ? `$${compra.total_real}` : "—"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.25rem 0.6rem",
                            borderRadius: "9999px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            background: badgeBg,
                            color: badgeColor,
                            textTransform: "uppercase",
                          }}
                        >
                          {compra.estado === "incidencia" ? "⚠️ Incidencia" : compra.estado}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {esPendiente ? (
                          <Link
                            href={`/compras/${compra.id}/recibir`}
                            style={{
                              display: "inline-block",
                              padding: "0.4rem 0.8rem",
                              background: "#2563eb",
                              color: "#ffffff",
                              borderRadius: "4px",
                              fontWeight: 600,
                              fontSize: "0.8rem",
                              textDecoration: "none",
                            }}
                          >
                            📥 Recibir
                          </Link>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>
                            Procesada
                          </span>
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

