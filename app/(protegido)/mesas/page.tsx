import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { asignacionesMesa, mesas, restaurantes, usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { AdministracionMesas } from "@/components/mesas/AdministracionMesas";

export default async function MesasPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, user.id),
  });

  if (!usuario) redirect("/login");

  const cookieStore = await cookies();
  const restaurante_id = cookieStore.get("restaurante_activo")?.value;

  if (!restaurante_id) redirect("/seleccionar-restaurante");

  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo || !["gerente", "dueno"].includes(vinculo.rol)) {
    return (
      <main style={{ padding: "3rem", maxWidth: "600px", margin: "0 auto", fontFamily: "sans-serif" }}>
        <div style={{ background: "#fee2e2", border: "1px solid #f87171", borderRadius: "8px", padding: "1.5rem", color: "#991b1b" }}>
          <h2>Acceso Restringido</h2>
          <p>Solo personal con rol de Gerente o Dueño puede administrar los códigos QR de las mesas.</p>
        </div>
      </main>
    );
  }

  const restauranteDb = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.id, restaurante_id),
  });

  const mesasDb = await db.query.mesas.findMany({
    where: eq(mesas.restaurante_id, restaurante_id),
    orderBy: (mesas, { asc }) => [asc(mesas.numero)],
  });

  const hoyStr = new Date().toISOString().slice(0, 10);
  const asignacionesActivas = await db
    .select({
      mesa_id: asignacionesMesa.mesa_id,
      mesero_nombre: usuarios.nombre,
    })
    .from(asignacionesMesa)
    .innerJoin(usuarios, eq(asignacionesMesa.mesero_id, usuarios.id))
    .where(
      and(
        eq(asignacionesMesa.restaurante_id, restaurante_id),
        eq(asignacionesMesa.fecha, hoyStr)
      )
    );

  const asignacionesMap = new Map<string, string>();
  for (const asig of asignacionesActivas) {
    asignacionesMap.set(asig.mesa_id, asig.mesero_nombre);
  }

  const mesasInfo = mesasDb.map((m) => ({
    id: m.id,
    numero: m.numero,
    qr_token: m.qr_token,
    mesero_asignado: asignacionesMap.get(m.id) ?? null,
  }));

  return (
    <AdministracionMesas
      mesasIniciales={mesasInfo}
      restauranteNombre={restauranteDb?.nombre ?? "Restaurante"}
    />
  );
}

