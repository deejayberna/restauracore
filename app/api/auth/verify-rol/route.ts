import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarios, usuarioRestaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const ROLES_POR_RUTA: Record<string, string[]> = {
  "/dashboard": ["dueno"],
  "/inventario": ["gerente", "dueno"],
  "/compras": ["gerente", "dueno"],
  "/cocina": ["chef", "gerente", "dueno"],
  "/reportes": ["gerente", "dueno"],
  "/caja": ["cajero", "mesero", "gerente", "dueno"],
  "/personal": ["gerente", "dueno"],
  "/cancelaciones": ["gerente", "dueno"],
  "/notificaciones": ["gerente", "dueno"],
  "/auditoria": ["dueno"],
  "/home": ["mesero", "cajero", "chef", "gerente", "dueno"],
  "/perfil": ["mesero", "cajero", "chef", "gerente", "dueno"],
  "/mesas": ["mesero", "gerente", "dueno"],
};

export async function GET(request: NextRequest) {
  const restaurante_id = request.nextUrl.searchParams.get("restaurante_id");
  const ruta = request.nextUrl.searchParams.get("ruta");

  if (!restaurante_id || !ruta) {
    return NextResponse.json({ error: "Parámetros faltantes" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 401 });

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) return NextResponse.json({ error: "Sin vínculo activo" }, { status: 403 });

  const rutaBase = Object.keys(ROLES_POR_RUTA).find((r) => ruta.startsWith(r));
  const rolesPermitidos = rutaBase ? ROLES_POR_RUTA[rutaBase] : (ROLES_POR_RUTA[ruta] ?? []);
  if (!rolesPermitidos.includes(vinculo.rol)) {
    return NextResponse.json({ error: "Rol insuficiente" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, rol: vinculo.rol });
}
