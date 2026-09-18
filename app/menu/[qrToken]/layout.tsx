import { db } from "@/db";
import { mesas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CarritoProvider } from "@/components/carrito/CarritoContext";
import { ResumenCarrito } from "@/components/carrito/ResumenCarrito";

interface Props {
  children: React.ReactNode;
  params: Promise<{ qrToken: string }>;
}

export default async function MenuLayout({ children, params }: Props) {
  const { qrToken } = await params;

  const mesa = await db.query.mesas.findFirst({
    where: eq(mesas.qr_token, qrToken),
  });

  if (!mesa) notFound();

  return (
    <CarritoProvider mesa_id={mesa.id} restaurante_id={mesa.restaurante_id}>
      {children}
      <ResumenCarrito />
    </CarritoProvider>
  );
}
