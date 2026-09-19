-- ============================================================
-- Row Level Security & Triggers — RestauraCore
-- Aplicar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- Archivo unificado y reproducible para Producción y Staging
-- ============================================================

-- ─── 0. Grants explícitos para el rol authenticated ───────────
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- ─── 1. Función helper: restaurantes activos del usuario actual ───
CREATE OR REPLACE FUNCTION restaurantes_activos_del_usuario()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ur.restaurante_id
  FROM usuario_restaurantes ur
  JOIN usuarios u ON u.id = ur.usuario_id
  WHERE u.auth_id = auth.uid()::text
    AND ur.activo = true
$$;

-- ─── 2. Habilitar RLS en las 23 tablas de RestauraCore ────────
ALTER TABLE restaurantes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_restaurantes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_menu              ENABLE ROW LEVEL SECURITY;
ALTER TABLE platillos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredientes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_auditoria                ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_inventario           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_anomalias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicciones_demanda         ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_diarios_enviados    ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones_mesa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_cancelacion_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_pendientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_eventos_procesados    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_soporte              ENABLE ROW LEVEL SECURITY;


-- ─── 3. TRIGGERS DEL SISTEMA ──────────────────────────────────

-- Trigger 1: Bloquea a nivel de motor degradar o desactivar al último dueño
CREATE OR REPLACE FUNCTION check_last_dueno()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.rol = 'dueno' AND (NEW.rol != 'dueno' OR NEW.activo = false) THEN
    IF (SELECT count(*) FROM usuario_restaurantes 
        WHERE restaurante_id = OLD.restaurante_id 
          AND rol = 'dueno' 
          AND activo = true 
          AND id != OLD.id) = 0 THEN
      RAISE EXCEPTION 'Operación bloqueada: El restaurante no puede quedarse sin un Dueño activo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_last_dueno ON usuario_restaurantes;
CREATE TRIGGER trg_prevent_last_dueno
BEFORE UPDATE ON usuario_restaurantes
FOR EACH ROW EXECUTE FUNCTION check_last_dueno();

-- Trigger 2: Alertas automáticas de stock bajo al actualizar stock_actual
CREATE OR REPLACE FUNCTION fn_alerta_stock_bajo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_nivel alerta_nivel;
BEGIN
  -- Solo actuar si stock_actual cambió y quedó por debajo del mínimo
  IF NEW.stock_actual >= NEW.stock_minimo THEN
    RETURN NEW;
  END IF;

  -- Determinar nivel: crítico si stock <= 25% del mínimo, bajo si <= 100%
  IF NEW.stock_actual <= (NEW.stock_minimo * 0.25) THEN
    v_nivel := 'critico';
  ELSE
    v_nivel := 'bajo';
  END IF;

  -- Insertar alerta solo si no existe una no atendida del mismo nivel para este ingrediente
  INSERT INTO alertas_inventario (restaurante_id, ingrediente_id, nivel, atendida)
  SELECT NEW.restaurante_id, NEW.id, v_nivel, false
  WHERE NOT EXISTS (
    SELECT 1 FROM alertas_inventario
    WHERE ingrediente_id = NEW.id
      AND nivel = v_nivel
      AND atendida = false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alerta_stock_bajo ON ingredientes;
CREATE TRIGGER trg_alerta_stock_bajo
  AFTER UPDATE OF stock_actual ON ingredientes
  FOR EACH ROW
  EXECUTE FUNCTION fn_alerta_stock_bajo();


-- ─── 4. POLÍTICAS ROW LEVEL SECURITY (RLS) ────────────────────

-- ─── restaurantes ───
DROP POLICY IF EXISTS "restaurantes_select" ON restaurantes;
CREATE POLICY "restaurantes_select" ON restaurantes
  FOR SELECT USING (id IN (SELECT restaurantes_activos_del_usuario()));

-- ─── usuarios ───
DROP POLICY IF EXISTS "usuarios_select_propio" ON usuarios;
CREATE POLICY "usuarios_select_propio" ON usuarios
  FOR SELECT USING (auth_id = auth.uid()::text);

-- ─── usuario_restaurantes ───
DROP POLICY IF EXISTS "ur_select" ON usuario_restaurantes;
CREATE POLICY "ur_select" ON usuario_restaurantes
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "ur_insert" ON usuario_restaurantes;
CREATE POLICY "ur_insert" ON usuario_restaurantes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.restaurante_id = usuario_restaurantes.restaurante_id
        AND ur.activo = true
        AND (
          ur.rol = 'dueno'
          OR (ur.rol = 'gerente' AND usuario_restaurantes.rol IN ('mesero', 'cajero', 'chef'))
        )
    )
  );

DROP POLICY IF EXISTS "ur_update" ON usuario_restaurantes;
CREATE POLICY "ur_update" ON usuario_restaurantes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.restaurante_id = usuario_restaurantes.restaurante_id
        AND ur.activo = true
        AND (
          ur.rol = 'dueno'
          OR (ur.rol = 'gerente' AND usuario_restaurantes.rol NOT IN ('dueno', 'gerente'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.restaurante_id = usuario_restaurantes.restaurante_id
        AND ur.activo = true
        AND (
          ur.rol = 'dueno'
          OR (ur.rol = 'gerente' AND usuario_restaurantes.rol IN ('mesero', 'cajero', 'chef'))
        )
    )
  );

-- ─── categorias_menu ───
DROP POLICY IF EXISTS "categorias_select" ON categorias_menu;
CREATE POLICY "categorias_select" ON categorias_menu
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "categorias_write" ON categorias_menu;
CREATE POLICY "categorias_write" ON categorias_menu
  FOR ALL USING (
    restaurante_id IN (
      SELECT ur.restaurante_id FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  );

-- ─── platillos ───
DROP POLICY IF EXISTS "platillos_select" ON platillos;
CREATE POLICY "platillos_select" ON platillos
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "platillos_write" ON platillos;
CREATE POLICY "platillos_write" ON platillos
  FOR ALL USING (
    restaurante_id IN (
      SELECT ur.restaurante_id FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  );

-- ─── ingredientes ───
DROP POLICY IF EXISTS "ingredientes_select" ON ingredientes;
CREATE POLICY "ingredientes_select" ON ingredientes
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "ingredientes_write" ON ingredientes;
CREATE POLICY "ingredientes_write" ON ingredientes
  FOR ALL USING (
    restaurante_id IN (
      SELECT ur.restaurante_id FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  );

-- ─── recetas ───
DROP POLICY IF EXISTS "recetas_select" ON recetas;
CREATE POLICY "recetas_select" ON recetas
  FOR SELECT USING (
    platillo_id IN (
      SELECT p.id FROM platillos p
      WHERE p.restaurante_id IN (SELECT restaurantes_activos_del_usuario())
    )
  );

DROP POLICY IF EXISTS "recetas_write" ON recetas;
CREATE POLICY "recetas_write" ON recetas
  FOR ALL USING (
    platillo_id IN (
      SELECT p.id FROM platillos p
      JOIN usuario_restaurantes ur ON ur.restaurante_id = p.restaurante_id
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  );

-- ─── mesas ───
DROP POLICY IF EXISTS "mesas_select" ON mesas;
CREATE POLICY "mesas_select" ON mesas
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

-- ─── ordenes ───
DROP POLICY IF EXISTS "ordenes_select" ON ordenes;
CREATE POLICY "ordenes_select" ON ordenes
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "ordenes_update" ON ordenes;
CREATE POLICY "ordenes_update" ON ordenes
  FOR UPDATE USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

-- ─── orden_items ───
DROP POLICY IF EXISTS "orden_items_select" ON orden_items;
CREATE POLICY "orden_items_select" ON orden_items
  FOR SELECT USING (
    orden_id IN (
      SELECT o.id FROM ordenes o
      WHERE o.restaurante_id IN (SELECT restaurantes_activos_del_usuario())
    )
  );

DROP POLICY IF EXISTS "orden_items_update" ON orden_items;
CREATE POLICY "orden_items_update" ON orden_items
  FOR UPDATE USING (
    orden_id IN (
      SELECT o.id FROM ordenes o
      WHERE o.restaurante_id IN (SELECT restaurantes_activos_del_usuario())
    )
  );

-- ─── movimientos_inventario ───
DROP POLICY IF EXISTS "movimientos_select" ON movimientos_inventario;
CREATE POLICY "movimientos_select" ON movimientos_inventario
  FOR SELECT USING (
    ingrediente_id IN (
      SELECT i.id FROM ingredientes i
      WHERE i.restaurante_id IN (SELECT restaurantes_activos_del_usuario())
    )
  );

DROP POLICY IF EXISTS "movimientos_insert_ajuste_merma" ON movimientos_inventario;
CREATE POLICY "movimientos_insert_ajuste_merma" ON movimientos_inventario
  FOR INSERT WITH CHECK (
    tipo IN ('ajuste_manual', 'merma') AND
    ingrediente_id IN (
      SELECT i.id FROM ingredientes i
      JOIN usuario_restaurantes ur ON ur.restaurante_id = i.restaurante_id
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  );

-- ─── proveedores ───
DROP POLICY IF EXISTS "proveedores_select" ON proveedores;
CREATE POLICY "proveedores_select" ON proveedores
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "proveedores_write" ON proveedores;
CREATE POLICY "proveedores_write" ON proveedores
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

-- ─── compras ───
DROP POLICY IF EXISTS "compras_select" ON compras;
CREATE POLICY "compras_select" ON compras
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "compras_write" ON compras;
CREATE POLICY "compras_write" ON compras
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

-- ─── compra_items ───
DROP POLICY IF EXISTS "compra_items_select" ON compra_items;
CREATE POLICY "compra_items_select" ON compra_items
  FOR SELECT USING (
    compra_id IN (
      SELECT c.id FROM compras c
      WHERE c.restaurante_id IN (SELECT restaurantes_activos_del_usuario())
    )
  );

DROP POLICY IF EXISTS "compra_items_write" ON compra_items;
CREATE POLICY "compra_items_write" ON compra_items
  FOR ALL
  USING (
    compra_id IN (
      SELECT c.id FROM compras c
      JOIN usuario_restaurantes ur ON ur.restaurante_id = c.restaurante_id
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  )
  WITH CHECK (
    compra_id IN (
      SELECT c.id FROM compras c
      JOIN usuario_restaurantes ur ON ur.restaurante_id = c.restaurante_id
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  );

-- ─── log_auditoria ───
DROP POLICY IF EXISTS "log_auditoria_select_dueno" ON log_auditoria;
CREATE POLICY "log_auditoria_select_dueno" ON log_auditoria
  FOR SELECT USING (
    restaurante_id IN (
      SELECT ur.restaurante_id FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol = 'dueno'
    )
  );

-- ─── alertas_inventario ───
DROP POLICY IF EXISTS "alertas_select" ON alertas_inventario;
CREATE POLICY "alertas_select" ON alertas_inventario
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "alertas_update" ON alertas_inventario;
CREATE POLICY "alertas_update" ON alertas_inventario
  FOR UPDATE USING (
    restaurante_id IN (
      SELECT ur.restaurante_id FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol IN ('gerente', 'dueno')
    )
  );

-- ─── alertas_anomalias ───
DROP POLICY IF EXISTS "alertas_anomalias_select" ON alertas_anomalias;
CREATE POLICY "alertas_anomalias_select" ON alertas_anomalias
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

-- ─── predicciones_demanda ───
DROP POLICY IF EXISTS "predicciones_select" ON predicciones_demanda;
CREATE POLICY "predicciones_select" ON predicciones_demanda
  FOR SELECT USING (
    ingrediente_id IN (
      SELECT i.id FROM ingredientes i
      WHERE i.restaurante_id IN (SELECT restaurantes_activos_del_usuario())
    )
  );

-- ─── turnos ───
DROP POLICY IF EXISTS "turnos_select" ON turnos;
CREATE POLICY "turnos_select" ON turnos
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "turnos_insert" ON turnos;
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

-- Limpieza preventiva de política obsoleta
DROP POLICY IF EXISTS "turnos_update_mesero" ON turnos;

DROP POLICY IF EXISTS "turnos_update_operativo" ON turnos;
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

DROP POLICY IF EXISTS "turnos_update_supervisor" ON turnos;
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

-- ─── reportes_diarios_enviados ───
DROP POLICY IF EXISTS "reportes_diarios_select" ON reportes_diarios_enviados;
CREATE POLICY "reportes_diarios_select" ON reportes_diarios_enviados
  FOR SELECT USING (
    restaurante_id IN (
      SELECT ur.restaurante_id FROM usuario_restaurantes ur
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.auth_id = auth.uid()::text
        AND ur.activo = true
        AND ur.rol = 'dueno'
    )
  );

-- ─── asignaciones_mesa ───
DROP POLICY IF EXISTS "asignaciones_mesa_select" ON asignaciones_mesa;
CREATE POLICY "asignaciones_mesa_select" ON asignaciones_mesa
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "asignaciones_mesa_write" ON asignaciones_mesa;
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

-- ─── solicitudes_cancelacion_item ───
DROP POLICY IF EXISTS "solicitudes_cancelacion_select" ON solicitudes_cancelacion_item;
CREATE POLICY "solicitudes_cancelacion_select" ON solicitudes_cancelacion_item
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "solicitudes_cancelacion_insert" ON solicitudes_cancelacion_item;
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

DROP POLICY IF EXISTS "solicitudes_cancelacion_update_resolucion" ON solicitudes_cancelacion_item;
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

-- ─── pagos ───
DROP POLICY IF EXISTS "pagos_select" ON pagos;
CREATE POLICY "pagos_select" ON pagos
  FOR SELECT USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "pagos_insert" ON pagos;
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
-- Estrictamente Append-Only: CERO políticas de UPDATE ni DELETE para pagos.

-- ─── 5. STORAGE (mermas-evidencia) ────────────────────────────
-- Se ejecutan si el esquema storage está disponible en Supabase
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE '
      DROP POLICY IF EXISTS "mermas_storage_select" ON storage.objects;
      CREATE POLICY "mermas_storage_select" ON storage.objects
        FOR SELECT USING (
          bucket_id = ''mermas-evidencia''
          AND EXISTS (
            SELECT 1 FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.restaurante_id = (storage.foldername(name))[1]::uuid
              AND ur.activo = true
              AND ur.rol IN (''gerente'', ''dueno'')
          )
        );

      DROP POLICY IF EXISTS "mermas_storage_insert" ON storage.objects;
      CREATE POLICY "mermas_storage_insert" ON storage.objects
        FOR INSERT WITH CHECK (
          bucket_id = ''mermas-evidencia''
          AND EXISTS (
            SELECT 1 FROM usuario_restaurantes ur
            JOIN usuarios u ON u.id = ur.usuario_id
            WHERE u.auth_id = auth.uid()::text
              AND ur.restaurante_id = (storage.foldername(name))[1]::uuid
              AND ur.activo = true
              AND ur.rol IN (''gerente'', ''dueno'')
          )
        );
    ';
  END IF;
END $$;

-- ─── 8. Políticas para tickets_soporte ───────────────────────────
DROP POLICY IF EXISTS "tickets_soporte_select_tenant" ON tickets_soporte;
CREATE POLICY "tickets_soporte_select_tenant" ON tickets_soporte
  FOR SELECT TO authenticated
  USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "tickets_soporte_insert_tenant" ON tickets_soporte;
CREATE POLICY "tickets_soporte_insert_tenant" ON tickets_soporte
  FOR INSERT TO authenticated
  WITH CHECK (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

