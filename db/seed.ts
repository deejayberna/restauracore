/**
 * Seed de datos de prueba — RestauraCore
 * Ejecutar: npm run db:seed
 *
 * Crea:
 * - Restaurante A y Restaurante B (completamente independientes)
 * - Usuarios con cada rol vinculados SOLO a Restaurante A
 * - Usuario "dueño" vinculado a AMBOS restaurantes
 * - Menú de 8 platillos con recetas e ingredientes por restaurante
 * - Stock inicial de ingredientes
 */

import "dotenv/config";
import { db } from "./index";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  categoriasMenu,
  platillos,
  ingredientes,
  recetas,
  mesas,
} from "./schema";
import { randomUUID } from "crypto";

async function seed() {
  console.log("🌱 Iniciando seed...");

  // ─── Restaurantes ──────────────────────────────────────────
  const [restA, restB] = await db
    .insert(restaurantes)
    .values([
      { nombre: "Restaurante A — La Hacienda", direccion: "Av. Principal 100", plan: "pro" },
      { nombre: "Restaurante B — El Rincón", direccion: "Calle Secundaria 200", plan: "basico" },
    ])
    .returning();

  console.log(`✓ Restaurantes: ${restA.nombre}, ${restB.nombre}`);

  // ─── Usuarios ──────────────────────────────────────────────
  // auth_id simulado (en producción viene de Supabase Auth)
  const [uMesero, uChef, uGerente, uDueno] = await db
    .insert(usuarios)
    .values([
      { auth_id: "seed-auth-mesero", nombre: "Carlos Mesero", email: "mesero@test.com" },
      { auth_id: "seed-auth-chef", nombre: "Ana Chef", email: "chef@test.com" },
      { auth_id: "seed-auth-gerente", nombre: "Luis Gerente", email: "gerente@test.com" },
      { auth_id: "seed-auth-dueno", nombre: "María Dueña", email: "dueno@test.com" },
    ])
    .returning();

  console.log("✓ Usuarios creados");

  // ─── Vínculos usuario_restaurantes ─────────────────────────
  await db.insert(usuarioRestaurantes).values([
    // Restaurante A — staff completo
    { usuario_id: uMesero.id, restaurante_id: restA.id, rol: "mesero" },
    { usuario_id: uChef.id, restaurante_id: restA.id, rol: "chef" },
    { usuario_id: uGerente.id, restaurante_id: restA.id, rol: "gerente" },
    // Dueña vinculada a AMBOS restaurantes
    { usuario_id: uDueno.id, restaurante_id: restA.id, rol: "dueno" },
    { usuario_id: uDueno.id, restaurante_id: restB.id, rol: "dueno" },
  ]);

  console.log("✓ Vínculos usuario_restaurantes creados");

  // ─── Menú Restaurante A ────────────────────────────────────
  const [catEntA, catPrinA, catPostreA] = await db
    .insert(categoriasMenu)
    .values([
      { restaurante_id: restA.id, nombre: "Entradas A", orden: 1 },
      { restaurante_id: restA.id, nombre: "Platos Fuertes A", orden: 2 },
      { restaurante_id: restA.id, nombre: "Postres A", orden: 3 },
    ])
    .returning();

  const platillosA = await db
    .insert(platillos)
    .values([
      {
        restaurante_id: restA.id,
        categoria_id: catEntA.id,
        nombre: "Sopa de Lima A",
        precio: "85.00",
        tiempo_prep_minutos: 10,
      },
      {
        restaurante_id: restA.id,
        categoria_id: catEntA.id,
        nombre: "Guacamole A",
        precio: "65.00",
        tiempo_prep_minutos: 5,
      },
      {
        restaurante_id: restA.id,
        categoria_id: catPrinA.id,
        nombre: "Cochinita Pibil A",
        precio: "165.00",
        tiempo_prep_minutos: 20,
      },
      {
        restaurante_id: restA.id,
        categoria_id: catPrinA.id,
        nombre: "Pollo en Mole A",
        precio: "155.00",
        tiempo_prep_minutos: 18,
      },
      {
        restaurante_id: restA.id,
        categoria_id: catPrinA.id,
        nombre: "Enchiladas Verdes A",
        precio: "120.00",
        tiempo_prep_minutos: 15,
      },
      {
        restaurante_id: restA.id,
        categoria_id: catPrinA.id,
        nombre: "Caldo Tlalpeño A",
        precio: "95.00",
        tiempo_prep_minutos: 12,
      },
      {
        restaurante_id: restA.id,
        categoria_id: catPostreA.id,
        nombre: "Flan Napolitano A",
        precio: "55.00",
        tiempo_prep_minutos: 5,
      },
      {
        restaurante_id: restA.id,
        categoria_id: catPostreA.id,
        nombre: "Churros con Chocolate A",
        precio: "60.00",
        tiempo_prep_minutos: 8,
      },
    ])
    .returning();

  // ─── Ingredientes Restaurante A ────────────────────────────
  const ingA = await db
    .insert(ingredientes)
    .values([
      {
        restaurante_id: restA.id,
        nombre: "Pollo A",
        unidad_medida: "kg",
        costo_unitario: "85.00",
        stock_actual: "20.000",
        stock_minimo: "5.000",
      },
      {
        restaurante_id: restA.id,
        nombre: "Cerdo A",
        unidad_medida: "kg",
        costo_unitario: "75.00",
        stock_actual: "15.000",
        stock_minimo: "4.000",
      },
      {
        restaurante_id: restA.id,
        nombre: "Aguacate A",
        unidad_medida: "pieza",
        costo_unitario: "12.00",
        stock_actual: "50.000",
        stock_minimo: "10.000",
      },
      {
        restaurante_id: restA.id,
        nombre: "Chile Ancho A",
        unidad_medida: "g",
        costo_unitario: "0.08",
        stock_actual: "2000.000",
        stock_minimo: "500.000",
      },
      {
        restaurante_id: restA.id,
        nombre: "Tortilla A",
        unidad_medida: "pieza",
        costo_unitario: "1.50",
        stock_actual: "200.000",
        stock_minimo: "50.000",
      },
      {
        restaurante_id: restA.id,
        nombre: "Crema A",
        unidad_medida: "ml",
        costo_unitario: "0.05",
        stock_actual: "3000.000",
        stock_minimo: "500.000",
      },
    ])
    .returning();

  // Recetas básicas para Restaurante A
  await db.insert(recetas).values([
    { platillo_id: platillosA[2].id, ingrediente_id: ingA[1].id, cantidad_requerida: "0.300" }, // Cochinita — cerdo
    { platillo_id: platillosA[2].id, ingrediente_id: ingA[3].id, cantidad_requerida: "15.000" }, // Cochinita — chile
    { platillo_id: platillosA[3].id, ingrediente_id: ingA[0].id, cantidad_requerida: "0.250" }, // Mole — pollo
    { platillo_id: platillosA[3].id, ingrediente_id: ingA[3].id, cantidad_requerida: "20.000" }, // Mole — chile
    { platillo_id: platillosA[4].id, ingrediente_id: ingA[4].id, cantidad_requerida: "3.000" }, // Enchiladas — tortilla
    { platillo_id: platillosA[4].id, ingrediente_id: ingA[0].id, cantidad_requerida: "0.150" }, // Enchiladas — pollo
    { platillo_id: platillosA[1].id, ingrediente_id: ingA[2].id, cantidad_requerida: "2.000" }, // Guacamole — aguacate
  ]);

  // Mesas Restaurante A
  await db.insert(mesas).values(
    Array.from({ length: 8 }, (_, i) => ({
      restaurante_id: restA.id,
      numero: i + 1,
      qr_token: `mesa-a-${i + 1}-${randomUUID().slice(0, 8)}`,
    }))
  );

  console.log("✓ Menú, ingredientes, recetas y mesas de Restaurante A creados");

  // ─── Menú Restaurante B ────────────────────────────────────
  const [catEntB, catPrinB] = await db
    .insert(categoriasMenu)
    .values([
      { restaurante_id: restB.id, nombre: "Entradas B", orden: 1 },
      { restaurante_id: restB.id, nombre: "Especialidades B", orden: 2 },
    ])
    .returning();

  const platillosB = await db
    .insert(platillos)
    .values([
      {
        restaurante_id: restB.id,
        categoria_id: catEntB.id,
        nombre: "Ceviche B",
        precio: "110.00",
        tiempo_prep_minutos: 10,
      },
      {
        restaurante_id: restB.id,
        categoria_id: catEntB.id,
        nombre: "Tostadas de Atún B",
        precio: "95.00",
        tiempo_prep_minutos: 8,
      },
      {
        restaurante_id: restB.id,
        categoria_id: catPrinB.id,
        nombre: "Camarones al Ajillo B",
        precio: "195.00",
        tiempo_prep_minutos: 15,
      },
      {
        restaurante_id: restB.id,
        categoria_id: catPrinB.id,
        nombre: "Filete de Pescado B",
        precio: "175.00",
        tiempo_prep_minutos: 18,
      },
      {
        restaurante_id: restB.id,
        categoria_id: catPrinB.id,
        nombre: "Pulpo a la Gallega B",
        precio: "210.00",
        tiempo_prep_minutos: 20,
      },
      {
        restaurante_id: restB.id,
        categoria_id: catPrinB.id,
        nombre: "Arroz con Mariscos B",
        precio: "185.00",
        tiempo_prep_minutos: 22,
      },
      {
        restaurante_id: restB.id,
        categoria_id: catPrinB.id,
        nombre: "Tacos de Marlín B",
        precio: "145.00",
        tiempo_prep_minutos: 12,
      },
      {
        restaurante_id: restB.id,
        categoria_id: catPrinB.id,
        nombre: "Sopa de Mariscos B",
        precio: "130.00",
        tiempo_prep_minutos: 15,
      },
    ])
    .returning();

  // ─── Ingredientes Restaurante B ────────────────────────────
  const ingB = await db
    .insert(ingredientes)
    .values([
      {
        restaurante_id: restB.id,
        nombre: "Camarón B",
        unidad_medida: "kg",
        costo_unitario: "180.00",
        stock_actual: "10.000",
        stock_minimo: "3.000",
      },
      {
        restaurante_id: restB.id,
        nombre: "Pescado Filete B",
        unidad_medida: "kg",
        costo_unitario: "120.00",
        stock_actual: "8.000",
        stock_minimo: "2.000",
      },
      {
        restaurante_id: restB.id,
        nombre: "Pulpo B",
        unidad_medida: "kg",
        costo_unitario: "150.00",
        stock_actual: "5.000",
        stock_minimo: "1.500",
      },
      {
        restaurante_id: restB.id,
        nombre: "Limón B",
        unidad_medida: "pieza",
        costo_unitario: "2.00",
        stock_actual: "100.000",
        stock_minimo: "20.000",
      },
      {
        restaurante_id: restB.id,
        nombre: "Ajo B",
        unidad_medida: "g",
        costo_unitario: "0.05",
        stock_actual: "500.000",
        stock_minimo: "100.000",
      },
      {
        restaurante_id: restB.id,
        nombre: "Arroz B",
        unidad_medida: "kg",
        costo_unitario: "18.00",
        stock_actual: "12.000",
        stock_minimo: "3.000",
      },
    ])
    .returning();

  // Recetas básicas para Restaurante B
  await db.insert(recetas).values([
    { platillo_id: platillosB[2].id, ingrediente_id: ingB[0].id, cantidad_requerida: "0.300" }, // Camarones — camarón
    { platillo_id: platillosB[2].id, ingrediente_id: ingB[4].id, cantidad_requerida: "10.000" }, // Camarones — ajo
    { platillo_id: platillosB[3].id, ingrediente_id: ingB[1].id, cantidad_requerida: "0.250" }, // Filete — pescado
    { platillo_id: platillosB[4].id, ingrediente_id: ingB[2].id, cantidad_requerida: "0.350" }, // Pulpo — pulpo
    { platillo_id: platillosB[5].id, ingrediente_id: ingB[5].id, cantidad_requerida: "0.200" }, // Arroz — arroz
    { platillo_id: platillosB[5].id, ingrediente_id: ingB[0].id, cantidad_requerida: "0.150" }, // Arroz — camarón
  ]);

  // Mesas Restaurante B
  await db.insert(mesas).values(
    Array.from({ length: 6 }, (_, i) => ({
      restaurante_id: restB.id,
      numero: i + 1,
      qr_token: `mesa-b-${i + 1}-${randomUUID().slice(0, 8)}`,
    }))
  );

  console.log("✓ Menú, ingredientes, recetas y mesas de Restaurante B creados");
  console.log("\n✅ Seed completado exitosamente");
  console.log("\nResumen:");
  console.log(`  Restaurante A id: ${restA.id}`);
  console.log(`  Restaurante B id: ${restB.id}`);
  console.log(`  Dueña (vinculada a ambos) auth_id: seed-auth-dueno`);
  console.log(`  Mesero (solo Rest. A) auth_id: seed-auth-mesero`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error en seed:", err);
  process.exit(1);
});
