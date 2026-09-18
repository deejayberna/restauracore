import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ingredientes, prediccionesDemanda } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export default async function InventarioPage() {
  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;
  if (!restaurante_id) redirect("/seleccionar-restaurante");

  const ings = await db.query.ingredientes.findMany({
    where: eq(ingredientes.restaurante_id, restaurante_id),
    orderBy: (i, { asc }) => [asc(i.nombre)],
  });

  // Consumo estimado próximos 7 días — suma de predicciones por ingrediente
  const hoy = new Date();
  const en7Dias = new Date(hoy);
  en7Dias.setDate(en7Dias.getDate() + 7);

  const predicciones = await db
    .select({
      ingrediente_id: prediccionesDemanda.ingrediente_id,
      total_estimado: sql<number>`SUM(${prediccionesDemanda.cantidad_estimada})`,
    })
    .from(prediccionesDemanda)
    .where(
      and(
        gte(prediccionesDemanda.fecha, hoy),
        lte(prediccionesDemanda.fecha, en7Dias)
      )
    )
    .groupBy(prediccionesDemanda.ingrediente_id);

  const prediccionMap = new Map(predicciones.map((p) => [p.ingrediente_id, p.total_estimado]));

  return (
    <main style={{ padding: "1.5rem" }}>
      <h1>Inventario</h1>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
          <thead>
            <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
              <th style={th}>Ingrediente</th>
              <th style={th}>Stock actual</th>
              <th style={th}>Stock mínimo</th>
              <th style={th}>Costo unitario</th>
              <th style={th}>Consumo estimado (7 días)</th>
              <th style={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ings.map((ing) => {
              const stockActual = Number(ing.stock_actual);
              const stockMinimo = Number(ing.stock_minimo);
              const estimado = prediccionMap.get(ing.id);
              const bajo = stockActual <= stockMinimo;
              const critico = stockActual <= stockMinimo * 0.25;

              return (
                <tr key={ing.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}><strong>{ing.nombre}</strong></td>
                  <td style={td}>{ing.unidad_medida}</td>
                  <td style={{ ...td, color: critico ? "#dc2626" : bajo ? "#d97706" : "#16a34a", fontWeight: 600 }}>
                    {formatCantidad(stockActual, ing.unidad_medida)}
                  </td>
                  <td style={td}>{formatCantidad(stockMinimo, ing.unidad_medida)}</td>
                  <td style={td}>${Number(ing.costo_unitario).toFixed(4)}</td>
                  <td style={td}>
                    {estimado != null
                      ? <span style={{ color: "#2563eb", fontWeight: 600 }}>{formatCantidad(Number(estimado), ing.unidad_medida)}</span>
                      : <span style={{ opacity: 0.4 }}>Sin datos</span>}
                  </td>
                  <td style={td}>
                    {critico
                      ? <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "4px", fontSize: "0.8rem" }}>🚨 Crítico</span>
                      : bajo
                      ? <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "4px", fontSize: "0.8rem" }}>⚠️ Bajo</span>
                      : <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "4px", fontSize: "0.8rem" }}>✓ OK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function formatCantidad(cantidad: number, unidad: string): string {
  if (unidad === "pieza") return `${Math.round(cantidad)} pzs`;
  if (unidad === "g" || unidad === "ml") return `${Math.round(cantidad)} ${unidad}`;
  return `${cantidad.toFixed(2)} ${unidad}`;
}

const th: React.CSSProperties = { padding: "0.75rem 1rem", fontWeight: 700, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "0.65rem 1rem" };
