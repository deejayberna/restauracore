interface Props {
  searchParams: Promise<{ orden?: string }>;
  params: Promise<{ qrToken: string }>;
}

export default async function ConfirmacionPage({ searchParams, params }: Props) {
  const { orden } = await searchParams;
  const { qrToken } = await params;

  return (
    <main style={{ maxWidth: 500, margin: "100px auto", padding: "0 1rem", textAlign: "center" }}>
      <h1>¡Pedido recibido! 🎉</h1>
      <p>Tu pedido está siendo preparado. El mesero te avisará cuando esté listo.</p>
      {orden && (
        <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>Referencia: {orden.slice(0, 8)}</p>
      )}
      <a href={`/menu/${qrToken}`} style={{ display: "inline-block", marginTop: "2rem" }}>
        ← Volver al menú
      </a>
    </main>
  );
}
