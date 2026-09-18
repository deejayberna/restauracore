import { getVinculosUsuario, seleccionarRestauranteAction } from "@/lib/restaurante-actions";

export default async function SeleccionarRestaurantePage() {
  const vinculos = await getVinculosUsuario();

  return (
    <main style={{ maxWidth: 500, margin: "100px auto", padding: "0 1rem" }}>
      <h1>Selecciona un restaurante</h1>
      <p>Tienes acceso a más de un restaurante. ¿Con cuál quieres trabajar ahora?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "2rem" }}>
        {vinculos.map((v) => (
          <form key={v.restaurante_id} action={seleccionarRestauranteAction}>
            <input type="hidden" name="restaurante_id" value={v.restaurante_id} />
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "1rem",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <strong>{v.nombre}</strong>
              <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>({v.rol})</span>
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
