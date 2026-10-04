import { db } from "@/db";
import { mesas, restaurantes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { tienePermisoPlan } from "@/lib/planes";
import { generarLinkVinculacionTelegram } from "@/lib/telegram-clientes";

interface Props {
  searchParams: Promise<{ orden?: string }>;
  params: Promise<{ qrToken: string }>;
}

export default async function ConfirmacionPage({ searchParams, params }: Props) {
  const { orden } = await searchParams;
  const { qrToken } = await params;

  let telegramLink: string | null = null;

  if (orden) {
    try {
      const mesa = await db.query.mesas.findFirst({
        where: eq(mesas.qr_token, qrToken),
      });

      if (mesa) {
        const rest = await db.query.restaurantes.findFirst({
          where: eq(restaurantes.id, mesa.restaurante_id),
        });

        // Feature gating: Solo si el restaurante tiene habilitado telegram_recuperacion (Enterprise)
        if (tienePermisoPlan(rest?.plan, "telegram_recuperacion")) {
          const res = await generarLinkVinculacionTelegram({
            ordenId: orden,
            restauranteId: mesa.restaurante_id,
          });
          telegramLink = res.link;
        }
      }
    } catch (err) {
      console.error("[ConfirmacionPage] Error generando link Telegram:", err);
    }
  }

  return (
    <main style={{ maxWidth: 500, margin: "60px auto", padding: "0 1rem", textAlign: "center" }}>
      <h1>¡Pedido recibido! 🎉</h1>
      <p style={{ color: "#64748b", marginTop: "0.5rem" }}>
        Tu pedido está siendo preparado. El mesero te avisará cuando esté listo.
      </p>

      {orden && (
        <p style={{ opacity: 0.5, fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Referencia: {orden.slice(0, 8)}
        </p>
      )}

      {telegramLink && (
        <div
          style={{
            marginTop: "2rem",
            padding: "1.25rem",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            border: "1px solid #334155",
            color: "#f8fafc",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>📲</div>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem", fontWeight: 600 }}>
            Avisos de tu pedido y promociones
          </h3>
          <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "#94a3b8", lineHeight: 1.4 }}>
            Conéctate con nuestro bot en Telegram para recibir novedades de tu pedido y promociones
            exclusivas en tu próxima visita.
          </p>
          <a
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              backgroundColor: "#229ED9",
              color: "#ffffff",
              padding: "0.7rem 1.25rem",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.9rem",
              textDecoration: "none",
              boxShadow: "0 4px 12px rgba(34, 158, 217, 0.3)",
            }}
          >
            <span>Recibir avisos en Telegram</span>
            <span>➔</span>
          </a>
        </div>
      )}

      <a
        href={`/menu/${qrToken}`}
        style={{
          display: "inline-block",
          marginTop: "2.5rem",
          color: "#3b82f6",
          textDecoration: "none",
          fontSize: "0.95rem",
        }}
      >
        ← Volver al menú
      </a>
    </main>
  );
}

