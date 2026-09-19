"use server";

import { db } from "@/db";
import { ordenes, ordenItems, platillos, mesas, restaurantes, pagos, usuarios, usuarioRestaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";

export interface ItemRecibo {
  platillo: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  notas?: string | null;
}

export interface PagoRecibo {
  metodo: string;
  monto: number;
  propina: number;
}

export interface DatosRecibo {
  folio: string;
  fecha: string;
  restaurante: {
    nombre: string;
    direccion?: string | null;
  };
  mesa: string;
  items: ItemRecibo[];
  subtotal: number;
  propinaTotal: number;
  propinaPorMetodo: Record<string, number>;
  total: number;
  pagos: PagoRecibo[];
}

export async function obtenerDatosReciboAction(ordenId: string): Promise<DatosRecibo> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError("Sesión no iniciada");

  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;
  if (!restaurante_id) throw new UnauthorizedError("Restaurante activo no seleccionado");

  // Obtener orden
  const [orden] = await db
    .select()
    .from(ordenes)
    .where(and(eq(ordenes.id, ordenId), eq(ordenes.restaurante_id, restaurante_id)));

  if (!orden) {
    throw new Error("Orden no encontrada.");
  }

  // Obtener datos del restaurante
  const [rest] = await db
    .select()
    .from(restaurantes)
    .where(eq(restaurantes.id, restaurante_id));

  // Obtener mesa
  let identificadorMesa = "Mesa";
  if (orden.mesa_id) {
    const [mesa] = await db
      .select()
      .from(mesas)
      .where(eq(mesas.id, orden.mesa_id));
    if (mesa) {
      identificadorMesa = `Mesa ${mesa.numero}`;
    }
  }

  // Obtener platillos / items
  const itemsRows = await db
    .select({
      cantidad: ordenItems.cantidad,
      precioUnitario: ordenItems.precio_unitario_congelado,
      notas: ordenItems.notas,
      platilloNombre: platillos.nombre,
    })
    .from(ordenItems)
    .leftJoin(platillos, eq(ordenItems.platillo_id, platillos.id))
    .where(eq(ordenItems.orden_id, orden.id));


  const items: ItemRecibo[] = itemsRows.map((it) => {
    const pu = parseFloat(it.precioUnitario);
    return {
      platillo: it.platilloNombre ?? "Platillo",
      cantidad: it.cantidad,
      precioUnitario: pu,
      total: Math.round(pu * it.cantidad * 100) / 100,
      notas: it.notas,
    };
  });

  // Obtener pagos registrados
  const pagosRows = await db
    .select()
    .from(pagos)
    .where(eq(pagos.orden_id, orden.id));

  let propinaTotal = 0;
  const propinaPorMetodo: Record<string, number> = {};
  const listaPagos: PagoRecibo[] = pagosRows.map((p) => {
    const monto = parseFloat(p.monto);
    const propina = parseFloat(p.propina_monto || "0");
    propinaTotal += propina;
    propinaPorMetodo[p.metodo_pago] = (propinaPorMetodo[p.metodo_pago] || 0) + propina;
    return {
      metodo: p.metodo_pago,
      monto,
      propina,
    };
  });

  const subtotal = parseFloat(orden.total);
  const total = Math.round((subtotal + propinaTotal) * 100) / 100;

  const fechaFormateada = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(orden.creado_en ? new Date(orden.creado_en) : new Date());

  return {
    folio: `ORD-${orden.id.slice(0, 8).toUpperCase()}`,
    fecha: fechaFormateada,
    restaurante: {
      nombre: rest?.nombre ?? "RestauraCore",
      direccion: rest?.direccion,
    },
    mesa: identificadorMesa,
    items,
    subtotal,
    propinaTotal: Math.round(propinaTotal * 100) / 100,
    propinaPorMetodo,
    total,
    pagos: listaPagos,
  };
}

