import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, logAuditoria } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { ruta, restaurante_id, ip } = await request.json();

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: true }); // silencioso

    const usuario = await db.query.usuarios.findFirst({
      where: eq(usuarios.auth_id, user.id),
    });

    if (!usuario || !restaurante_id) return NextResponse.json({ ok: true });

    await db.insert(logAuditoria).values({
      restaurante_id,
      usuario_id: usuario.id,
      accion: "ACCESO_DENEGADO",
      tabla_afectada: "rutas",
      registro_id: ruta,
      ip_origen: ip ?? null,
    });
  } catch {
    // No fallar si el log falla — es secundario
  }

  return NextResponse.json({ ok: true });
}
