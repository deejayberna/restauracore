import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ordenItems, ordenes, platillos, mesas, usuarios, usuarioRestaurantes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Validar autenticación con Supabase
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión no iniciada" }, { status: 401 });
  }

  // 2. Resolver usuario en BD
  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) {
    return NextResponse.json({ error: "Usuario no registrado" }, { status: 401 });
  }

  // 3. Obtener restaurante activo desde la cookie
  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) {
    return NextResponse.json({ error: "Restaurante no seleccionado" }, { status: 401 });
  }

  // 4. Validar vínculo activo con el restaurante
  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo) {
    return NextResponse.json({ error: "No autorizado para este restaurante" }, { status: 403 });
  }

  const { id } = await params;

  // 5. Consultar item verificando pertenencia estricta al restaurante activo
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
    .where(and(eq(ordenItems.id, id), eq(ordenes.restaurante_id, restaurante_id)))
    .limit(1);

  if (!row) return NextResponse.json(null, { status: 404 });

  return NextResponse.json(row);
}

