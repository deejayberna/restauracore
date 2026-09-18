import { describe, it, expect } from "vitest";
import {
  procesarRentabilidad,
  type EntradaPlatilloRentabilidad,
} from "@/lib/rentabilidad";

describe("Fase 6.1 — Reporte de Rentabilidad y Food Cost Real", () => {
  it("calcula el food cost % real contra el precio cobrado congelado y no el de catálogo", () => {
    const entradas: EntradaPlatilloRentabilidad[] = [
      {
        platillo_id: "p1",
        nombre: "Hamburguesa Especial en Descuento",
        categoria_nombre: "Fuertes",
        precio_catalogo: 200, // En catálogo cuesta $200
        costo_receta: 60, // Receta cuesta $60
        tiene_receta: true,
        unidades_vendidas: 10,
        ingreso_real: 1500, // Cobrado real promedio: $150 c/u
      },
    ];

    const { platillos, metricas } = procesarRentabilidad(entradas);
    const p = platillos[0];

    // Precio promedio real cobrado
    expect(p.precio_promedio_real).toBe(150);
    // Food cost real: 60 / 150 = 40%, NO 60 / 200 = 30%
    expect(p.food_cost_pct).toBeCloseTo(40.0, 1);
    // Margen unitario real: 150 - 60 = 90
    expect(p.margen_unitario).toBe(90);
    expect(p.margen_total).toBe(900);
    expect(p.nivel).toBe("critico"); // > 38%

    expect(metricas.ingreso_total).toBe(1500);
    expect(metricas.costo_total_alimentos).toBe(600);
    expect(metricas.margen_bruto_total).toBe(900);
    expect(metricas.food_cost_global_pct).toBeCloseTo(40.0, 1);
  });

  it("ordena estrictamente de menor a mayor rentabilidad por defecto", () => {
    const entradas: EntradaPlatilloRentabilidad[] = [
      {
        platillo_id: "p_alto",
        nombre: "Corte de Carne Premium",
        categoria_nombre: "Carnes",
        precio_catalogo: 400,
        costo_receta: 120, // Margen unitario = 280
        tiene_receta: true,
        unidades_vendidas: 5,
        ingreso_real: 2000,
      },
      {
        platillo_id: "p_bajo",
        nombre: "Tacos de Pollo Económicos",
        categoria_nombre: "Tacos",
        precio_catalogo: 80,
        costo_receta: 60, // Margen unitario = 20 (el más bajo)
        tiene_receta: true,
        unidades_vendidas: 20,
        ingreso_real: 1600,
      },
      {
        platillo_id: "p_medio",
        nombre: "Pasta Alfredo",
        categoria_nombre: "Pastas",
        precio_catalogo: 150,
        costo_receta: 45, // Margen unitario = 105
        tiene_receta: true,
        unidades_vendidas: 10,
        ingreso_real: 1500,
      },
    ];

    const { platillos } = procesarRentabilidad(entradas, "menor_a_mayor");

    expect(platillos[0].platillo_id).toBe("p_bajo"); // Margen 20
    expect(platillos[1].platillo_id).toBe("p_medio"); // Margen 105
    expect(platillos[2].platillo_id).toBe("p_alto"); // Margen 280
  });

  it("posiciona al final los platillos sin receta o sin ventas", () => {
    const entradas: EntradaPlatilloRentabilidad[] = [
      {
        platillo_id: "p_con_venta",
        nombre: "Platillo Activo",
        categoria_nombre: "Entradas",
        precio_catalogo: 100,
        costo_receta: 30,
        tiene_receta: true,
        unidades_vendidas: 15,
        ingreso_real: 1500,
      },
      {
        platillo_id: "p_sin_receta",
        nombre: "Platillo Sin Receta",
        categoria_nombre: "Postres",
        precio_catalogo: 70,
        costo_receta: 0,
        tiene_receta: false,
        unidades_vendidas: 10,
        ingreso_real: 700,
      },
      {
        platillo_id: "p_sin_ventas",
        nombre: "Platillo Sin Ventas",
        categoria_nombre: "Bebidas",
        precio_catalogo: 50,
        costo_receta: 15,
        tiene_receta: true,
        unidades_vendidas: 0,
        ingreso_real: 0,
      },
    ];

    const { platillos } = procesarRentabilidad(entradas, "menor_a_mayor");

    expect(platillos[0].platillo_id).toBe("p_con_venta");
    expect(platillos.find((p) => p.platillo_id === "p_sin_receta")?.nivel).toBe("sin_datos");
    expect(platillos.find((p) => p.platillo_id === "p_sin_ventas")?.nivel).toBe("sin_datos");
  });

  it("clasifica los niveles de diagnóstico correctamente según el porcentaje de costo", () => {
    const entradas: EntradaPlatilloRentabilidad[] = [
      {
        platillo_id: "critico",
        nombre: "Platillo Crítico",
        categoria_nombre: "A",
        precio_catalogo: 100,
        costo_receta: 45, // 45% > 38%
        tiene_receta: true,
        unidades_vendidas: 1,
        ingreso_real: 100,
      },
      {
        platillo_id: "alerta",
        nombre: "Platillo Alerta",
        categoria_nombre: "B",
        precio_catalogo: 100,
        costo_receta: 35, // 35% (32-38%)
        tiene_receta: true,
        unidades_vendidas: 1,
        ingreso_real: 100,
      },
      {
        platillo_id: "saludable",
        nombre: "Platillo Saludable",
        categoria_nombre: "C",
        precio_catalogo: 100,
        costo_receta: 28, // 28% (22-32%)
        tiene_receta: true,
        unidades_vendidas: 1,
        ingreso_real: 100,
      },
      {
        platillo_id: "excelente",
        nombre: "Platillo Excelente",
        categoria_nombre: "D",
        precio_catalogo: 100,
        costo_receta: 18, // 18% < 22%
        tiene_receta: true,
        unidades_vendidas: 1,
        ingreso_real: 100,
      },
    ];

    const { platillos } = procesarRentabilidad(entradas);
    const porId = new Map(platillos.map((p) => [p.platillo_id, p]));

    expect(porId.get("critico")?.nivel).toBe("critico");
    expect(porId.get("alerta")?.nivel).toBe("alerta");
    expect(porId.get("saludable")?.nivel).toBe("saludable");
    expect(porId.get("excelente")?.nivel).toBe("excelente");
  });
});

