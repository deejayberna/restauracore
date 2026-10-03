import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  categoriasMenu,
  platillos,
  mesas,
  ordenes,
  ordenItems,
  ingredientes,
  recetas,
  movimientosInventario,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  guardarPaso1Action,
  guardarPaso2MenuAction,
  guardarPaso3MesaAction,
  guardarPaso4InvitarAction,
  obtenerDatosWizardAction,
} from "@/lib/wizard-actions";
import { actualizarEstadoItem } from "@/lib/cocina-actions";
import { descontarInventarioPorOrden } from "@/lib/inventario-actions";
import { obtenerDatosReciboAction } from "@/lib/recibo-actions";
import { NextRequest } from "next/server";
import { GET as getKdsItemRoute } from "@/app/api/kds/item/[id]/route";
import { UnauthorizedError } from "@/lib/errors";

// Variables para simular la sesión de Supabase y cookies en Next.js
let mockAuthUserId: string | null = null;
let mockUserEmail: string | null = null;
let mockRestauranteActivoId: string | null = null;

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: mockAuthUserId
            ? { id: mockAuthUserId, email: mockUserEmail }
            : null,
        },
        error: null,
      })),
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((key: string) => {
      if (key === "restaurante_activo") {
        return mockRestauranteActivoId ? { value: mockRestauranteActivoId } : undefined;
      }
      return undefined;
    }),
  })),
}));

describe("Control de Acceso Multi-tenant: lib/wizard-actions.ts", () => {
  const ts = Date.now();
  let restA: any;
  let restB: any;
  let userA: any;
  let duenoB: any;
  let meseroB: any;

  beforeAll(async () => {
    // 1. Crear Restaurante B (Víctima) con su dueño legítimo
    const [b] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante B Victima ${ts}`,
        plan: "basico",
        direccion: "Calle Victima 123",
      })
      .returning();
    restB = b;

    const [uB] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_dueno_b_${ts}`,
        email: `dueno_b_${ts}@victima.com`,
        nombre: "Dueño Legítimo B",
      })
      .returning();
    duenoB = uB;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: duenoB.id,
      restaurante_id: restB.id,
      rol: "dueno",
      activo: true,
    });

    // Empleado con rol mesero en Restaurante B
    const [mB] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_mesero_b_${ts}`,
        email: `mesero_b_${ts}@victima.com`,
        nombre: "Mesero B",
      })
      .returning();
    meseroB = mB;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: meseroB.id,
      restaurante_id: restB.id,
      rol: "mesero",
      activo: true,
    });

    // 2. Crear Restaurante A y Usuario A (Atacante / ajeno a Restaurante B)
    const [a] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante A Atacante ${ts}`,
        plan: "basico",
      })
      .returning();
    restA = a;

    const [uA] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_user_a_${ts}`,
        email: `user_a_${ts}@atacante.com`,
        nombre: "Usuario Atacante A",
      })
      .returning();
    userA = uA;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: userA.id,
      restaurante_id: restA.id,
      rol: "dueno",
      activo: true,
    });
  });

  afterAll(async () => {
    // Limpieza
    if (restB) {
      await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restB.id));
      await db.delete(platillos).where(eq(platillos.restaurante_id, restB.id));
      await db.delete(categoriasMenu).where(eq(categoriasMenu.restaurante_id, restB.id));
      await db.delete(mesas).where(eq(mesas.restaurante_id, restB.id));
      await db.delete(restaurantes).where(eq(restaurantes.id, restB.id));
    }
    if (restA) {
      await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restA.id));
      await db.delete(restaurantes).where(eq(restaurantes.id, restA.id));
    }
    if (userA) {
      await db.delete(usuarios).where(eq(usuarios.id, userA.id));
    }
    if (duenoB) {
      await db.delete(usuarios).where(eq(usuarios.id, duenoB.id));
    }
    if (meseroB) {
      await db.delete(usuarios).where(eq(usuarios.id, meseroB.id));
    }
  });

  it("1. Rechaza la petición si no hay sesión iniciada", async () => {
    mockAuthUserId = null;
    mockUserEmail = null;
    mockRestauranteActivoId = restB.id;

    await expect(
      guardarPaso1Action("Hack", "Dir", "America/Mexico_City")
    ).rejects.toThrow(UnauthorizedError);

    await expect(obtenerDatosWizardAction()).rejects.toThrow(UnauthorizedError);
  });

  it("2. Rechaza cross-tenant: Usuario de Restaurante A intentando modificar Restaurante B", async () => {
    mockAuthUserId = userA.auth_id;
    mockUserEmail = userA.email;
    mockRestauranteActivoId = restB.id; // Cookie adulterada apuntando al restaurante ajeno

    // Paso 1
    await expect(
      guardarPaso1Action("Restaurante Hackeado", "Calle Falsa", "America/Mexico_City", "hacker@evil.com")
    ).rejects.toThrow(UnauthorizedError);

    // Paso 2
    await expect(
      guardarPaso2MenuAction("Plato Malicioso", "Comida", 99.99)
    ).rejects.toThrow(UnauthorizedError);

    // Paso 3
    await expect(
      guardarPaso3MesaAction()
    ).rejects.toThrow(UnauthorizedError);

    // Paso 4
    await expect(
      guardarPaso4InvitarAction("infiltrado@evil.com", "Infiltrado", "dueno")
    ).rejects.toThrow(UnauthorizedError);

    // Lectura de datos wizard
    await expect(
      obtenerDatosWizardAction()
    ).rejects.toThrow(UnauthorizedError);

    // Verificar en Postgres que Restaurante B quedó intacto
    const [restBEnDb] = await db
      .select()
      .from(restaurantes)
      .where(eq(restaurantes.id, restB.id));

    expect(restBEnDb.nombre).toBe(`Restaurante B Victima ${ts}`);
  });

  it("3. Rechaza si el usuario pertenece al restaurante pero NO tiene rol 'dueno' (ej: mesero)", async () => {
    mockAuthUserId = meseroB.auth_id;
    mockUserEmail = meseroB.email;
    mockRestauranteActivoId = restB.id;

    await expect(
      guardarPaso1Action("Intento Mesero", "Dir", "America/Mexico_City")
    ).rejects.toThrow(UnauthorizedError);

    await expect(
      guardarPaso4InvitarAction("amigo@evil.com", "Amigo", "dueno")
    ).rejects.toThrow(UnauthorizedError);
  });

  it("4. Permite la ejecución exitosa al dueño legítimo de Restaurante B", async () => {
    mockAuthUserId = duenoB.auth_id;
    mockUserEmail = duenoB.email;
    mockRestauranteActivoId = restB.id;

    // Paso 1
    const p1 = await guardarPaso1Action(
      "Restaurante B Configurado",
      "Calle Real 456",
      "America/Mexico_City",
      "alertas@victima.com"
    );
    expect(p1.exito).toBe(true);

    // Paso 2
    const p2 = await guardarPaso2MenuAction("Tacos", "Taco Pastor", 25.5);
    expect(p2.exito).toBe(true);

    // Paso 3
    const p3 = await guardarPaso3MesaAction();
    expect(p3.exito).toBe(true);
    expect(p3.mesa?.numero).toBe(1);

    // Paso 4
    const p4 = await guardarPaso4InvitarAction("chef@victima.com", "Chef Oficial", "chef");
    expect(p4.exito).toBe(true);

    // Obtener datos
    const datos = await obtenerDatosWizardAction();
    expect(datos.restaurante.nombre).toBe("Restaurante B Configurado");
    expect(datos.tieneMenu).toBe(true);
    expect(datos.mesaInicial?.numero).toBe(1);
  });
});

describe("Control de Acceso Multi-tenant: lib/cocina-actions.ts", () => {
  const ts = Date.now();
  let restA: any;
  let restB: any;
  let userA: any;
  let chefB: any;
  let ordenB: any;
  let itemB: any;
  let mesaB: any;
  let platB: any;
  let catB: any;

  beforeAll(async () => {
    // 1. Crear Restaurante B con mesa, platillo, orden e item pendiente
    const [b] = await db
      .insert(restaurantes)
      .values({
        nombre: `Cocina Rest B ${ts}`,
        plan: "basico",
      })
      .returning();
    restB = b;

    const [uChef] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_chef_b_${ts}`,
        email: `chef_b_${ts}@victima.com`,
        nombre: "Chef Restaurante B",
      })
      .returning();
    chefB = uChef;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: chefB.id,
      restaurante_id: restB.id,
      rol: "chef",
      activo: true,
    });

    const [m] = await db
      .insert(mesas)
      .values({
        restaurante_id: restB.id,
        numero: 5,
        qr_token: `token_cocina_${ts}`,
      })
      .returning();
    mesaB = m;

    const [c] = await db
      .insert(categoriasMenu)
      .values({
        restaurante_id: restB.id,
        nombre: "Platos Fuertes",
        orden: 1,
      })
      .returning();
    catB = c;

    const [p] = await db
      .insert(platillos)
      .values({
        restaurante_id: restB.id,
        categoria_id: catB.id,
        nombre: "Corte Rib Eye",
        precio: "450.00",
        disponible: true,
      })
      .returning();
    platB = p;

    const [ord] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restB.id,
        mesa_id: mesaB.id,
        total: "450.00",
        estado: "abierta",
      })
      .returning();
    ordenB = ord;

    const [it] = await db
      .insert(ordenItems)
      .values({
        orden_id: ordenB.id,
        platillo_id: platB.id,
        cantidad: 1,
        precio_unitario_congelado: "450.00",
        estado: "pendiente",
      })
      .returning();
    itemB = it;

    // 2. Crear Restaurante A y Usuario A (Atacante / ajeno a Restaurante B)
    const [a] = await db
      .insert(restaurantes)
      .values({
        nombre: `Cocina Rest A ${ts}`,
        plan: "basico",
      })
      .returning();
    restA = a;

    const [uA] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_user_a_cocina_${ts}`,
        email: `usera_cocina_${ts}@atacante.com`,
        nombre: "Usuario Atacante A Cocina",
      })
      .returning();
    userA = uA;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: userA.id,
      restaurante_id: restA.id,
      rol: "chef",
      activo: true,
    });
    // Crear mesero y cajero en Restaurante B para pruebas de roles
    const [uMesero] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_mesero_b_cocina_${ts}`,
        email: `mesero_b_${ts}@victima.com`,
        nombre: "Mesero Restaurante B",
      })
      .returning();

    await db.insert(usuarioRestaurantes).values({
      usuario_id: uMesero.id,
      restaurante_id: restB.id,
      rol: "mesero",
      activo: true,
    });

    const [uCajero] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_cajero_b_cocina_${ts}`,
        email: `cajero_b_${ts}@victima.com`,
        nombre: "Cajero Restaurante B",
      })
      .returning();

    await db.insert(usuarioRestaurantes).values({
      usuario_id: uCajero.id,
      restaurante_id: restB.id,
      rol: "cajero",
      activo: true,
    });

    // Guardar referencias
    (global as any).__test_mesero_b = uMesero;
    (global as any).__test_cajero_b = uCajero;
  });

  afterAll(async () => {
    try {
      if (itemB) await db.delete(ordenItems).where(eq(ordenItems.id, itemB.id));
      if (ordenB) await db.delete(ordenes).where(eq(ordenes.id, ordenB.id));
      if (platB) await db.delete(platillos).where(eq(platillos.id, platB.id));
      if (catB) await db.delete(categoriasMenu).where(eq(categoriasMenu.id, catB.id));
      if (mesaB) await db.delete(mesas).where(eq(mesas.id, mesaB.id));
      if (restB) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restB.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restB.id));
      }
      if (restA) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restA.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restA.id));
      }
      if (chefB) await db.delete(usuarios).where(eq(usuarios.id, chefB.id));
      if (userA) await db.delete(usuarios).where(eq(usuarios.id, userA.id));
      const meseroB = (global as any).__test_mesero_b;
      if (meseroB) await db.delete(usuarios).where(eq(usuarios.id, meseroB.id));
      const cajeroB = (global as any).__test_cajero_b;
      if (cajeroB) await db.delete(usuarios).where(eq(usuarios.id, cajeroB.id));
    } catch (e) {}
  });

  it("1. Rechaza la petición si no hay sesión autenticada", async () => {
    mockAuthUserId = null;
    mockUserEmail = null;
    mockRestauranteActivoId = restB.id;

    const fd = new FormData();
    fd.set("item_id", itemB.id);
    fd.set("estado", "en_preparacion");

    await expect(actualizarEstadoItem(fd)).rejects.toThrow(UnauthorizedError);
  });

  it("2. Rechaza cross-tenant: Usuario de Restaurante A intentando modificar item de Restaurante B", async () => {
    mockAuthUserId = userA.auth_id;
    mockUserEmail = userA.email;

    // Caso 2a: con cookie de su propio restaurante (Restaurante A)
    mockRestauranteActivoId = restA.id;
    const fd1 = new FormData();
    fd1.set("item_id", itemB.id);
    fd1.set("estado", "en_preparacion");

    await expect(actualizarEstadoItem(fd1)).rejects.toThrow(UnauthorizedError);

    // Caso 2b: con cookie adulterada apuntando al Restaurante B ajeno
    mockRestauranteActivoId = restB.id;
    const fd2 = new FormData();
    fd2.set("item_id", itemB.id);
    fd2.set("estado", "en_preparacion");

    await expect(actualizarEstadoItem(fd2)).rejects.toThrow(UnauthorizedError);

    // Confirmar que el item en Postgres sigue pendiente
    const [itemEnDb] = await db
      .select()
      .from(ordenItems)
      .where(eq(ordenItems.id, itemB.id));
    expect(itemEnDb.estado).toBe("pendiente");
  });

  it("3. Rechaza rol no autorizado de cocina (ej: cajero)", async () => {
    const cajeroB = (global as any).__test_cajero_b;
    mockAuthUserId = cajeroB.auth_id;
    mockUserEmail = cajeroB.email;
    mockRestauranteActivoId = restB.id;

    const fd = new FormData();
    fd.set("item_id", itemB.id);
    fd.set("estado", "en_preparacion");

    await expect(actualizarEstadoItem(fd)).rejects.toThrow(UnauthorizedError);
  });

  it("4. Rechaza si rol de sala/runner (mesero) intenta mover item a 'en_preparacion'", async () => {
    const meseroB = (global as any).__test_mesero_b;
    mockAuthUserId = meseroB.auth_id;
    mockUserEmail = meseroB.email;
    mockRestauranteActivoId = restB.id;

    const fd = new FormData();
    fd.set("item_id", itemB.id);
    fd.set("estado", "en_preparacion");

    await expect(actualizarEstadoItem(fd)).rejects.toThrow(UnauthorizedError);
  });

  it("5. Permite a Chef legítimo de Restaurante B transicionar a 'en_preparacion' y 'listo'", async () => {
    mockAuthUserId = chefB.auth_id;
    mockUserEmail = chefB.email;
    mockRestauranteActivoId = restB.id;

    // Mover a en_preparacion
    const fdPrep = new FormData();
    fdPrep.set("item_id", itemB.id);
    fdPrep.set("estado", "en_preparacion");
    await actualizarEstadoItem(fdPrep);

    let [itemEnDb] = await db.select().from(ordenItems).where(eq(ordenItems.id, itemB.id));
    expect(itemEnDb.estado).toBe("en_preparacion");

    // Mover a listo
    const fdListo = new FormData();
    fdListo.set("item_id", itemB.id);
    fdListo.set("estado", "listo");
    await actualizarEstadoItem(fdListo);

    [itemEnDb] = await db.select().from(ordenItems).where(eq(ordenItems.id, itemB.id));
    expect(itemEnDb.estado).toBe("listo");
  });

  it("6. Permite a Mesero / Runner marcar item de 'listo' a 'entregado'", async () => {
    const meseroB = (global as any).__test_mesero_b;
    mockAuthUserId = meseroB.auth_id;
    mockUserEmail = meseroB.email;
    mockRestauranteActivoId = restB.id;

    const fdEntregado = new FormData();
    fdEntregado.set("item_id", itemB.id);
    fdEntregado.set("estado", "entregado");
    await actualizarEstadoItem(fdEntregado);

    const [itemEnDb] = await db.select().from(ordenItems).where(eq(ordenItems.id, itemB.id));
    expect(itemEnDb.estado).toBe("entregado");
  });
});

describe("Control de Acceso Multi-tenant: lib/inventario-actions.ts", () => {
  const ts = Date.now();
  let restA: any;
  let restB: any;
  let userA: any;
  let chefB: any;
  let ingB: any;
  let platB: any;
  let catB: any;
  let recB: any;
  let mesaB: any;
  let ordenB: any;
  let itemB: any;

  beforeAll(async () => {
    // 1. Crear Restaurante B con ingrediente, platillo, receta, orden e item
    const [b] = await db
      .insert(restaurantes)
      .values({
        nombre: `Inventario Rest B ${ts}`,
        plan: "basico",
      })
      .returning();
    restB = b;

    const [uChef] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_chef_b_inv_${ts}`,
        email: `chef_b_inv_${ts}@victima.com`,
        nombre: "Chef B Inventario",
      })
      .returning();
    chefB = uChef;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: chefB.id,
      restaurante_id: restB.id,
      rol: "chef",
      activo: true,
    });

    const [ing] = await db
      .insert(ingredientes)
      .values({
        restaurante_id: restB.id,
        nombre: `Carne B ${ts}`,
        costo_unitario: "50.00",
        stock_actual: "100.000",
        stock_minimo: "10.000",
        unidad_medida: "pieza",
      })
      .returning();
    ingB = ing;

    const [c] = await db
      .insert(categoriasMenu)
      .values({
        restaurante_id: restB.id,
        nombre: "Carnes",
        orden: 1,
      })
      .returning();
    catB = c;

    const [plat] = await db
      .insert(platillos)
      .values({
        restaurante_id: restB.id,
        categoria_id: catB.id,
        nombre: "Corte Especial",
        precio: "250.00",
        disponible: true,
      })
      .returning();
    platB = plat;

    const [rec] = await db
      .insert(recetas)
      .values({
        platillo_id: platB.id,
        ingrediente_id: ingB.id,
        cantidad_requerida: "2.000",
      })
      .returning();
    recB = rec;

    const [m] = await db
      .insert(mesas)
      .values({
        restaurante_id: restB.id,
        numero: 10,
        qr_token: `token_inv_${ts}`,
      })
      .returning();
    mesaB = m;

    const [ord] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restB.id,
        mesa_id: mesaB.id,
        total: "250.00",
        estado: "abierta",
      })
      .returning();
    ordenB = ord;

    const [it] = await db
      .insert(ordenItems)
      .values({
        orden_id: ordenB.id,
        platillo_id: platB.id,
        cantidad: 1,
        precio_unitario_congelado: "250.00",
        estado: "pendiente",
      })
      .returning();
    itemB = it;

    // 2. Crear Restaurante A y Usuario A (Atacante / ajeno a Restaurante B)
    const [a] = await db
      .insert(restaurantes)
      .values({
        nombre: `Inventario Rest A ${ts}`,
        plan: "basico",
      })
      .returning();
    restA = a;

    const [uA] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_user_a_inv_${ts}`,
        email: `usera_inv_${ts}@atacante.com`,
        nombre: "Usuario Atacante A Inv",
      })
      .returning();
    userA = uA;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: userA.id,
      restaurante_id: restA.id,
      rol: "chef",
      activo: true,
    });

    // Crear mesero en Restaurante B
    const [uMesero] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_mesero_b_inv_${ts}`,
        email: `mesero_b_inv_${ts}@victima.com`,
        nombre: "Mesero B Inventario",
      })
      .returning();

    await db.insert(usuarioRestaurantes).values({
      usuario_id: uMesero.id,
      restaurante_id: restB.id,
      rol: "mesero",
      activo: true,
    });

    (global as any).__test_mesero_inv_b = uMesero;
  });

  afterAll(async () => {
    try {
      if (itemB) {
        await db.delete(movimientosInventario).where(eq(movimientosInventario.orden_id, ordenB.id));
        await db.delete(ordenItems).where(eq(ordenItems.id, itemB.id));
      }
      if (ordenB) await db.delete(ordenes).where(eq(ordenes.id, ordenB.id));
      if (mesaB) await db.delete(mesas).where(eq(mesas.id, mesaB.id));
      if (recB) await db.delete(recetas).where(eq(recetas.id, recB.id));
      if (platB) await db.delete(platillos).where(eq(platillos.id, platB.id));
      if (catB) await db.delete(categoriasMenu).where(eq(categoriasMenu.id, catB.id));
      if (ingB) await db.delete(ingredientes).where(eq(ingredientes.id, ingB.id));
      if (restB) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restB.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restB.id));
      }
      if (restA) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restA.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restA.id));
      }
      if (chefB) await db.delete(usuarios).where(eq(usuarios.id, chefB.id));
      if (userA) await db.delete(usuarios).where(eq(usuarios.id, userA.id));
      const meseroB = (global as any).__test_mesero_inv_b;
      if (meseroB) await db.delete(usuarios).where(eq(usuarios.id, meseroB.id));
    } catch (e) {}
  });

  it("1. Rechaza descontar inventario si no hay sesión autenticada", async () => {
    mockAuthUserId = null;
    mockUserEmail = null;
    mockRestauranteActivoId = restB.id;

    const fd = new FormData();
    fd.set("item_id", itemB.id);

    const res = await descontarInventarioPorOrden(null, fd);
    expect(res?.error).toBe("Sesión no iniciada");
  });

  it("2. Rechaza cross-tenant: Usuario de Restaurante A intentando descontar inventario de Restaurante B", async () => {
    mockAuthUserId = userA.auth_id;
    mockUserEmail = userA.email;

    // Caso 2a: con cookie de Restaurante A
    mockRestauranteActivoId = restA.id;
    const fd1 = new FormData();
    fd1.set("item_id", itemB.id);

    const res1 = await descontarInventarioPorOrden(null, fd1);
    expect(res1?.error).toBe("La orden no pertenece al restaurante activo del usuario");

    // Caso 2b: con cookie adulterada apuntando al Restaurante B
    mockRestauranteActivoId = restB.id;
    const fd2 = new FormData();
    fd2.set("item_id", itemB.id);

    const res2 = await descontarInventarioPorOrden(null, fd2);
    expect(res2?.error).toBe("No tienes un vínculo activo con este restaurante");

    // Verificar en Postgres que el stock sigue intacto en 100.000
    const [ingEnDb] = await db
      .select()
      .from(ingredientes)
      .where(eq(ingredientes.id, ingB.id));
    expect(Number(ingEnDb.stock_actual)).toBe(100);
  });

  it("3. Rechaza rol no autorizado para cocina (ej: mesero)", async () => {
    const meseroB = (global as any).__test_mesero_inv_b;
    mockAuthUserId = meseroB.auth_id;
    mockUserEmail = meseroB.email;
    mockRestauranteActivoId = restB.id;

    const fd = new FormData();
    fd.set("item_id", itemB.id);

    const res = await descontarInventarioPorOrden(null, fd);
    expect(res?.error).toBe("Rol no autorizado para gestionar inventario de cocina");

    const [ingEnDb] = await db
      .select()
      .from(ingredientes)
      .where(eq(ingredientes.id, ingB.id));
    expect(Number(ingEnDb.stock_actual)).toBe(100);
  });

  it("4. Permite a Chef legítimo de Restaurante B descontar inventario y marcar listo", async () => {
    mockAuthUserId = chefB.auth_id;
    mockUserEmail = chefB.email;
    mockRestauranteActivoId = restB.id;

    const fd = new FormData();
    fd.set("item_id", itemB.id);

    const res = await descontarInventarioPorOrden(null, fd);
    expect(res).toBeNull(); // Éxito

    // Verificar en Postgres que el stock disminuyó en 2 unidades (100 -> 98)
    const [ingEnDb] = await db
      .select()
      .from(ingredientes)
      .where(eq(ingredientes.id, ingB.id));
    expect(Number(ingEnDb.stock_actual)).toBe(98);

    // Verificar que el item se marcó como listo
    const [itemEnDb] = await db
      .select()
      .from(ordenItems)
      .where(eq(ordenItems.id, itemB.id));
    expect(itemEnDb.estado).toBe("listo");
  });
});

describe("Control de Acceso Multi-tenant: lib/recibo-actions.ts", () => {
  const ts = Date.now();
  let restA: any;
  let restB: any;
  let userA: any;
  let duenoB: any;
  let mesaB: any;
  let catB: any;
  let platB: any;
  let ordenB: any;
  let itemB: any;

  beforeAll(async () => {
    // 1. Crear Restaurante B con mesa, platillo, orden e item
    const [b] = await db
      .insert(restaurantes)
      .values({
        nombre: `Recibos Rest B ${ts}`,
        plan: "basico",
      })
      .returning();
    restB = b;

    const [uDueno] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_dueno_b_rec_${ts}`,
        email: `dueno_b_rec_${ts}@victima.com`,
        nombre: "Dueño B Recibos",
      })
      .returning();
    duenoB = uDueno;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: duenoB.id,
      restaurante_id: restB.id,
      rol: "dueno",
      activo: true,
    });

    const [m] = await db
      .insert(mesas)
      .values({
        restaurante_id: restB.id,
        numero: 7,
        qr_token: `token_rec_${ts}`,
      })
      .returning();
    mesaB = m;

    const [c] = await db
      .insert(categoriasMenu)
      .values({
        restaurante_id: restB.id,
        nombre: "Bebidas",
        orden: 1,
      })
      .returning();
    catB = c;

    const [plat] = await db
      .insert(platillos)
      .values({
        restaurante_id: restB.id,
        categoria_id: catB.id,
        nombre: "Vino Tinto Reserva",
        precio: "850.00",
        disponible: true,
      })
      .returning();
    platB = plat;

    const [ord] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restB.id,
        mesa_id: mesaB.id,
        total: "850.00",
        estado: "abierta",
      })
      .returning();
    ordenB = ord;

    const [it] = await db
      .insert(ordenItems)
      .values({
        orden_id: ordenB.id,
        platillo_id: platB.id,
        cantidad: 1,
        precio_unitario_congelado: "850.00",
        estado: "listo",
      })
      .returning();
    itemB = it;

    // 2. Crear Restaurante A y Usuario A (Atacante / ajeno a Restaurante B)
    const [a] = await db
      .insert(restaurantes)
      .values({
        nombre: `Recibos Rest A ${ts}`,
        plan: "basico",
      })
      .returning();
    restA = a;

    const [uA] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_user_a_rec_${ts}`,
        email: `usera_rec_${ts}@atacante.com`,
        nombre: "Usuario Atacante A Recibos",
      })
      .returning();
    userA = uA;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: userA.id,
      restaurante_id: restA.id,
      rol: "dueno",
      activo: true,
    });
  });

  afterAll(async () => {
    try {
      if (itemB) await db.delete(ordenItems).where(eq(ordenItems.id, itemB.id));
      if (ordenB) await db.delete(ordenes).where(eq(ordenes.id, ordenB.id));
      if (platB) await db.delete(platillos).where(eq(platillos.id, platB.id));
      if (catB) await db.delete(categoriasMenu).where(eq(categoriasMenu.id, catB.id));
      if (mesaB) await db.delete(mesas).where(eq(mesas.id, mesaB.id));
      if (restB) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restB.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restB.id));
      }
      if (restA) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restA.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restA.id));
      }
      if (duenoB) await db.delete(usuarios).where(eq(usuarios.id, duenoB.id));
      if (userA) await db.delete(usuarios).where(eq(usuarios.id, userA.id));
    } catch (e) {}
  });

  it("1. Rechaza obtener datos de recibo si no hay sesión autenticada", async () => {
    mockAuthUserId = null;
    mockUserEmail = null;
    mockRestauranteActivoId = restB.id;

    await expect(obtenerDatosReciboAction(ordenB.id)).rejects.toThrow(UnauthorizedError);
  });

  it("2. Rechaza cross-tenant: Usuario de Restaurante A intentando leer recibo de Restaurante B", async () => {
    mockAuthUserId = userA.auth_id;
    mockUserEmail = userA.email;

    // Caso 2a: con cookie de Restaurante A
    mockRestauranteActivoId = restA.id;
    await expect(obtenerDatosReciboAction(ordenB.id)).rejects.toThrow();

    // Caso 2b: con cookie adulterada apuntando al Restaurante B ajeno
    mockRestauranteActivoId = restB.id;
    await expect(obtenerDatosReciboAction(ordenB.id)).rejects.toThrow(UnauthorizedError);
  });

  it("3. Permite a usuario vinculado legítimamente a Restaurante B obtener el recibo", async () => {
    mockAuthUserId = duenoB.auth_id;
    mockUserEmail = duenoB.email;
    mockRestauranteActivoId = restB.id;

    const recibo = await obtenerDatosReciboAction(ordenB.id);
    expect(recibo).toBeDefined();
    expect(recibo.total).toBe(850);
    expect(recibo.items.length).toBe(1);
    expect(recibo.items[0].platillo).toBe("Vino Tinto Reserva");
  });
});

describe("Control de Acceso Multi-tenant: app/api/kds/item/[id]/route.ts", () => {
  const ts = Date.now();
  let restA: any;
  let restB: any;
  let userA: any;
  let chefB: any;
  let mesaB: any;
  let catB: any;
  let platB: any;
  let ordenB: any;
  let itemB: any;

  beforeAll(async () => {
    // 1. Crear Restaurante B con mesa, platillo, orden e item KDS
    const [b] = await db
      .insert(restaurantes)
      .values({
        nombre: `KDS Route Rest B ${ts}`,
        plan: "basico",
      })
      .returning();
    restB = b;

    const [uChef] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_chef_b_kdsroute_${ts}`,
        email: `chef_b_kdsroute_${ts}@victima.com`,
        nombre: "Chef B KDS Route",
      })
      .returning();
    chefB = uChef;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: chefB.id,
      restaurante_id: restB.id,
      rol: "chef",
      activo: true,
    });

    const [m] = await db
      .insert(mesas)
      .values({
        restaurante_id: restB.id,
        numero: 14,
        qr_token: `token_kdsroute_${ts}`,
      })
      .returning();
    mesaB = m;

    const [c] = await db
      .insert(categoriasMenu)
      .values({
        restaurante_id: restB.id,
        nombre: "Hamburguesas",
        orden: 1,
      })
      .returning();
    catB = c;

    const [plat] = await db
      .insert(platillos)
      .values({
        restaurante_id: restB.id,
        categoria_id: catB.id,
        nombre: "Hamburguesa Gourmet KDS",
        precio: "180.00",
        disponible: true,
      })
      .returning();
    platB = plat;

    const [ord] = await db
      .insert(ordenes)
      .values({
        restaurante_id: restB.id,
        mesa_id: mesaB.id,
        total: "360.00",
        estado: "abierta",
      })
      .returning();
    ordenB = ord;

    const [it] = await db
      .insert(ordenItems)
      .values({
        orden_id: ordenB.id,
        platillo_id: platB.id,
        cantidad: 2,
        precio_unitario_congelado: "180.00",
        notas: "Sin pepinillos, muy cocida",
        estado: "pendiente",
      })
      .returning();
    itemB = it;

    // 2. Crear Restaurante A y Usuario A (Atacante / ajeno a Restaurante B)
    const [a] = await db
      .insert(restaurantes)
      .values({
        nombre: `KDS Route Rest A ${ts}`,
        plan: "basico",
      })
      .returning();
    restA = a;

    const [uA] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth_user_a_kdsroute_${ts}`,
        email: `usera_kdsroute_${ts}@atacante.com`,
        nombre: "Usuario Atacante A KDS Route",
      })
      .returning();
    userA = uA;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: userA.id,
      restaurante_id: restA.id,
      rol: "chef",
      activo: true,
    });
  });

  afterAll(async () => {
    try {
      if (itemB) await db.delete(ordenItems).where(eq(ordenItems.id, itemB.id));
      if (ordenB) await db.delete(ordenes).where(eq(ordenes.id, ordenB.id));
      if (platB) await db.delete(platillos).where(eq(platillos.id, platB.id));
      if (catB) await db.delete(categoriasMenu).where(eq(categoriasMenu.id, catB.id));
      if (mesaB) await db.delete(mesas).where(eq(mesas.id, mesaB.id));
      if (restB) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restB.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restB.id));
      }
      if (restA) {
        await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restA.id));
        await db.delete(restaurantes).where(eq(restaurantes.id, restA.id));
      }
      if (chefB) await db.delete(usuarios).where(eq(usuarios.id, chefB.id));
      if (userA) await db.delete(usuarios).where(eq(usuarios.id, userA.id));
    } catch (e) {}
  });

  it("1. Rechaza acceso al endpoint KDS si no hay sesión autenticada", async () => {
    mockAuthUserId = null;
    mockUserEmail = null;
    mockRestauranteActivoId = restB.id;

    const req = new NextRequest(`http://localhost:3000/api/kds/item/${itemB.id}`);
    const res = await getKdsItemRoute(req, { params: Promise.resolve({ id: itemB.id }) });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Sesión no iniciada");
  });

  it("2. Rechaza cross-tenant: Usuario de Restaurante A intentando leer item de Restaurante B", async () => {
    mockAuthUserId = userA.auth_id;
    mockUserEmail = userA.email;

    // Caso 2a: con cookie de Restaurante A -> 404 (el item no pertenece a su restaurante)
    mockRestauranteActivoId = restA.id;
    const req1 = new NextRequest(`http://localhost:3000/api/kds/item/${itemB.id}`);
    const res1 = await getKdsItemRoute(req1, { params: Promise.resolve({ id: itemB.id }) });
    expect(res1.status).toBe(404);

    // Caso 2b: con cookie adulterada apuntando al Restaurante B ajeno -> 403 (no autorizado para este restaurante)
    mockRestauranteActivoId = restB.id;
    const req2 = new NextRequest(`http://localhost:3000/api/kds/item/${itemB.id}`);
    const res2 = await getKdsItemRoute(req2, { params: Promise.resolve({ id: itemB.id }) });
    expect(res2.status).toBe(403);
    const body2 = await res2.json();
    expect(body2.error).toBe("No autorizado para este restaurante");
  });

  it("3. Permite a Chef legítimo de Restaurante B consultar información del item", async () => {
    mockAuthUserId = chefB.auth_id;
    mockUserEmail = chefB.email;
    mockRestauranteActivoId = restB.id;

    const req = new NextRequest(`http://localhost:3000/api/kds/item/${itemB.id}`);
    const res = await getKdsItemRoute(req, { params: Promise.resolve({ id: itemB.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(itemB.id);
    expect(body.platillo_nombre).toBe("Hamburguesa Gourmet KDS");
    expect(body.mesa_numero).toBe(14);
    expect(body.notas).toBe("Sin pepinillos, muy cocida");
  });
});




