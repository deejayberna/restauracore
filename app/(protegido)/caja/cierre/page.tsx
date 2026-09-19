import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { logAuditoria, restaurantes, usuarioRestaurantes, usuarios } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  obtenerResumenCajaSistema,
  obtenerOCrearTurnoActivo,
} from "@/lib/caja-actions";
import { FormularioCierre } from "@/components/caja/FormularioCierre";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CierreCajaPage({ searchParams }: PageProps) {
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

  // Validar rol en usuario_restaurantes para el restaurante activo
  const vinculo = await db
    .select({
      rol: usuarioRestaurantes.rol,
      nombreRestaurante: restaurantes.nombre,
    })
    .from(usuarioRestaurantes)
    .innerJoin(restaurantes, eq(restaurantes.id, usuarioRestaurantes.restaurante_id))
    .where(
      and(
        eq(usuarioRestaurantes.usuario_id, usuario.id),
        eq(usuarioRestaurantes.restaurante_id, restauranteActivo),
        eq(usuarioRestaurantes.activo, true)
      )
    )
    .limit(1);

  if (!vinculo[0] || !["cajero", "mesero", "gerente", "dueno"].includes(vinculo[0].rol)) {
    redirect("/home?error=sin-permiso");
  }

  const rol = vinculo[0].rol as "cajero" | "mesero" | "gerente" | "dueno";
  const resolvedParams = await searchParams;

  // Identificador de turno por defecto: turno del día actual
  const hoyStr = new Date().toISOString().slice(0, 10);
  const turnoId =
    typeof resolvedParams.turno === "string" && resolvedParams.turno.length > 0
      ? resolvedParams.turno
      : `turno_${hoyStr}`;

  // 1. Estado del turno (abierto/cerrado) gestionado en la tabla 'turnos'
  const turnoInfo = await obtenerOCrearTurnoActivo(restauranteActivo, usuario.id, turnoId);

  // 2. Monto acumulado por el sistema para órdenes con estado 'pagado'
  const sistema = await obtenerResumenCajaSistema(restauranteActivo);

  // 3. Historial reciente de auditoría de caja (para gerentes y dueños)
  const esSupervisor = ["gerente", "dueno"].includes(rol);
  let historialAuditoria: any[] = [];

  if (esSupervisor) {
    historialAuditoria = await db
      .select({
        id: logAuditoria.id,
        accion: logAuditoria.accion,
        registro_id: logAuditoria.registro_id,
        valores_anteriores: logAuditoria.valores_anteriores,
        valores_nuevos: logAuditoria.valores_nuevos,
        creado_en: logAuditoria.creado_en,
      })
      .from(logAuditoria)
      .where(
        and(
          eq(logAuditoria.restaurante_id, restauranteActivo),
          eq(logAuditoria.tabla_afectada, "caja")
        )
      )
      .orderBy(desc(logAuditoria.creado_en))
      .limit(10);
  }

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Navegación */}
      <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link href="/dashboard" style={linkNav}>
          ← Volver al Dashboard
        </Link>
        <span style={{ color: "#aaa" }}>|</span>
        <Link href="/reportes/rentabilidad" style={linkNav}>
          💰 Rentabilidad
        </Link>
        <span style={{ color: "#aaa" }}>|</span>
        <Link href="/reportes/menu-engineering" style={linkNav}>
          ⭐ Menu Engineering
        </Link>
      </nav>

      {/* Encabezado */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: "1.25rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 700, margin: 0, color: "#111827" }}>
            Arqueo de Caja y Cierre de Turno
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#6b7280", fontSize: "0.95rem" }}>
            {vinculo[0].nombreRestaurante} • Identificador de turno: <strong>{turnoId}</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "999px",
              fontSize: "0.85rem",
              fontWeight: 700,
              background: turnoInfo.estado === "cerrado" ? "#fee2e2" : "#dcfce7",
              color: turnoInfo.estado === "cerrado" ? "#991b1b" : "#166534",
            }}
          >
            {turnoInfo.estado === "cerrado" ? "🔒 TURNO CERRADO" : "🟢 TURNO ABIERTO"}
          </span>
        </div>
      </header>

      {/* Formulario con segregación de roles y doble cierre */}
      <FormularioCierre
        rol={rol}
        usuarioNombre={usuario.nombre}
        usuarioId={usuario.id}
        turnoInfo={turnoInfo}
        sistema={sistema}
      />

      {/* Bitácora de Auditoría Reciente de Cortes (Solo visible para Gerente o Dueño) */}
      {esSupervisor && (
        <section style={{ marginTop: "3rem", borderTop: "1px solid #e5e7eb", paddingTop: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#1f2937" }}>
                Bitácora Inmutable de Auditoría de Caja (Últimos 10 eventos)
              </h2>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280" }}>
                Registro append-only protegido por políticas RLS. Todo cierre genera un asiento con desglose detallado.
              </p>
            </div>
          </div>

          {historialAuditoria.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", background: "#f9fafb", borderRadius: "8px", color: "#6b7280" }}>
              No hay cierres de caja registrados aún para este restaurante.
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={th}>Fecha y Hora</th>
                    <th style={th}>Turno</th>
                    <th style={th}>Acción Auditada</th>
                    <th style={th}>Desglose Sistema</th>
                    <th style={th}>Desglose Físico</th>
                    <th style={{ ...th, textAlign: "right" }}>Diferencia Total</th>
                  </tr>
                </thead>
                <tbody>
                  {historialAuditoria.map((log) => {
                    const esDiscrepancia = log.accion === "DISCREPANCIA_ARQUEO_CAJA";
                    const esDobleCierre = log.accion === "ANOMALIA_INTENTO_DOBLE_CIERRE_CAJA";
                    const esCaptura = log.accion === "CAPTURA_CONTEO_FISICO";

                    const sis = log.valores_anteriores?.sistema;
                    const fis = log.valores_nuevos?.fisico;
                    const difTotal = log.valores_nuevos?.diferencias?.total;

                    return (
                      <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={td}>
                          {new Date(log.creado_en).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={td}>
                          <code>{log.registro_id}</code>
                        </td>
                        <td style={td}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              background: esDobleCierre
                                ? "#fee2e2"
                                : esDiscrepancia
                                ? "#fef3c7"
                                : esCaptura
                                ? "#e0e7ff"
                                : "#dcfce7",
                              color: esDobleCierre
                                ? "#991b1b"
                                : esDiscrepancia
                                ? "#92400e"
                                : esCaptura
                                ? "#3730a3"
                                : "#166534",
                            }}
                          >
                            {log.accion}
                          </span>
                        </td>
                        <td style={td}>
                          {sis ? (
                            <span>
                              Ef: ${sis.efectivo} | Tar: ${sis.tarjeta} | Trans: ${sis.transferencia} (Total: ${sis.total})
                            </span>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>—</span>
                          )}
                        </td>
                        <td style={td}>
                          {fis ? (
                            <span>
                              Ef: ${fis.efectivo} | Tar: ${fis.tarjeta} | Trans: ${fis.transferencia} (Total: ${fis.total})
                            </span>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            ...td,
                            textAlign: "right",
                            fontWeight: 700,
                            color:
                              difTotal !== undefined && Math.abs(difTotal) >= 0.01
                                ? difTotal < 0
                                  ? "#dc2626"
                                  : "#2563eb"
                                : "#166534",
                          }}
                        >
                          {difTotal !== undefined ? (
                            `${difTotal > 0 ? "+" : ""}$${difTotal.toFixed(2)}`
                          ) : (
                            <span style={{ color: "#9ca3af" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

const th: React.CSSProperties = {
  padding: "0.75rem 1rem",
  fontWeight: 700,
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.025em",
  color: "#4b5563",
};

const td: React.CSSProperties = {
  padding: "0.75rem 1rem",
  verticalAlign: "middle",
};

const linkNav: React.CSSProperties = {
  color: "#2563eb",
  fontWeight: 600,
  textDecoration: "none",
};

