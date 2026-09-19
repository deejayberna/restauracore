import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getItemsKDS } from "@/lib/kds-queries";
import { TableroKDS } from "@/components/kds/TableroKDS";

export default async function CocinaPage() {
  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) redirect("/seleccionar-restaurante");

  const items = await getItemsKDS(restaurante_id);

  return (
    <main>
      <div style={{ padding: "1rem", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Cocina</h1>
        <span style={{ opacity: 0.5, fontSize: "0.9rem", alignSelf: "center" }}>
          Actualizaciones en tiempo real
        </span>
      </div>
      <TableroKDS itemsIniciales={items} restaurante_id={restaurante_id} />
    </main>
  );
}
