import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ordenItems, ordenes, platillos, mesas } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [row] = await db
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
    .where(eq(ordenItems.id, id))
    .limit(1);

  if (!row) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(row);
}
