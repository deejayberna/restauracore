import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  restaurantes,
  usuarios,
  usuarioRestaurantes,
  mesas,
  asignacionesMesa,
  logAuditoria,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  listarPersonalRestauranteAction,
  invitarPersonalAction,
  cambiarRolPersonalAction,
  alternarEstadoPersonalAction,
} from "@/lib/personal-actions";
import { asignarMeseroMesaAction } from "@/lib/mesas-actions";
import { consultarAuditoriaAction } from "@/lib/auditoria-actions";
import { UnauthorizedError } from "@/lib/errors";

// Control dinámico de la sesión en los tests
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

// Mock de Supabase Admin para evitar llamadas de red en creación de invitaciones
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async (email: string) => ({
          data: { user: { id: `auth-invited-${Date.now()}-${Math.random().toString(36).substring(7)}`, email } },
          error: null,
        })),
      },
    },
  })),
}));

describe("Fase 10 — Gestión de Personal, Jerarquía de Permisos y Auditoría", () => {
  let testRestauranteId: string;
  let duenoUser: { id: string; auth_id: string };
  let gerenteUser: { id: string; auth_id: string };
  let meseroUser: { id: string; auth_id: string };
  let mesaTest: { id: string; numero: number };

  beforeAll(async () => {
    // 1. Crear restaurante de prueba
    const [rest] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Test Fase 10 ${Date.now()}`,
        timezone: "America/Mexico_City",
        plan: "pro",
      })
      .returning();
    testRestauranteId = rest.id;
    mockRestauranteActivoId = rest.id;

    // 2. Crear usuario Dueño
    const [dueno] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-dueno-${Date.now()}`,
        nombre: "Don Dueño Test",
        email: `dueno-${Date.now()}@restauracore.test`,
        activo: true,
      })
      .returning();
    duenoUser = dueno;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: dueno.id,
      restaurante_id: testRestauranteId,
      rol: "dueno",
      activo: true,
      invitacion_pendiente: false,
    });

    // 3. Crear usuario Gerente
    const [gerente] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-gerente-${Date.now()}`,
        nombre: "Gerente Operativo Test",
        email: `gerente-${Date.now()}@restauracore.test`,
        activo: true,
      })
      .returning();
    gerenteUser = gerente;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: gerente.id,
      restaurante_id: testRestauranteId,
      rol: "gerente",
      activo: true,
      invitacion_pendiente: false,
    });

    // 4. Crear usuario Mesero
    const [mesero] = await db
      .insert(usuarios)
      .values({
        auth_id: `auth-mesero-${Date.now()}`,
        nombre: "Mesero Test",
        email: `mesero-${Date.now()}@restauracore.test`,
        activo: true,
      })
      .returning();
    meseroUser = mesero;

    await db.insert(usuarioRestaurantes).values({
      usuario_id: mesero.id,
      restaurante_id: testRestauranteId,
      rol: "mesero",
      activo: true,
      invitacion_pendiente: false,
    });

    // 5. Crear mesa de prueba
    const [mesa] = await db
      .insert(mesas)
      .values({
        restaurante_id: testRestauranteId,
        numero: 101,
        qr_token: `qr-mesa-fase10-${Date.now()}`,
      })
      .returning();
    mesaTest = mesa;
  });

  afterAll(async () => {
    // Limpieza de datos creados en el test
    await db.delete(asignacionesMesa).where(eq(asignacionesMesa.restaurante_id, testRestauranteId));
    await db.delete(logAuditoria).where(eq(logAuditoria.restaurante_id, testRestauranteId));
    await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, testRestauranteId));
    await db.delete(mesas).where(eq(mesas.restaurante_id, testRestauranteId));
    await db.delete(restaurantes).where(eq(restaurantes.id, testRestauranteId));
  });

  it("1. Listado de personal: disponible para gerente y dueño, denegado para mesero", async () => {
    // Caso A: Mesero no autorizado
    mockAuthUserId = meseroUser.auth_id;
    await expect(listarPersonalRestauranteAction()).rejects.toThrow(UnauthorizedError);

    // Caso B: Gerente autorizado
    mockAuthUserId = gerenteUser.auth_id;
    const lista = await listarPersonalRestauranteAction();
    expect(lista.length).toBeGreaterThanOrEqual(3);
    const roles = lista.map((l) => l.rol);
    expect(roles).toContain("dueno");
    expect(roles).toContain("gerente");
    expect(roles).toContain("mesero");
  });

  it("2. Jerarquía de roles al invitar: gerente no puede invitar dueño ni gerente", async () => {
    mockAuthUserId = gerenteUser.auth_id;

    // Gerente intentando invitar a un Dueño
    await expect(
      invitarPersonalAction({
        nombre: "Intento Fraude Dueño",
        email: "intento-dueno@test.com",
        rol: "dueno",
      })
    ).rejects.toThrow(/Un gerente no tiene permisos para asignar roles de Gerente o Dueño/);

    // Gerente intentando invitar a otro Gerente
    await expect(
      invitarPersonalAction({
        nombre: "Intento Fraude Gerente",
        email: "intento-gerente@test.com",
        rol: "gerente",
      })
    ).rejects.toThrow(/Un gerente no tiene permisos para asignar roles de Gerente o Dueño/);
  });

  it("3. Flujo de invitación segura: nuevo empleado queda con invitacion_pendiente = true", async () => {
    mockAuthUserId = gerenteUser.auth_id;

    const emailNuevo = `nuevo-mesero-${Date.now()}@test.com`;
    const res = await invitarPersonalAction({
      nombre: "Nuevo Ayudante",
      email: emailNuevo,
      rol: "mesero",
    });

    expect(res.ok).toBe(true);

    // Verificar en BD que invitacion_pendiente = true
    const vinculo = await db.query.usuarioRestaurantes.findFirst({
      where: and(
        eq(usuarioRestaurantes.usuario_id, res.usuario_id),
        eq(usuarioRestaurantes.restaurante_id, testRestauranteId)
      ),
    });

    expect(vinculo).toBeDefined();
    expect(vinculo?.invitacion_pendiente).toBe(true);
    expect(vinculo?.activo).toBe(true);
    expect(vinculo?.rol).toBe("mesero");

    // Verificar log de auditoría
    const audit = await db.query.logAuditoria.findFirst({
      where: and(
        eq(logAuditoria.restaurante_id, testRestauranteId),
        eq(logAuditoria.accion, "INVITACION_PERSONAL")
      ),
    });
    expect(audit).toBeDefined();
  });

  it("4. Jerarquía al modificar rol: gerente no puede modificar dueños ni asignar roles superiores", async () => {
    mockAuthUserId = gerenteUser.auth_id;

    // Gerente intentando degradar al dueño
    await expect(
      cambiarRolPersonalAction({
        usuario_id: duenoUser.id,
        nuevo_rol: "mesero",
      })
    ).rejects.toThrow(/Un gerente no puede modificar los roles de Gerentes o Dueños existentes/);

    // Gerente intentando ascender al mesero a Gerente
    await expect(
      cambiarRolPersonalAction({
        usuario_id: meseroUser.id,
        nuevo_rol: "gerente",
      })
    ).rejects.toThrow(/Un gerente no puede asignar roles de Gerente o Dueño/);
  });

  it("5. Dueño sí tiene permisos para cambiar roles operativos", async () => {
    mockAuthUserId = duenoUser.auth_id;

    // Dueño cambia mesero a cajero
    const res = await cambiarRolPersonalAction({
      usuario_id: meseroUser.id,
      nuevo_rol: "cajero",
    });
    expect(res.ok).toBe(true);

    const vinculo = await db.query.usuarioRestaurantes.findFirst({
      where: and(
        eq(usuarioRestaurantes.usuario_id, meseroUser.id),
        eq(usuarioRestaurantes.restaurante_id, testRestauranteId)
      ),
    });
    expect(vinculo?.rol).toBe("cajero");

    // Regresar a mesero
    await cambiarRolPersonalAction({
      usuario_id: meseroUser.id,
      nuevo_rol: "mesero",
    });
  });

  it("6. Protección del último dueño: bloquea degradar al único dueño activo", async () => {
    mockAuthUserId = duenoUser.auth_id;

    // Dueño intentando degradarse a sí mismo a mesero (es el único dueño)
    await expect(
      cambiarRolPersonalAction({
        usuario_id: duenoUser.id,
        nuevo_rol: "mesero",
      })
    ).rejects.toThrow(/El restaurante no puede quedarse sin un Dueño activo/);
  });

  it("7. Activación / Desactivación: no permite auto-desactivarse ni desactivar al último dueño", async () => {
    mockAuthUserId = duenoUser.auth_id;

    // Auto-desactivación
    await expect(
      alternarEstadoPersonalAction({
        usuario_id: duenoUser.id,
        activo: false,
      })
    ).rejects.toThrow(/No puedes desactivar tu propia cuenta/);

    // Desactivar mesero (válido)
    const resDesact = await alternarEstadoPersonalAction({
      usuario_id: meseroUser.id,
      activo: false,
    });
    expect(resDesact.ok).toBe(true);

    let vinculo = await db.query.usuarioRestaurantes.findFirst({
      where: and(
        eq(usuarioRestaurantes.usuario_id, meseroUser.id),
        eq(usuarioRestaurantes.restaurante_id, testRestauranteId)
      ),
    });
    expect(vinculo?.activo).toBe(false);

    // Reactivar mesero
    const resAct = await alternarEstadoPersonalAction({
      usuario_id: meseroUser.id,
      activo: true,
    });
    expect(resAct.ok).toBe(true);

    vinculo = await db.query.usuarioRestaurantes.findFirst({
      where: and(
        eq(usuarioRestaurantes.usuario_id, meseroUser.id),
        eq(usuarioRestaurantes.restaurante_id, testRestauranteId)
      ),
    });
    expect(vinculo?.activo).toBe(true);
  });

  it("8. Asignación operativa de mesas a meseros", async () => {
    mockAuthUserId = gerenteUser.auth_id;

    const res = await asignarMeseroMesaAction({
      mesa_id: mesaTest.id,
      mesero_id: meseroUser.id,
    });

    expect(res.ok).toBe(true);

    const asignacion = await db.query.asignacionesMesa.findFirst({
      where: and(
        eq(asignacionesMesa.restaurante_id, testRestauranteId),
        eq(asignacionesMesa.mesa_id, mesaTest.id)
      ),
    });

    expect(asignacion).toBeDefined();
    expect(asignacion?.mesero_id).toBe(meseroUser.id);
  });

  it("9. Control de acceso estricto a /auditoria: exclusivo para rol 'dueno'", async () => {
    // Gerente no autorizado
    mockAuthUserId = gerenteUser.auth_id;
    await expect(consultarAuditoriaAction()).rejects.toThrow(UnauthorizedError);

    // Mesero no autorizado
    mockAuthUserId = meseroUser.auth_id;
    await expect(consultarAuditoriaAction()).rejects.toThrow(UnauthorizedError);

    // Dueño autorizado
    mockAuthUserId = duenoUser.auth_id;
    const auditoria = await consultarAuditoriaAction({ page: 1, pageSize: 10 });
    expect(auditoria.filas).toBeDefined();
    expect(Array.isArray(auditoria.filas)).toBe(true);
    expect(auditoria.total).toBeGreaterThanOrEqual(1);
  });
});

