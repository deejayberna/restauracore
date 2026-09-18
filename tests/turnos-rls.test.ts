import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { restaurantes, usuarios, usuarioRestaurantes, turnos } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("RLS — Tabla turnos", () => {
  it("habilita RLS y aplica las políticas segregadas de actualización en PostgreSQL", async () => {
    // 1. Habilitar RLS en turnos
    await db.execute(sql`ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;`);

    // Otorgar permisos DML al rol 'authenticated' para que las políticas RLS gobiernen el acceso
    await db.execute(sql`GRANT SELECT, INSERT, UPDATE ON turnos TO authenticated;`);
    await db.execute(sql`GRANT SELECT ON usuario_restaurantes TO authenticated;`);
    await db.execute(sql`GRANT SELECT ON usuarios TO authenticated;`);

    // 2. Crear o actualizar políticas en PostgreSQL
    await db.execute(sql`DROP POLICY IF EXISTS "turnos_select" ON turnos;`);
    await db.execute(sql`
      CREATE POLICY "turnos_select" ON turnos
        FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));
    `);

    await db.execute(sql`DROP POLICY IF EXISTS "turnos_insert" ON turnos;`);
    await db.execute(sql`
      CREATE POLICY "turnos_insert" ON turnos
        FOR INSERT WITH CHECK (
          restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
              AND ur.rol IN ('mesero', 'gerente', 'dueno')
          )
        );
    `);

    // Eliminar política unificada anterior si existía
    await db.execute(sql`DROP POLICY IF EXISTS "turnos_update" ON turnos;`);

    // Política segregada para Mesero: solo sobre turnos abiertos y el nuevo valor DEBE ser abierto
    await db.execute(sql`DROP POLICY IF EXISTS "turnos_update_mesero" ON turnos;`);
    await db.execute(sql`
      CREATE POLICY "turnos_update_mesero" ON turnos
        FOR UPDATE
        USING (
          estado = 'abierto'
          AND restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
              AND ur.rol = 'mesero'
          )
        )
        WITH CHECK (
          estado = 'abierto'
          AND restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
              AND ur.rol = 'mesero'
          )
        );
    `);

    // Política segregada para Supervisores: exclusiva para gerente y dueno (pueden cambiar a cerrado)
    await db.execute(sql`DROP POLICY IF EXISTS "turnos_update_supervisor" ON turnos;`);
    await db.execute(sql`
      CREATE POLICY "turnos_update_supervisor" ON turnos
        FOR UPDATE
        USING (
          restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
              AND ur.rol IN ('gerente', 'dueno')
          )
        )
        WITH CHECK (
          restaurante_id IN (
            SELECT ur.restaurante_id FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.activo = true
              AND ur.rol IN ('gerente', 'dueno')
          )
        );
    `);

    // 3. Consultar los catálogos del sistema de PostgreSQL para validar el estado de RLS
    const [rowSecurityResult] = (await db.execute(sql`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'turnos';
    `)) as unknown as Array<{ tablename: string; rowsecurity: boolean }>;

    expect(rowSecurityResult).toBeDefined();
    expect(rowSecurityResult.tablename).toBe("turnos");
    expect(rowSecurityResult.rowsecurity).toBe(true);

    // 4. Validar las políticas creadas en pg_policies
    const policies = (await db.execute(sql`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'turnos';
    `)) as unknown as Array<{ policyname: string; cmd: string }>;

    const policyNames = policies.map((p) => p.policyname);
    expect(policyNames).toContain("turnos_select");
    expect(policyNames).toContain("turnos_insert");
    expect(policyNames).toContain("turnos_update_mesero");
    expect(policyNames).toContain("turnos_update_supervisor");

    // 5. Garantía de auditoría: NO debe existir ninguna política de DELETE en turnos
    const deletePolicies = policies.filter((p) => p.cmd === "DELETE");
    expect(deletePolicies).toHaveLength(0);
  });

  it("rechaza a nivel de PostgreSQL RLS (no por aplicación) que un mesero cambie el estado a cerrado", async () => {
    // 1. Preparar datos reales en la base de datos
    const timestamp = Date.now();
    const [restaurante] = await db
      .insert(restaurantes)
      .values({
        nombre: `Restaurante Test RLS ${timestamp}`,
      })
      .returning();

    const authIdMesero = crypto.randomUUID();
    const [usuarioMesero] = await db
      .insert(usuarios)
      .values({
        auth_id: authIdMesero,
        email: `mesero-${timestamp}@test.com`,
        nombre: "Mesero Test RLS",
      })
      .returning();

    await db.insert(usuarioRestaurantes).values({
      usuario_id: usuarioMesero.id,
      restaurante_id: restaurante.id,
      rol: "mesero",
      activo: true,
    });

    const [turno] = await db
      .insert(turnos)
      .values({
        restaurante_id: restaurante.id,
        codigo: `TURNO-RLS-${timestamp}`,
        estado: "abierto",
        abierto_por: usuarioMesero.id,
      })
      .returning();

    let usuarioGerente: any = null;

    try {
      // 2. Simular conexión autenticada con rol 'mesero' a nivel PostgreSQL
      // En una transacción scoped con SET LOCAL role = authenticated
      let errorCapturado: any = null;

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL role = authenticated;`);
          await tx.execute(
            sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: authIdMesero })}, true);`
          );

          // El mesero intenta directamente cambiar estado = 'cerrado' en PostgreSQL
          // La RLS debe rechazar este UPDATE antes de que llegue a aplicarse
          await tx.execute(sql`
            UPDATE turnos
            SET estado = 'cerrado'
            WHERE id = ${turno.id};
          `);
        });
      } catch (err) {
        // postgres.js envuelve el error de PostgreSQL en .cause:
        //   err.message = "Failed query: UPDATE ..."
        //   err.cause.message = "new row violates row-level security policy for table \"turnos\""
        //   err.cause.code = "42501"
        errorCapturado = err;
      }

      // 3. ASIGNACIÓN Y VALIDACIÓN DEL RECHAZO EN POSTGRESQL RLS:
      // Debe haber sido rechazado DIRECTAMENTE por el motor de base de datos
      expect(errorCapturado).not.toBeNull();

      // postgres.js envuelve el error real de PostgreSQL en la propiedad .cause
      const causeMsg = String(errorCapturado?.cause?.message ?? "").toLowerCase();
      const causeCode = String(errorCapturado?.cause?.code ?? "");
      const esViolacionRLS = causeMsg.includes("row-level security") || causeCode === "42501";

      expect(esViolacionRLS).toBe(true);
      expect(causeCode).toBe("42501");

      // 4. Verificar que un mesero SÍ PUEDE actualizar campos permitidos (ej. notas) si el estado permanece 'abierto'
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL role = authenticated;`);
        await tx.execute(
          sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: authIdMesero })}, true);`
        );

        await tx.execute(sql`
          UPDATE turnos
          SET notas = 'Entrega de turno preliminar por mesero'
          WHERE id = ${turno.id};
        `);
      });

      // Constatar que la actualización de notas sí ocurrió y el estado sigue 'abierto'
      const turnoActualizado = await db.query.turnos.findFirst({
        where: eq(turnos.id, turno.id),
      });
      expect(turnoActualizado?.notas).toBe("Entrega de turno preliminar por mesero");
      expect(turnoActualizado?.estado).toBe("abierto");

      // 5. Verificar que un usuario con rol 'gerente' o 'dueno' SÍ PUEDE cambiar el estado a 'cerrado' exitosamente
      const authIdGerente = crypto.randomUUID();
      [usuarioGerente] = await db
        .insert(usuarios)
        .values({
          auth_id: authIdGerente,
          email: `gerente-rls-${timestamp}@test.com`,
          nombre: "Gerente Test RLS",
        })
        .returning();

      await db.insert(usuarioRestaurantes).values({
        usuario_id: usuarioGerente.id,
        restaurante_id: restaurante.id,
        rol: "gerente",
        activo: true,
      });

      // El gerente ejecuta el mismo UPDATE que le fue denegado al mesero
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL role = authenticated;`);
        await tx.execute(
          sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: authIdGerente })}, true);`
        );

        await tx.execute(sql`
          UPDATE turnos
          SET estado = 'cerrado'
          WHERE id = ${turno.id};
        `);
      });

      // Constatar que en PostgreSQL el estado cambió exitosamente a 'cerrado'
      const turnoCerradoPorGerente = await db.query.turnos.findFirst({
        where: eq(turnos.id, turno.id),
      });
      expect(turnoCerradoPorGerente?.estado).toBe("cerrado");
    } finally {
      // Limpieza garantizada
      await db.delete(turnos).where(eq(turnos.id, turno.id));
      await db.delete(usuarioRestaurantes).where(eq(usuarioRestaurantes.restaurante_id, restaurante.id));
      await db.delete(usuarios).where(eq(usuarios.id, usuarioMesero.id));
      if (usuarioGerente?.id) {
        await db.delete(usuarios).where(eq(usuarios.id, usuarioGerente.id));
      }
      await db.delete(restaurantes).where(eq(restaurantes.id, restaurante.id));
    }
  });
});
