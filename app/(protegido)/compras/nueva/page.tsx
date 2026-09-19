import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  obtenerProveedoresRestaurante,
  obtenerSugerenciasCompra,
} from "@/lib/compras-actions";
import { NuevaCompraForm } from "@/components/compras/NuevaCompraForm";
import Link from "next/link";

export default async function NuevaCompraPage() {
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

  // Validación estricta de roles: solo 'gerente' o 'dueno'
  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restaurante_id),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo || !["gerente", "dueno"].includes(vinculo.rol)) {
    return (
      <main style={{ padding: "3rem", maxWidth: "800px", margin: "0 auto", fontFamily: "sans-serif" }}>
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            borderRadius: "8px",
            padding: "2rem",
            color: "#991b1b",
          }}
        >
          <h1 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem" }}>⛔ Acceso Denegado</h1>
          <p style={{ margin: 0, fontSize: "1rem", lineHeight: 1.5 }}>
            Hola <strong>{usuario.nombre}</strong>. La creación y gestión de órdenes de compra
            está restringida exclusivamente para personal con rol de <strong>Gerente</strong> o <strong>Dueño</strong>.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link
              href="/"
              style={{
                padding: "0.6rem 1.25rem",
                background: "#2563eb",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Volver al Inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Obtener sugerencias basadas en predicciones y proveedores disponibles
  const sugerencias = await obtenerSugerenciasCompra(restaurante_id);
  const proveedores = await obtenerProveedoresRestaurante(restaurante_id);

  return (
    <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.75rem", color: "#111827" }}>
            🛒 Nueva Orden de Compra
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem" }}>
            Sugerencias automáticas por déficit de stock y proyección de consumo a 7 días.
          </p>
        </div>

        <Link
          href="/compras"
          style={{
            padding: "0.6rem 1.25rem",
            borderRadius: "6px",
            background: "#f3f4f6",
            color: "#374151",
            textDecoration: "none",
            fontWeight: 500,
            border: "1px solid #d1d5db",
          }}
        >
          ← Volver a Compras
        </Link>
      </div>

      <NuevaCompraForm
        sugerencias={sugerencias}
        proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />
    </main>
  );
}

