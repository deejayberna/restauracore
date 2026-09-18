"use server";

import { db } from "@/db";
import { ordenItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateOrThrow, z } from "@/lib/validation";

const schema = z.object({
  item_id: z.string().uuid(),
  estado: z.enum(["en_preparacion", "listo"]),
});

export async function actualizarEstadoItem(formData: FormData) {
  const { item_id, estado } = validateOrThrow(schema, {
    item_id: formData.get("item_id"),
    estado: formData.get("estado"),
  });

  await db
    .update(ordenItems)
    .set({ estado })
    .where(eq(ordenItems.id, item_id));
}
