import { getProtectedLayoutData } from "@/lib/layout-queries";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ticketsSoporte, restaurantes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { SoporteView, type TicketSoporteItem } from "@/components/soporte/SoporteView";

export default async function SoportePage() {
  const { user, currentBranchId } = await getProtectedLayoutData();

  if (!["gerente", "dueno"].includes(user.rol)) {
    redirect("/home");
  }

  const [ticketsDb, rest] = await Promise.all([
    db
      .select()
      .from(ticketsSoporte)
      .where(eq(ticketsSoporte.restaurante_id, currentBranchId))
      .orderBy(desc(ticketsSoporte.creado_en)),
    db.query.restaurantes.findFirst({
      where: eq(restaurantes.id, currentBranchId),
      columns: { nombre: true },
    }),
  ]);

  const ticketsIniciales: TicketSoporteItem[] = ticketsDb.map((t) => ({
    id: t.id,
    asunto: t.asunto,
    mensaje: t.mensaje,
    estado: t.estado,
    respuesta: t.respuesta,
    creado_en: t.creado_en,
    respondido_en: t.respondido_en,
  }));

  return (
    <SoporteView
      ticketsIniciales={ticketsIniciales}
      restauranteNombre={rest?.nombre ?? "Restaurante"}
    />
  );
}

