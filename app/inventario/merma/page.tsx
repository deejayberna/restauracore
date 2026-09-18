import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { ingredientes, movimientosInventario, restaurantes, usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FormularioMerma } from "@/components/inventario/FormularioMerma";

export default async function MermaPage() {
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

  // Verificar rol supervisor (solo 'gerente' o 'dueno')
  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restauranteActivo),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo || !["gerente", "dueno"].includes(vinculo.rol)) {
    return (
      <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
        <div
          style={{
            padding: "1.5rem",
            background: "#fef2f2",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            color: "#991b1b",
          }}
        >
          <h2>Acceso No Autorizado</h2>
          <p>
            El registro de mermas e inventario está reservado exclusivamente para los roles{" "}
            <strong>Gerente</strong> o <strong>Dueño</strong>.
          </p>
          <Link href="/dashboard" style={{ color: "#2563eb", textDecoration: "underline" }}>
            ← Volver al Dashboard
          </Link>
        </div>
      </main>
    );
  }

  // Obtener datos del restaurante
  const restaurante = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restauranteActivo),
  });

  // Consultar catálogo de ingredientes del restaurante
  const listaIngredientes = await db.query.ingredientes.findMany({
    where: eq(ingredientes.restaurante_id, restauranteActivo),
    orderBy: (ing, { asc }) => [asc(ing.nombre)],
  });

  // Consultar últimas 10 mermas registradas
  const mermasRecientes = await db
    .select({
      id: movimientosInventario.id,
      cantidad: movimientosInventario.cantidad,
      motivo: movimientosInventario.motivo,
      foto_path: movimientosInventario.foto_path,
      creado_en: movimientosInventario.creado_en,
      ingrediente_nombre: ingredientes.nombre,
      unidad_medida: ingredientes.unidad_medida,
      creado_por_nombre: usuarios.nombre,
    })
    .from(movimientosInventario)
    .innerJoin(ingredientes, eq(ingredientes.id, movimientosInventario.ingrediente_id))
    .innerJoin(usuarios, eq(usuarios.id, movimientosInventario.creado_por))
    .where(
      and(
        eq(ingredientes.restaurante_id, restauranteActivo),
        eq(movimientosInventario.tipo, "merma")
      )
    )
    .orderBy(desc(movimientosInventario.creado_en))
    .limit(10);

  return (
    <main style={{ padding: "2rem", maxWidth: "960px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <Link
            href="/dashboard"
            style={{ fontSize: "0.85rem", color: "#6b7280", textDecoration: "none", marginBottom: "0.5rem", display: "inline-block" }}
          >
            ← Volver al Dashboard
          </Link>
          <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Registro de Mermas con Evidencia</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280" }}>
            Restaurante: <strong>{restaurante?.nombre}</strong> | Supervisor: <strong>{usuario.nombre}</strong> ({vinculo.rol})
          </p>
        </div>
      </div>

      {/* Formulario de Registro */}
      <FormularioMerma
        ingredientes={listaIngredientes.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          unidad_medida: i.unidad_medida,
          stock_actual: i.stock_actual,
          stock_minimo: i.stock_minimo,
          costo_unitario: i.costo_unitario,
        }))}
      />

      {/* Historial de Mermas Recientes */}
      <section style={{ marginTop: "3rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem", color: "#374151" }}>
          Mermas Registradas Recientemente
        </h2>

        {mermasRecientes.length === 0 ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
            No hay registros de mermas recientes en este restaurante.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "#ffffff",
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                fontSize: "0.9rem",
              }}
            >
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Fecha / Hora</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Ingrediente</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Cantidad</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Motivo</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Registrado Por</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Evidencia</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {mermasRecientes.map((m) => {
                  const cantNum = Math.abs(parseFloat(m.cantidad));
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.75rem 1rem", color: "#6b7280" }}>
                        {new Date(m.creado_en).toLocaleString("es-MX", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{m.ingrediente_nombre}</td>
                      <td style={{ padding: "0.75rem 1rem", color: "#dc2626", fontWeight: 600 }}>
                        -{cantNum} {m.unidad_medida}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#374151" }}>{m.motivo ?? "—"}</td>
                      <td style={{ padding: "0.75rem 1rem", color: "#6b7280" }}>{m.creado_por_nombre}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {m.foto_path ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              background: "#ecfdf5",
                              color: "#065f46",
                              fontSize: "0.8rem",
                              fontWeight: 500,
                            }}
                          >
                            📷 Foto adjunta
                          </span>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>Sin foto</span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <Link
                          href={`/inventario/merma/${m.id}`}
                          style={{
                            color: "#2563eb",
                            textDecoration: "none",
                            fontWeight: 500,
                            fontSize: "0.85rem",
                          }}
                        >
                          Ver detalle →
                        </Link>
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

