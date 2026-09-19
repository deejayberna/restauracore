import { db } from "@/db";
import { mesas, restaurantes, categoriasMenu, platillos } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { validateOrThrow, z } from "@/lib/validation";
import { BotonAgregar } from "@/components/carrito/BotonAgregar";
import { ResumenCarrito } from "@/components/carrito/ResumenCarrito";

const qrTokenSchema = z.object({
  qrToken: z.string().min(1).max(100),
});

interface Props {
  params: Promise<{ qrToken: string }>;
}

export default async function MenuPage({ params }: Props) {
  const { qrToken } = await params;

  const { qrToken: tokenValidado } = validateOrThrow(qrTokenSchema, { qrToken });

  const mesa = await db.query.mesas.findFirst({
    where: eq(mesas.qr_token, tokenValidado),
  });

  if (!mesa) notFound();

  const restaurante = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, mesa.restaurante_id),
  });

  if (!restaurante) notFound();

  const categorias = await db.query.categoriasMenu.findMany({
    where: and(
      eq(categoriasMenu.restaurante_id, restaurante.id),
      eq(categoriasMenu.activo, true)
    ),
    orderBy: (cat, { asc }) => [asc(cat.orden)],
  });

  const platillosDisponibles = await db.query.platillos.findMany({
    where: and(
      eq(platillos.restaurante_id, restaurante.id),
      eq(platillos.disponible, true)
    ),
  });

  const menuPorCategoria = categorias.map((cat) => ({
    ...cat,
    platillos: platillosDisponibles.filter((p) => p.categoria_id === cat.id),
  }));

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "1rem 1rem 6rem" }}>
        <h1>{restaurante.nombre}</h1>
        <p style={{ opacity: 0.6 }}>Mesa {mesa.numero}</p>

        {menuPorCategoria.map((cat) =>
          cat.platillos.length === 0 ? null : (
            <section key={cat.id} style={{ marginBottom: "2rem" }}>
              <h2 style={{ borderBottom: "1px solid #eee", paddingBottom: "0.5rem" }}>
                {cat.nombre}
              </h2>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {cat.platillos.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 0",
                      borderBottom: "1px solid #f5f5f5",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>{p.nombre}</strong>
                      {p.descripcion && (
                        <p style={{ margin: "0.25rem 0 0", opacity: 0.6, fontSize: "0.9rem" }}>
                          {p.descripcion}
                        </p>
                      )}
                      {p.tiempo_prep_minutos && (
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", opacity: 0.5 }}>
                          ~{p.tiempo_prep_minutos} min
                        </p>
                      )}
                      <strong style={{ display: "block", marginTop: "0.25rem" }}>
                        ${Number(p.precio).toFixed(2)}
                      </strong>
                    </div>
                    <BotonAgregar
                      platillo_id={p.id}
                      nombre={p.nombre}
                      precio={Number(p.precio)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
        )}
    </main>
  );
}
