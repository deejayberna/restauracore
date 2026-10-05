-- ==============================================================================
-- Migración 0011: Alineación de tickets_soporte y fechas Telegram (Transaccional)
-- ==============================================================================

BEGIN;

-- 1. A6: Alineación no destructiva de tickets_soporte
-- Ensanchar varchar a text
ALTER TABLE "public"."tickets_soporte"
  ALTER COLUMN "asunto" TYPE text,
  ALTER COLUMN "estado" TYPE text;

-- Convertir respondido_por a uuid
ALTER TABLE "public"."tickets_soporte"
  ALTER COLUMN "respondido_por" TYPE uuid USING (NULLIF(respondido_por, '')::uuid);

-- Clave foránea de respondido_por hacia usuarios(id) ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tickets_soporte_respondido_por_usuarios_id_fk' 
      AND table_name = 'tickets_soporte'
  ) THEN
    ALTER TABLE "public"."tickets_soporte"
      ADD CONSTRAINT "tickets_soporte_respondido_por_usuarios_id_fk"
      FOREIGN KEY ("respondido_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Políticas RLS estándar para tickets_soporte
DROP POLICY IF EXISTS "tenant_isolation_tickets_soporte" ON "public"."tickets_soporte";
DROP POLICY IF EXISTS "tickets_soporte_select_tenant" ON "public"."tickets_soporte";
CREATE POLICY "tickets_soporte_select_tenant" ON "public"."tickets_soporte"
  FOR SELECT TO authenticated
  USING (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

DROP POLICY IF EXISTS "tickets_soporte_insert_tenant" ON "public"."tickets_soporte";
CREATE POLICY "tickets_soporte_insert_tenant" ON "public"."tickets_soporte"
  FOR INSERT TO authenticated
  WITH CHECK (restaurante_id IN (SELECT restaurantes_activos_del_usuario()));

-- 2. A7: Conversión de fechas de Telegram a timestamptz con AT TIME ZONE 'UTC'
ALTER TABLE "public"."clientes_telegram"
  ALTER COLUMN "ultima_visita_en" TYPE timestamp with time zone USING ultima_visita_en AT TIME ZONE 'UTC',
  ALTER COLUMN "ultimo_mensaje_recuperacion_en" TYPE timestamp with time zone USING ultimo_mensaje_recuperacion_en AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE timestamp with time zone USING creado_en AT TIME ZONE 'UTC';

ALTER TABLE "public"."vinculaciones_telegram_pendientes"
  ALTER COLUMN "creado_en" TYPE timestamp with time zone USING creado_en AT TIME ZONE 'UTC',
  ALTER COLUMN "expira_en" TYPE timestamp with time zone USING expira_en AT TIME ZONE 'UTC';

COMMIT;
