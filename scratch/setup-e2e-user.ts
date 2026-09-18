import { createSupabaseAdminClient } from "../lib/supabase-admin";
import { db } from "../db";
import { usuarios, usuarioRestaurantes, restaurantes } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env.local" });

async function setup() {
  const admin = createSupabaseAdminClient();
  const duenoAuthId = "a92ef8ee-3318-4ee4-a594-b156cd9c57c0";

  await admin.auth.admin.updateUserById(duenoAuthId, {
    password: "Password123!",
  });
  console.log("✓ Contraseña actualizada para dueno@test.com");

  // Obtener o crear restaurante
  let rest = await db.query.restaurantes.findFirst();
  if (!rest) {
    const [nuevo] = await db
      .insert(restaurantes)
      .values({
        nombre: "Restaurante E2E Test",
        plan: "pro",
      })
      .returning();
    rest = nuevo;
  }

  // Verificar usuario en BD
  let usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.auth_id, duenoAuthId),
  });

  if (!usuario) {
    const [u] = await db
      .insert(usuarios)
      .values({
        auth_id: duenoAuthId,
        nombre: "Don Dueño E2E",
        email: "dueno@test.com",
        activo: true,
      })
      .returning();
    usuario = u;
  }

  // Verificar vinculo
  const vinculo = await db.query.usuarioRestaurantes.findFirst({
    where: and(
      eq(usuarioRestaurantes.usuario_id, usuario.id),
      eq(usuarioRestaurantes.restaurante_id, rest.id)
    ),
  });

  if (!vinculo) {
    await db.insert(usuarioRestaurantes).values({
      usuario_id: usuario.id,
      restaurante_id: rest.id,
      rol: "dueno",
      activo: true,
      invitacion_pendiente: false,
    });
  } else {
    await db
      .update(usuarioRestaurantes)
      .set({ rol: "dueno", activo: true })
      .where(eq(usuarioRestaurantes.id, vinculo.id));
  }

  console.log("✓ Usuario y restaurante listos para E2E testing.");
  process.exit(0);
}

setup().catch((e) => {
  console.error(e);
  process.exit(1);
});

