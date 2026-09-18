import { describe, it, expect } from "vitest";
import {
  analizarMenu,
  SUGERENCIA_BASE,
  ETIQUETA_CUADRANTE,
  type EntradaPlatillo,
} from "@/lib/ai/menuEngineeringCalculo";

describe("Fase 5.4 — Menu Engineering (Kasavana-Smith)", () => {
  it("retorna estructura vacía y umbrales en cero cuando no hay platillos", () => {
    const resultado = analizarMenu([]);
    expect(resultado.platillos).toEqual([]);
    expect(resultado.umbrales.platillos_clasificados).toBe(0);
    expect(resultado.umbrales.unidades_totales).toBe(0);
    expect(resultado.umbrales.margen_minimo).toBe(0);
    expect(resultado.umbrales.participacion_minima).toBe(0);
  });

  it("clasifica correctamente platillos en los 4 cuadrantes", () => {
    // 4 platillos con receta:
    // P1: Popular y Rentable -> Estrella
    // P2: Popular y No Rentable -> Caballo de batalla
    // P3: No Popular y Rentable -> Rompecabezas
    // P4: No Popular y No Rentable -> Perro
    const entradas: EntradaPlatillo[] = [
      {
        platillo_id: "p1",
        nombre: "Cochinita Pibil (Estrella)",
        precio_catalogo: 180,
        costo_receta: 45, // Margen = 135
        tiene_receta: true,
        unidades_vendidas: 50, // 50 / 100 = 50% participación
        ingreso_real: 9000,
      },
      {
        platillo_id: "p2",
        nombre: "Tacos de Pollo (Caballo de batalla)",
        precio_catalogo: 100,
        costo_receta: 75, // Margen = 25
        tiene_receta: true,
        unidades_vendidas: 35, // 35 / 100 = 35% participación
        ingreso_real: 3500,
      },
      {
        platillo_id: "p3",
        nombre: "Corte New York (Rompecabezas)",
        precio_catalogo: 350,
        costo_receta: 150, // Margen = 200
        tiene_receta: true,
        unidades_vendidas: 10, // 10 / 100 = 10% participación
        ingreso_real: 3500,
      },
      {
        platillo_id: "p4",
        nombre: "Sopa Fría (Perro)",
        precio_catalogo: 60,
        costo_receta: 45, // Margen = 15
        tiene_receta: true,
        unidades_vendidas: 5, // 5 / 100 = 5% participación
        ingreso_real: 300,
      },
    ];

    const resultado = analizarMenu(entradas);

    // Unidades totales = 50 + 35 + 10 + 5 = 100
    // 4 platillos -> cuota igual = 25%, factor 0.7 -> participación mínima = 17.5% (0.175)
    // Margen ponderado = (50*135 + 35*25 + 10*200 + 5*15) / 100 = (6750 + 875 + 2000 + 75) / 100 = 97.00
    expect(resultado.umbrales.unidades_totales).toBe(100);
    expect(resultado.umbrales.platillos_clasificados).toBe(4);
    expect(resultado.umbrales.participacion_minima).toBeCloseTo(0.175, 4);
    expect(resultado.umbrales.margen_minimo).toBeCloseTo(97.0, 2);

    const porId = new Map(resultado.platillos.map((p) => [p.platillo_id, p]));

    const p1 = porId.get("p1")!;
    expect(p1.popular).toBe(true);
    expect(p1.rentable).toBe(true);
    expect(p1.cuadrante).toBe("estrella");
    expect(p1.food_cost_pct).toBeCloseTo(25.0, 1);

    const p2 = porId.get("p2")!;
    expect(p2.popular).toBe(true);
    expect(p2.rentable).toBe(false);
    expect(p2.cuadrante).toBe("caballo_de_batalla");
    expect(p2.food_cost_pct).toBeCloseTo(75.0, 1);

    const p3 = porId.get("p3")!;
    expect(p3.popular).toBe(false);
    expect(p3.rentable).toBe(true);
    expect(p3.cuadrante).toBe("rompecabezas");
    expect(p3.food_cost_pct).toBeCloseTo(42.86, 1);

    const p4 = porId.get("p4")!;
    expect(p4.popular).toBe(false);
    expect(p4.rentable).toBe(false);
    expect(p4.cuadrante).toBe("perro");
    expect(p4.food_cost_pct).toBeCloseTo(75.0, 1);
  });

  it("asigna cuadrante 'sin_datos' a platillos sin ventas o sin receta sin alterar los umbrales", () => {
    const entradas: EntradaPlatillo[] = [
      {
        platillo_id: "c1",
        nombre: "Platillo Clasificable 1",
        precio_catalogo: 100,
        costo_receta: 30,
        tiene_receta: true,
        unidades_vendidas: 20,
        ingreso_real: 2000,
      },
      {
        platillo_id: "c2",
        nombre: "Platillo Clasificable 2",
        precio_catalogo: 100,
        costo_receta: 40,
        tiene_receta: true,
        unidades_vendidas: 20,
        ingreso_real: 2000,
      },
      {
        platillo_id: "s1",
        nombre: "Platillo Sin Ventas",
        precio_catalogo: 120,
        costo_receta: 35,
        tiene_receta: true,
        unidades_vendidas: 0,
        ingreso_real: 0,
      },
      {
        platillo_id: "s2",
        nombre: "Platillo Sin Receta Registrada",
        precio_catalogo: 150,
        costo_receta: 0,
        tiene_receta: false,
        unidades_vendidas: 15,
        ingreso_real: 2250,
      },
    ];

    const resultado = analizarMenu(entradas);

    // Solo c1 y c2 entran a los umbrales
    expect(resultado.umbrales.platillos_clasificados).toBe(2);
    expect(resultado.umbrales.unidades_totales).toBe(40);

    const s1 = resultado.platillos.find((p) => p.platillo_id === "s1")!;
    expect(s1.cuadrante).toBe("sin_datos");
    expect(s1.motivo_sin_datos).toBe("sin_ventas");

    const s2 = resultado.platillos.find((p) => p.platillo_id === "s2")!;
    expect(s2.cuadrante).toBe("sin_datos");
    expect(s2.motivo_sin_datos).toBe("sin_receta");
    expect(s2.food_cost_pct).toBeNull();
  });

  it("calcula food cost % usando el precio cobrado real (congelado) y no el de catálogo", () => {
    const entradas: EntradaPlatillo[] = [
      {
        platillo_id: "desc1",
        nombre: "Platillo en Promoción",
        precio_catalogo: 200, // En catálogo cuesta 200
        costo_receta: 50,
        tiene_receta: true,
        unidades_vendidas: 10,
        ingreso_real: 1500, // En ventas reales se cobró 150 c/u
      },
    ];

    const resultado = analizarMenu(entradas);
    const p = resultado.platillos[0];

    expect(p.precio_promedio_real).toBe(150);
    // Food cost debe ser 50 / 150 = 33.33%, NO 50 / 200 = 25%
    expect(p.food_cost_pct).toBeCloseTo(33.33, 1);
    expect(p.margen_contribucion).toBe(100);
  });

  it("las sugerencias base contienen directrices para todos los cuadrantes con upsell", () => {
    expect(SUGERENCIA_BASE.estrella).toContain("upsell");
    expect(SUGERENCIA_BASE.caballo_de_batalla).toBeDefined();
    expect(SUGERENCIA_BASE.rompecabezas).toBeDefined();
    expect(SUGERENCIA_BASE.perro).toBeDefined();
    expect(SUGERENCIA_BASE.sin_datos).toBeDefined();

    expect(ETIQUETA_CUADRANTE.estrella).toContain("Estrella");
  });
});

