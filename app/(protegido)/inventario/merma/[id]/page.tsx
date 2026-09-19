import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { ingredientes, logAuditoria, movimientosInventario, restaurantes, usuarioRestaurantes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { obtenerUrlFirmadaMerma } from "@/lib/merma-actions";

interface DetalleMermaPageProps {
  params: Promise<{ id: string }>;
}

export default async function DetalleMermaPage({ params }: DetalleMermaPageProps) {
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
  const restauranteActivo = cookieStore.get("restaurante_activo")?.value;

  if (!restauranteActivo) redirect("/seleccionar-restaurante");

  // Verificar rol supervisor
  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, restauranteActivo),
      eq(usuarioRestaurantes.activo, true)
    ),
  });

  if (!vinculo || !["gerente", "dueno"].includes(vinculo.rol)) {
    redirect("/dashboard");
  }

  // Consultar el movimiento de merma garantizando aislamiento multi-tenant
  const [movimiento] = await db
    .select({
      id: movimientosInventario.id,
      ingrediente_id: movimientosInventario.ingrediente_id,
      cantidad: movimientosInventario.cantidad,
      motivo: movimientosInventario.motivo,
      foto_path: movimientosInventario.foto_path,
      creado_en: movimientosInventario.creado_en,
      ingrediente_nombre: ingredientes.nombre,
      unidad_medida: ingredientes.unidad_medida,
      costo_unitario: ingredientes.costo_unitario,
      registrado_por_nombre: usuarios.nombre,
      registrado_por_email: usuarios.email,
    })
    .from(movimientosInventario)
    .innerJoin(ingredientes, eq(ingredientes.id, movimientosInventario.ingrediente_id))
    .innerJoin(usuarios, eq(usuarios.id, movimientosInventario.creado_por))
    .where(
      and(
        eq(movimientosInventario.id, id),
        eq(movimientosInventario.tipo, "merma"),
        eq(ingredientes.restaurante_id, restauranteActivo)
      )
    )
    .limit(1);

  if (!movimiento) {
    notFound();
  }

  // Generar URL firmada bajo demanda si existe foto_path
  // La URL expira en 1 hora y NUNCA se almacena de forma permanente
  let urlFirmada: string | null = null;
  if (movimiento.foto_path) {
    urlFirmada = await obtenerUrlFirmadaMerma(movimiento.foto_path);
  }

  // Consultar registro de log_auditoria correspondiente
  const [registroAuditoria] = await db
    .select()
    .from(logAuditoria)
    .where(
      and(
        eq(logAuditoria.registro_id, movimiento.id),
        eq(logAuditoria.accion, "REGISTRO_MERMA"),
        eq(logAuditoria.restaurante_id, restauranteActivo)
      )
    )
    .limit(1);

  const cantAbs = Math.abs(parseFloat(movimiento.cantidad));
  const costoEstimado = cantAbs * parseFloat(movimiento.costo_unitario);

  return (
    <main style={{ padding: "2rem", maxWidth: "840px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/inventario/merma"
          style={{ fontSize: "0.85rem", color: "#6b7280", textDecoration: "none", marginBottom: "0.5rem", display: "inline-block" }}
        >
          ← Volver a Registro de Mermas
        </Link>
        <h1 style={{ fontSize: "1.75rem", margin: "0.25rem 0" }}>Detalle de Merma de Inventario</h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>
          ID de Registro: <code style={{ background: "#f3f4f6", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>{movimiento.id}</code>
        </p>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          marginBottom: "2rem",
        }}
      >
        <div style={{ padding: "1.5rem", borderBottom: "1px solid #e5e7eb" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.25rem", color: "#111827" }}>
            Información del Incidente
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              fontSize: "0.95rem",
            }}
          >
            <div>
              <span style={{ color: "#6b7280", display: "block" }}>Ingrediente</span>
              <strong style={{ fontSize: "1.1rem" }}>{movimiento.ingrediente_nombre}</strong>
            </div>

            <div>
              <span style={{ color: "#6b7280", display: "block" }}>Cantidad Mermada</span>
              <strong style={{ fontSize: "1.1rem", color: "#dc2626" }}>
                -{cantAbs} {movimiento.unidad_medida}
              </strong>
            </div>

            <div>
              <span style={{ color: "#6b7280", display: "block" }}>Impacto Económico Estimado</span>
              <strong style={{ fontSize: "1.1rem", color: "#b45309" }}>
                ${costoEstimado.toFixed(2)} MXN
              </strong>
            </div>

            <div>
              <span style={{ color: "#6b7280", display: "block" }}>Fecha de Registro</span>
              <strong>
                {new Date(movimiento.creado_en).toLocaleString("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </strong>
            </div>

            <div>
              <span style={{ color: "#6b7280", display: "block" }}>Registrado Por</span>
              <strong>
                {movimiento.registrado_por_nombre} ({movimiento.registrado_por_email})
              </strong>
            </div>
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <span style={{ color: "#6b7280", display: "block", marginBottom: "0.25rem" }}>Motivo Reportado</span>
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "#f9fafb",
                borderRadius: "6px",
                border: "1px solid #e5e7eb",
                color: "#1f2937",
              }}
            >
              {movimiento.motivo}
            </div>
          </div>
        </div>

        {/* Evidencia Fotográfica */}
        <div style={{ padding: "1.5rem", borderBottom: "1px solid #e5e7eb" }}>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Evidencia Fotográfica</h3>

          {movimiento.foto_path ? (
            <div>
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  color: "#166534",
                }}
              >
                🔒 <strong>Acceso Seguro y Temporal:</strong> La URL para visualizar esta evidencia ha sido generada bajo demanda con expiración de 1 hora. La base de datos almacena exclusivamente el path interno inmutable:
                <div style={{ marginTop: "0.25rem", fontFamily: "monospace" }}>
                  {movimiento.foto_path}
                </div>
              </div>

              {urlFirmada ? (
                <div style={{ textAlign: "center", marginTop: "1rem" }}>
                  <img
                    src={urlFirmada}
                    alt="Evidencia fotográfica de la merma"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "480px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                      display: "inline-block",
                    }}
                  />
                  <div style={{ marginTop: "0.5rem" }}>
                    <a
                      href={urlFirmada}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.85rem", color: "#2563eb", textDecoration: "underline" }}
                    >
                      Abrir imagen en pestaña nueva ↗
                    </a>
                  </div>
                </div>
              ) : (
                <p style={{ color: "#dc2626" }}>
                  No se pudo generar el enlace temporal para visualizar la imagen. Verifica que el archivo exista en Storage.
                </p>
              )}
            </div>
          ) : (
            <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0 }}>
              Esta merma fue registrada sin evidencia fotográfica adjunta.
            </p>
          )}
        </div>

        {/* Auditoría Inmutable */}
        {registroAuditoria && (
          <div style={{ padding: "1.5rem", background: "#f9fafb" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", color: "#374151" }}>
              Bitácora de Auditoría Inmutable
            </h3>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              <p style={{ margin: "0.25rem 0" }}>
                Evento: <code>{registroAuditoria.accion}</code> | Asentado el:{" "}
                {new Date(registroAuditoria.creado_en).toLocaleString("es-MX")}
              </p>
              <pre
                style={{
                  background: "#1e293b",
                  color: "#f8fafc",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  overflowX: "auto",
                  fontSize: "0.8rem",
                  marginTop: "0.5rem",
                }}
              >
                {JSON.stringify(
                  {
                    valores_anteriores: registroAuditoria.valores_anteriores,
                    valores_nuevos: registroAuditoria.valores_nuevos,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

