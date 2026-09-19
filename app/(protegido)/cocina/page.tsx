import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getItemsKDS } from "@/lib/kds-queries";
import { TableroKDS } from "@/components/kds/TableroKDS";
import { db } from "@/db";
import { restaurantes } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function CocinaPage() {
  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) redirect("/seleccionar-restaurante");

  const [items, rest] = await Promise.all([
    getItemsKDS(restaurante_id),
    db.query.restaurantes.findFirst({
      where: eq(restaurantes.id, restaurante_id),
      columns: { nombre: true },
    }),
  ]);

  return (
    <main>
      <div style={{ padding: "1rem", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Cocina</h1>
        <span style={{ opacity: 0.5, fontSize: "0.9rem", alignSelf: "center" }}>
          Actualizaciones en tiempo real
        </span>
      </div>
      <TableroKDS
        itemsIniciales={items}
        restaurante_id={restaurante_id}
        restauranteNombre={rest?.nombre ?? "Cocina"}
      />
    </main>
  );
}
