import { db } from "@/db";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Aplicando políticas RLS de Fase 9.3 en PostgreSQL...");

  // Habilitar RLS en las 3 nuevas tablas
  await db.execute(sql`ALTER TABLE asignaciones_mesa ENABLE ROW LEVEL SECURITY;`);
  await db.execute(sql`ALTER TABLE solicitudes_cancelacion_item ENABLE ROW LEVEL SECURITY;`);
  await db.execute(sql`ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;`);

  // Grant a authenticated para que evalúe RLS
  await db.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON asignaciones_mesa TO authenticated;`);
  await db.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON solicitudes_cancelacion_item TO authenticated;`);
  await db.execute(sql`GRANT SELECT, INSERT ON pagos TO authenticated;`);

  // Actualizar políticas de turnos
  await db.execute(sql`DROP POLICY IF EXISTS "turnos_insert" ON turnos;`);
  await db.execute(sql`
    CREATE POLICY "turnos_insert" ON turnos
      FOR INSERT WITH CHECK (
        restaurante_id IN (
          SELECT ur.restaurante_id FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.activo = true
            AND ur.rol IN ('mesero', 'cajero', 'gerente', 'dueno')
        )
      );
  `);

  await db.execute(sql`DROP POLICY IF EXISTS "turnos_update_mesero" ON turnos;`);
  await db.execute(sql`DROP POLICY IF EXISTS "turnos_update_operativo" ON turnos;`);
  await db.execute(sql`
    CREATE POLICY "turnos_update_operativo" ON turnos
      FOR UPDATE
      USING (
        estado = 'abierto'
        AND restaurante_id IN (
          SELECT ur.restaurante_id FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.activo = true
            AND ur.rol IN ('mesero', 'cajero')
        )
      )
      WITH CHECK (
        estado = 'abierto'
        AND restaurante_id IN (
          SELECT ur.restaurante_id FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.activo = true
            AND ur.rol IN ('mesero', 'cajero')
        )
      );
  `);

  // Políticas asignaciones_mesa
  await db.execute(sql`DROP POLICY IF EXISTS "asignaciones_mesa_select" ON asignaciones_mesa;`);
  await db.execute(sql`
    CREATE POLICY "asignaciones_mesa_select" ON asignaciones_mesa
      FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));
  `);

  await db.execute(sql`DROP POLICY IF EXISTS "asignaciones_mesa_write" ON asignaciones_mesa;`);
  await db.execute(sql`
    CREATE POLICY "asignaciones_mesa_write" ON asignaciones_mesa
      FOR ALL
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

  // Políticas solicitudes_cancelacion_item
  await db.execute(sql`DROP POLICY IF EXISTS "solicitudes_cancelacion_select" ON solicitudes_cancelacion_item;`);
  await db.execute(sql`
    CREATE POLICY "solicitudes_cancelacion_select" ON solicitudes_cancelacion_item
      FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));
  `);

  await db.execute(sql`DROP POLICY IF EXISTS "solicitudes_cancelacion_insert" ON solicitudes_cancelacion_item;`);
  await db.execute(sql`
    CREATE POLICY "solicitudes_cancelacion_insert" ON solicitudes_cancelacion_item
      FOR INSERT WITH CHECK (
        restaurante_id IN (
          SELECT ur.restaurante_id FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.activo = true
            AND ur.rol IN ('mesero', 'cajero', 'gerente', 'dueno')
        )
      );
  `);

  await db.execute(sql`DROP POLICY IF EXISTS "solicitudes_cancelacion_update_resolucion" ON solicitudes_cancelacion_item;`);
  await db.execute(sql`
    CREATE POLICY "solicitudes_cancelacion_update_resolucion" ON solicitudes_cancelacion_item
      FOR UPDATE
      USING (
        estado = 'pendiente'
        AND restaurante_id IN (
          SELECT ur.restaurante_id FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.activo = true
            AND ur.rol IN ('gerente', 'dueno')
        )
      )
      WITH CHECK (
        estado IN ('aprobada', 'rechazada')
        AND restaurante_id IN (
          SELECT ur.restaurante_id FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.activo = true
            AND ur.rol IN ('gerente', 'dueno')
        )
      );
  `);

  // Políticas pagos (append-only)
  await db.execute(sql`DROP POLICY IF EXISTS "pagos_select" ON pagos;`);
  await db.execute(sql`
    CREATE POLICY "pagos_select" ON pagos
      FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));
  `);

  await db.execute(sql`DROP POLICY IF EXISTS "pagos_insert" ON pagos;`);
  await db.execute(sql`
    CREATE POLICY "pagos_insert" ON pagos
      FOR INSERT WITH CHECK (
        restaurante_id IN (
          SELECT ur.restaurante_id FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.activo = true
            AND ur.rol IN ('mesero', 'cajero', 'gerente', 'dueno')
        )
      );
  `);

  console.log("✓ Políticas RLS de Fase 9.3 aplicadas con éxito.");
  process.exit(0);
}

run().catch((e) => {
  console.error("Error aplicando RLS:", e);
  process.exit(1);
});

