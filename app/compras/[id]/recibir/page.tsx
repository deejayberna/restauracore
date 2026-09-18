import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { obtenerDetalleCompra } from "@/lib/compras-actions";
import { RecibirCompraForm } from "@/components/compras/RecibirCompraForm";
import Link from "next/link";

interface PropsPage {
  params: Promise<{ id: string }>;
}

export default async function RecibirCompraPage({ params }: PropsPage) {
  const { id } = await params;

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
            La recepción física de mercancía e inspección de compras está reservada exclusivamente
            para personal con rol de <strong>Gerente</strong> o <strong>Dueño</strong>.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link
              href="/compras"
              style={{
                padding: "0.6rem 1.25rem",
                background: "#2563eb",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Volver a Compras
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const compra = await obtenerDetalleCompra(id, restaurante_id);

  if (!compra) {
    return (
      <main style={{ padding: "3rem", maxWidth: "800px", margin: "0 auto", fontFamily: "sans-serif" }}>
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: "8px",
            padding: "2rem",
            color: "#92400e",
          }}
        >
          <h1 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem" }}>🔍 Orden No Encontrada</h1>
          <p style={{ margin: 0 }}>
            No se encontró la orden de compra solicitada o no pertenece a tu restaurante activo.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link
              href="/compras"
              style={{
                padding: "0.6rem 1.25rem",
                background: "#d97706",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Volver al Listado
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Si ya fue recibida o procesada previamente
  if (compra.estado === "recibida" || compra.estado === "incidencia") {
    return (
      <main style={{ padding: "3rem", maxWidth: "800px", margin: "0 auto", fontFamily: "sans-serif" }}>
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #3b82f6",
            borderRadius: "8px",
            padding: "2rem",
            color: "#1e40af",
          }}
        >
          <h1 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem" }}>ℹ️ Compra Ya Procesada</h1>
          <p style={{ margin: 0 }}>
            Esta orden de compra ya fue recibida anteriormente y se encuentra en estado{" "}
            <strong>{compra.estado.toUpperCase()}</strong>.
            Total real registrado: <strong>${compra.total_real}</strong>.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link
              href="/compras"
              style={{
                padding: "0.6rem 1.25rem",
                background: "#2563eb",
                color: "#ffffff",
                borderRadius: "6px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Volver a Compras
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const itemsMapeados = compra.items.map((item) => ({
    id: item.id,
    ingrediente_id: item.ingrediente_id,
    ingrediente_nombre: item.ingrediente.nombre,
    unidad_medida: item.ingrediente.unidad_medida,
    cantidad_pedida: Number(item.cantidad_pedida),
    costo_unitario_pactado: Number(item.costo_unitario_pactado),
  }));

  return (
    <main style={{ padding: "2rem", maxWidth: "1100px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.75rem", color: "#111827" }}>
            📥 Recepción de Mercancía y Control Anti-Fraude
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem" }}>
            Orden ID: <code>{compra.id}</code> — Emitida el {new Date(compra.creado_en).toLocaleDateString()}
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
          ← Cancelar
        </Link>
      </div>

      <RecibirCompraForm
        compraId={compra.id}
        proveedorNombre={compra.proveedor.nombre}
        items={itemsMapeados}
      />
    </main>
  );
}

