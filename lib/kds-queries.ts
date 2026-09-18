import { db } from "@/db";
import { ordenItems, ordenes, platillos, mesas } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";

export type EstadoKDS = "pendiente" | "en_preparacion" | "listo";

export interface ItemKDS {
  id: string;
  orden_id: string;
  platillo_nombre: string;
  cantidad: number;
  notas: string | null;
  estado: EstadoKDS;
  mesa_numero: number;
  creado_en: Date;
}

export async function getItemsKDS(restaurante_id: string): Promise<ItemKDS[]> {
  const rows = await db
    .select({
      id: ordenItems.id,
      orden_id: ordenItems.orden_id,
      platillo_nombre: platillos.nombre,
      cantidad: ordenItems.cantidad,
      notas: ordenItems.notas,
      estado: ordenItems.estado,
      mesa_numero: mesas.numero,
      creado_en: ordenes.creado_en,
    })
    .from(ordenItems)
    .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
    .innerJoin(platillos, eq(platillos.id, ordenItems.platillo_id))
    .innerJoin(mesas, eq(mesas.id, ordenes.mesa_id))
    .where(
      and(
        eq(ordenes.restaurante_id, restaurante_id),
        inArray(ordenItems.estado, ["pendiente", "en_preparacion", "listo"])
      )
    );

  return rows.map((r) => ({
    ...r,
    estado: r.estado as EstadoKDS,
    mesa_numero: r.mesa_numero,
  }));
}
