export default function MenuNotFound() {
  return (
    <main style={{ maxWidth: 400, margin: "100px auto", padding: "0 1rem", textAlign: "center" }}>
      <h1>Mesa no encontrada</h1>
      <p>El código QR no es válido o este restaurante no está disponible.</p>
      <p style={{ opacity: 0.6, fontSize: "0.9rem" }}>
        Pide al mesero que te proporcione un código QR válido.
      </p>
    </main>
  );
}
