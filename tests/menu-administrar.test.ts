import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  categoriasMenu,
  platillos,
  recetas,
  ingredientes,
  mesas,
  ordenes,
  ordenItems,
  logAuditoria,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  crearCategoriaAction,
  editarCategoriaAction,
  cambiarEstadoCategoriaAction,
  crearPlatilloAction,
  editarPlatilloAction,
  cambiarDisponibilidadPlatilloAction,
  eliminarPlatilloAction,
  obtenerMenuAdminAction,
  obtenerRecetaPlatilloAction,
  guardarRecetaPlatilloAction,
} from "@/lib/menu-actions";
import { UnauthorizedError } from "@/lib/errors";

// Control dinámico de sesión para los tests
let mockAuthUserId = "";
let mockRestauranteActivoId = "";

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockAuthUserId ? { id: mockAuthUserId } : null },
        error: null,
      })),
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((key: string) => {
      if (key === "restaurante_activo") return { value: mockRestauranteActivoId };
      return undefined;
    }),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Módulo de Administración de Menú (/menu/administrar)", () => {
  let restTest: any;
  let duenoUser: any;
  let gerenteUser: any;
  let meseroUser: any;
  let ingredienteCarne: any;
  let ingredienteQueso: any;
  let mesaTest: any;

  const timestamp = Date.now();

  beforeAll(async () => {
    // 1. Crear Restaurante de prueba
    const [r] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Menú Admin ${timestamp}`,
        timezone: "America/Mexico_City",
        plan: "basico",
      })
      .returning();
    restTest = r;
    mockRestauranteActivoId = r.id;

    // 2. Crear Usuarios (Dueño, Gerente, Mesero)
    const [uDueno] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-dueno-menu-${timestamp}`,
        nombre: "Dueño Menú",
        email: `dueno-menu-${timestamp}@test.com`,
      })
      .returning();
    duenoUser = uDueno;

    const [uGerente] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-gerente-menu-${timestamp}`,
        nombre: "Gerente Menú",
        email: `gerente-menu-${timestamp}@test.com`,
      })
      .returning();
    gerenteUser = uGerente;

    const [uMesero] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-mesero-menu-${timestamp}`,
        nombre: "Mesero Menú",
        email: `mesero-menu-${timestamp}@test.com`,
      })
      .returning();
    meseroUser = uMesero;

    // Vincular roles
    await db.insert(usuarioRestaurantes).values([
      { usuario_id: duenoUser.id, restaurante_id: restTest.id, rol: "dueno", activo: true },
      { usuario_id: gerenteUser.id, restaurante_id: restTest.id, rol: "gerente", activo: true },
      { usuario_id: meseroUser.id, restaurante_id: restTest.id, rol: "mesero", activo: true },
    ]);

    // 3. Crear Ingredientes en inventario para recetas
    const [ing1] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restTest.id,
        nombre: `Carne Molida ${timestamp}`,
        unidad_medida: "kg",
        costo_unitario: "150.0000",
        stock_actual: "20.000",
        stock_minimo: "5.000",
      })
      .returning();
    ingredienteCarne = ing1;

    const [ing2] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restTest.id,
        nombre: `Queso Cheddar ${timestamp}`,
        unidad_medida: "kg",
        costo_unitario: "120.0000",
        stock_actual: "10.000",
        stock_minimo: "2.000",
      })
      .returning();
    ingredienteQueso = ing2;

    // 4. Crear Mesa para simular órdenes
    const [m] = await db
      .insert(mesas)
      .values({
        restaurante_id: restTest.id,
        numero: 99,
        qr_token: `qr_menu_admin_${timestamp}`,
      })
      .returning();
    mesaTest = m;
  });

  afterAll(async () => {
    // Limpieza de datos en orden inverso a dependencias
    await db.delete(ordenItems).where(
      sql`${ordenItems.orden_id} IN (SELECT id FROM ${ordenes} WHERE restaurante_id = ${restTest.id})`
    );
    await db.delete(ordenes).where(eq(ordenes.restaurante_id, restTest.id));
    const plats = await db
      .select({ id: platillos.id })
      .from(platillos)
      .where(eq(platillos.restaurante_id, restTest.id));
    if (plats.length > 0) {
      const ids = plats.map((p) => p.id);
      await db.delete(recetas).where(inArray(recetas.platillo_id, ids));
    }
    await db.delete(platillos).where(eq(platillos.restaurante_id, restTest.id));
    await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restTest.id));
    await db.delete(ingredientes).where(eq(ingredientes.restaurante_id, restTest.id));
    await db.delete(mesas).where(eq(mesas.restaurante_id, restTest.id));
    await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, restTest.id));
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restTest.id));
    await db.delete(usuarios).where(eq(usuarios.id, duenoUser.id));
    await db.delete(usuarios).where(eq(usuarios.id, gerenteUser.id));
    await db.delete(usuarios).where(eq(usuarios.id, meseroUser.id));
    await db.delete(restaurantes).where(eq(restaurantes.id, restTest.id));
  });

  describe("1. Gestión de Categorías (Listar, Crear, Editar, Desactivar)", () => {
    let categoriaCreada: any;

    it("Dueño/Gerente crea una categoría con orden de aparición", async () => {
      mockAuthUserId = gerenteUser.auth_id;

      const res = await crearCategoriaAction({
        nombre: "Hamburguesas Gourmet",
        orden: 1,
      });

      expect(res.success).toBe(true);
      expect(res.categoria).toBeDefined();
      expect(res.categoria?.nombre).toBe("Hamburguesas Gourmet");
      expect(res.categoria?.orden).toBe(1);
      expect(res.categoria?.activo).toBe(true);
      categoriaCreada = res.categoria;

      // Verificar en PostgreSQL real
      const dbCat = await db.query.categoriasMenu.findFirst({
        where: eq(categoriasMenu.id, categoriaCreada.id),
      });
      expect(dbCat).toBeDefined();
      expect(dbCat?.activo).toBe(true);
    });

    it("Editar categoría (nombre y orden)", async () => {
      mockAuthUserId = duenoUser.auth_id;

      const res = await editarCategoriaAction(categoriaCreada.id, {
        nombre: "Hamburguesas & Sandwiches",
        orden: 2,
        activo: true,
      });

      expect(res.success).toBe(true);
      expect(res.categoria?.nombre).toBe("Hamburguesas & Sandwiches");
      expect(res.categoria?.orden).toBe(2);

      const dbCat = await db.query.categoriasMenu.findFirst({
        where: eq(categoriasMenu.id, categoriaCreada.id),
      });
      expect(dbCat?.nombre).toBe("Hamburguesas & Sandwiches");
      expect(dbCat?.orden).toBe(2);
    });

    it("Desactivar categoría (soft-deactivate, NO borrar físicamente)", async () => {
      mockAuthUserId = gerenteUser.auth_id;

      const res = await cambiarEstadoCategoriaAction(categoriaCreada.id, false);
      expect(res.success).toBe(true);
      expect(res.activo).toBe(false);

      const dbCat = await db.query.categoriasMenu.findFirst({
        where: eq(categoriasMenu.id, categoriaCreada.id),
      });
      expect(dbCat?.activo).toBe(false);

      // Reactivar para siguientes pruebas
      await cambiarEstadoCategoriaAction(categoriaCreada.id, true);
    });
  });

  describe("2. Gestión de Platillos (Crear, Editar, Disponibilidad)", () => {
    let platilloCreado: any;
    let categoriaId: string;

    beforeAll(async () => {
      const [cat] = await db
        .select()
        .from(categoriasMenu)
        .where(eq(categoriasMenu.restaurante_id, restTest.id))
        .limit(1);
      categoriaId = cat.id;
    });

    it("Crea un nuevo platillo con categoría, precio y tiempo de preparación", async () => {
      mockAuthUserId = gerenteUser.auth_id;

      const res = await crearPlatilloAction({
        categoriaId,
        nombre: "Burger Clásica con Queso",
        descripcion: "200g de carne, queso cheddar y pan artesanal",
        precio: 165.5,
        tiempoPrepMinutos: 12,
        fotoUrl: "https://lzmawhowjxgovxewmray.supabase.co/storage/v1/object/public/menu-fotos/test.jpg",
        disponible: true,
      });

      expect(res.success).toBe(true);
      expect(res.platillo).toBeDefined();
      expect(res.platillo?.nombre).toBe("Burger Clásica con Queso");
      expect(parseFloat(res.platillo!.precio)).toBe(165.5);
      expect(res.platillo?.disponible).toBe(true);
      platilloCreado = res.platillo;
    });

    it("Edita datos del platillo", async () => {
      mockAuthUserId = duenoUser.auth_id;

      const res = await editarPlatilloAction(platilloCreado.id, {
        categoriaId,
        nombre: "Burger Clásica Doble Queso",
        descripcion: "200g de carne y doble porción de queso cheddar",
        precio: 185.0,
        tiempoPrepMinutos: 15,
        fotoUrl: platilloCreado.foto_url,
        disponible: true,
      });

      expect(res.success).toBe(true);
      expect(res.platillo?.nombre).toBe("Burger Clásica Doble Queso");
      expect(parseFloat(res.platillo!.precio)).toBe(185.0);
    });

    it("Alterna disponibilidad (activar / desactivar)", async () => {
      mockAuthUserId = gerenteUser.auth_id;

      // Desactivar (agotado)
      const resAgotado = await cambiarDisponibilidadPlatilloAction(platilloCreado.id, false);
      expect(resAgotado.success).toBe(true);
      expect(resAgotado.disponible).toBe(false);

      // Reactivar
      const resDisp = await cambiarDisponibilidadPlatilloAction(platilloCreado.id, true);
      expect(resDisp.success).toBe(true);
      expect(resDisp.disponible).toBe(true);
    });
  });

  describe("3. Recetas (Vinculación de Ingredientes para Descuento de Inventario)", () => {
    let platilloId: string;

    beforeAll(async () => {
      const [p] = await db
        .select()
        .from(platillos)
        .where(eq(platillos.restaurante_id, restTest.id))
        .limit(1);
      platilloId = p.id;
    });

    it("Asigna ingredientes y cantidades a la receta de un platillo", async () => {
      mockAuthUserId = gerenteUser.auth_id;

      const res = await guardarRecetaPlatilloAction(platilloId, [
        { ingredienteId: ingredienteCarne.id, cantidadRequerida: 0.2 }, // 200g
        { ingredienteId: ingredienteQueso.id, cantidadRequerida: 0.05 }, // 50g
      ]);

      expect(res.success).toBe(true);

      // Verificar persistencia en tabla 'recetas'
      const lineasReceta = await db.query.recetas.findMany({
        where: eq(recetas.platillo_id, platilloId),
      });

      expect(lineasReceta).toHaveLength(2);
      const carne = lineasReceta.find((r) => r.ingrediente_id === ingredienteCarne.id);
      const queso = lineasReceta.find((r) => r.ingrediente_id === ingredienteQueso.id);
      expect(parseFloat(carne?.cantidad_requerida || "0")).toBe(0.2);
      expect(parseFloat(queso?.cantidad_requerida || "0")).toBe(0.05);
    });

    it("Obtiene la receta y calcula el food cost estimado correctamente", async () => {
      mockAuthUserId = duenoUser.auth_id;

      const res = await obtenerRecetaPlatilloAction(platilloId);
      expect(res.receta).toHaveLength(2);

      // Costo esperado: (0.2 * 150) + (0.05 * 120) = 30 + 6 = $36.00
      expect(res.costoTotalReceta).toBe(36.0);
    });

    it("obtenerMenuAdminAction refleja tieneReceta: true para el platillo", async () => {
      mockAuthUserId = gerenteUser.auth_id;

      const data = await obtenerMenuAdminAction();
      const p = data.platillos.find((item) => item.id === platilloId);
      expect(p).toBeDefined();
      expect(p?.tieneReceta).toBe(true);
      expect(p?.totalIngredientesReceta).toBe(2);
    });
  });

  describe("4. Control de Acceso por Roles (RBAC)", () => {
    it("Un mesero NO puede crear ni modificar categorías, platillos o recetas", async () => {
      mockAuthUserId = meseroUser.auth_id;

      await expect(
        crearCategoriaAction({ nombre: "Intento Mesero" })
      ).rejects.toThrow(UnauthorizedError);

      await expect(
        crearPlatilloAction({
          categoriaId: "00000000-0000-0000-0000-000000000000",
          nombre: "Intento Mesero",
          precio: 100,
        })
      ).rejects.toThrow(UnauthorizedError);

      await expect(
        guardarRecetaPlatilloAction("00000000-0000-0000-0000-000000000000", [])
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("5. Integridad Referencial Estricta: Prohibición de Borrar Platillos con Ventas", () => {
    let platilloConVentas: any;
    let platilloSinVentas: any;

    beforeAll(async () => {
      const [cat] = await db
        .select()
        .from(categoriasMenu)
        .where(eq(categoriasMenu.restaurante_id, restTest.id))
        .limit(1);

      // Platillo 1: se asociará a una orden
      const [p1] = await db
        .insert(platillos)
        .values({
          restaurante_id: restTest.id,
          categoria_id: cat.id,
          nombre: "Platillo Histórico Vendido",
          precio: "200.00",
          disponible: true,
        })
        .returning();
      platilloConVentas = p1;

      // Crear orden y vincular platillo en orden_items
      const [orden] = await db
        .insert(ordenes)
        .values({
          restaurante_id: restTest.id,
          mesa_id: mesaTest.id,
          estado: "abierta",
          total: "200.00",
        })
        .returning();

      await db.insert(ordenItems).values({
        orden_id: orden.id,
        platillo_id: platilloConVentas.id,
        cantidad: 1,
        precio_unitario_congelado: "200.00",
        estado: "entregado",
      });

      // Platillo 2: borrador sin ninguna venta
      const [p2] = await db
        .insert(platillos)
        .values({
          restaurante_id: restTest.id,
          categoria_id: cat.id,
          nombre: "Platillo Borrador Nuevo",
          precio: "90.00",
          disponible: true,
        })
        .returning();
      platilloSinVentas = p2;

      // Agregar receta al borrador para probar que se limpia al borrar
      await db.insert(recetas).values({
        platillo_id: platilloSinVentas.id,
        ingrediente_id: ingredienteCarne.id,
        cantidad_requerida: "0.100",
      });
    });

    it("Platillo CON ventas históricas: eliminarPlatilloAction NO lo borra físicamente, lo desactiva", async () => {
      mockAuthUserId = duenoUser.auth_id;

      const res = await eliminarPlatilloAction(platilloConVentas.id);

      expect(res.success).toBe(true);
      expect(res.desactivado).toBe(true);
      expect(res.mensaje).toMatch(/ventas y órdenes históricas/i);

      // Confirmar en base de datos que la fila SIGUE EXISTIENDO pero con disponible = false
      const platDb = await db.query.platillos.findFirst({
        where: eq(platillos.id, platilloConVentas.id),
      });

      expect(platDb).toBeDefined();
      expect(platDb?.disponible).toBe(false);

      // Confirmar que orden_items conserva su referencia intacta
      const ordenItemDb = await db.query.ordenItems.findFirst({
        where: eq(ordenItems.platillo_id, platilloConVentas.id),
      });
      expect(ordenItemDb).toBeDefined();
    });

    it("Platillo SIN ventas históricas: se elimina físicamente junto con sus recetas", async () => {
      mockAuthUserId = duenoUser.auth_id;

      const res = await eliminarPlatilloAction(platilloSinVentas.id);

      expect(res.success).toBe(true);
      expect(res.eliminado).toBe(true);

      // Confirmar que ya NO existe en 'platillos'
      const platDb = await db.query.platillos.findFirst({
        where: eq(platillos.id, platilloSinVentas.id),
      });
      expect(platDb).toBeUndefined();

      // Confirmar que sus recetas se limpiaron
      const recetasDb = await db.query.recetas.findMany({
        where: eq(recetas.platillo_id, platilloSinVentas.id),
      });
      expect(recetasDb).toHaveLength(0);
    });
  });
});

