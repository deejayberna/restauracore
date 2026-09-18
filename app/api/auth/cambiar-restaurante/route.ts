import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { restaurante_id } = await request.json();
    if (!restaurante_id) {
      return NextResponse.json({ error: "Falta restaurante_id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const usuario = await db.query.usuarios.findFirst({
      where: eq(usuarios.auth_id, user.id),
    });

    if (!usuario) {
      return NextResponse.json({ error: "Usuario no registrado" }, { status: 401 });
    }

    const vinculo = await db.query.usuarioRestaurantes.findFirst({
      where: and(
        eq(usuarioRestaurantes.usuario_id, usuario.id),
        eq(usuarioRestaurantes.restaurante_id, restaurante_id),
        eq(usuarioRestaurantes.activo, true)
      ),
    });

    if (!vinculo) {
      return NextResponse.json({ error: "Sin acceso a esta sucursal" }, { status: 403 });
    }

    const cookieStore = await cookies();
    cookieStore.set("restaurante_activo", restaurante_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

