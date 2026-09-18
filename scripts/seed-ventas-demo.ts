/**
 * Script para sembrar ventas históricas de demostración para probar Menu Engineering (Fase 5.4).
 * Ejecución: npx tsx scripts/seed-ventas-demo.ts
 */

import "dotenv/config";
import { db } from "../db";
import { restaurantes, mesas, platillos, ordenes, ordenItems } from "../db/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🌱 Creando ventas de demostración para Menu Engineering...");

  const restA = await db.query.restaurantes.findFirst({
    where: eq(restaurantes.nombre, "Restaurante A — La Hacienda"),
  });

  if (!restA) {
    console.error("❌ No se encontró 'Restaurante A — La Hacienda'. Ejecuta primero 'npm run db:seed'.");
    process.exit(1);
  }

  const mesasRest = await db.query.mesas.findMany({
    where: eq(mesas.restaurante_id, restA.id),
  });

  if (mesasRest.length === 0) {
    console.error("❌ No hay mesas registradas para el restaurante.");
    process.exit(1);
  }

  const platillosRest = await db.query.platillos.findMany({
    where: eq(platillos.restaurante_id, restA.id),
  });

  if (platillosRest.length === 0) {
    console.error("❌ No hay platillos registrados para el restaurante.");
    process.exit(1);
  }

  const mesa = mesasRest[0];
  const ahora = Date.now();
  const diaMs = 24 * 60 * 60 * 1000;

  // Distribución objetivo de ventas para ilustrar los 4 cuadrantes:
  // 1. Cochinita Pibil A: Alto volumen (45 uds), buen margen -> ⭐ Estrella
  // 2. Enchiladas Verdes A: Alto volumen (35 uds), bajo margen -> 🐴 Caballo de batalla
  // 3. Pollo en Mole A: Bajo volumen (8 uds), alto margen -> 🧩 Rompecabezas
  // 4. Guacamole A: Bajo volumen (6 uds), margen moderado/bajo -> 🐕 Perro
  // 5. Caldo Tlalpeño / Sopa: Pocas uds o sin receta -> ❔ Sin datos
  const distribucion: { nombre: string; cantidad: number }[] = [
    { nombre: "Cochinita Pibil A", cantidad: 45 },
    { nombre: "Enchiladas Verdes A", cantidad: 35 },
    { nombre: "Pollo en Mole A", cantidad: 8 },
    { nombre: "Guacamole A", cantidad: 6 },
    { nombre: "Flan Napolitano A", cantidad: 4 },
  ];

  let ordenesCreadas = 0;
  let itemsCreados = 0;

  for (const itemDist of distribucion) {
    const platillo = platillosRest.find((p) => p.nombre.includes(itemDist.nombre.replace(" A", "")));
    if (!platillo) continue;

    // Crear varias órdenes en fechas escalonadas de los últimos 45 días
    for (let i = 0; i < itemDist.cantidad; i++) {
      const diasAtras = Math.floor(Math.random() * 45);
      const fechaOrden = new Date(ahora - diasAtras * diaMs);
      const precioUnitario = platillo.precio;

      const [nuevaOrden] = await db
        .insert(ordenes)
        .values({
          restaurante_id: restA.id,
          mesa_id: mesa.id,
          estado: "pagado",
          subtotal: precioUnitario,
          propina: "0.00",
          total: precioUnitario,
          metodo_pago: "efectivo",
          creado_en: fechaOrden,
          actualizado_en: fechaOrden,
        })
        .returning();

      await db.insert(ordenItems).values({
        orden_id: nuevaOrden.id,
        platillo_id: platillo.id,
        cantidad: 1,
        precio_unitario_congelado: precioUnitario,
        estado: "entregado",
      });

      ordenesCreadas++;
      itemsCreados++;
    }
  }

  console.log(`✅ Ventas de demo sembradas con éxito:`);
  console.log(`   - Órdenes creadas: ${ordenesCreadas}`);
  console.log(`   - Items de orden creados: ${itemsCreados}`);
  console.log(`   - Restaurante: ${restA.nombre} (${restA.id})`);
  console.log(`\nYa puedes abrir /reportes/menu-engineering para ver la matriz de cuadrantes con datos.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error sembrando ventas:", err);
  process.exit(1);
});

