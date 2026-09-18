-- ============================================================
-- Migración 0004 — Fase 9.3: Cuenta Abierta, Cancelaciones y Pagos
-- ============================================================

-- 1. Rol Cajero
ALTER TYPE "public"."rol" ADD VALUE IF NOT EXISTS 'cajero';

-- 2. Enums cuenta_estado y metodo_pago
DO $$ BEGIN
  CREATE TYPE "public"."cuenta_estado" AS ENUM('abierta', 'cuenta_solicitada', 'pagado', 'cancelado');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'tarjeta', 'transferencia');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Columnas nuevas en turnos y movimientos_inventario
ALTER TABLE "turnos" ADD COLUMN IF NOT EXISTS "responsable_id" uuid REFERENCES "usuarios"("id");
ALTER TABLE "movimientos_inventario" ADD COLUMN IF NOT EXISTS "revision_pendiente" boolean DEFAULT false NOT NULL;

-- 4. Migración de ordenes.estado con conversión explícita
ALTER TABLE "ordenes" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "ordenes"
  ALTER COLUMN "estado" TYPE "public"."cuenta_estado"
  USING (
    CASE
      WHEN "estado"::text = 'pagado' THEN 'pagado'::"public"."cuenta_estado"
      WHEN "estado"::text = 'cancelado' THEN 'cancelado'::"public"."cuenta_estado"
      WHEN "estado"::text IN ('pendiente', 'confirmada', 'en_preparacion', 'listo', 'entregado') THEN 'abierta'::"public"."cuenta_estado"
      ELSE 'abierta'::"public"."cuenta_estado"
    END
  );
ALTER TABLE "ordenes" ALTER COLUMN "estado" SET DEFAULT 'abierta';

-- 5. Tabla asignaciones_mesa
CREATE TABLE IF NOT EXISTS "asignaciones_mesa" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurante_id" uuid NOT NULL REFERENCES "restaurantes"("id"),
  "mesa_id" uuid NOT NULL REFERENCES "mesas"("id"),
  "mesero_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "turno_id" uuid REFERENCES "turnos"("id"),
  "fecha" text NOT NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL
);

-- 6. Tabla solicitudes_cancelacion_item
CREATE TABLE IF NOT EXISTS "solicitudes_cancelacion_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurante_id" uuid NOT NULL REFERENCES "restaurantes"("id"),
  "orden_item_id" uuid NOT NULL REFERENCES "orden_items"("id"),
  "orden_id" uuid NOT NULL REFERENCES "ordenes"("id"),
  "solicitado_por" uuid NOT NULL REFERENCES "usuarios"("id"),
  "estado_item_al_solicitar" text NOT NULL,
  "motivo" text NOT NULL,
  "estado" text DEFAULT 'pendiente' NOT NULL,
  "aprobado_por" uuid REFERENCES "usuarios"("id"),
  "motivo_resolucion" text,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  "resuelto_en" timestamp
);

-- 7. Tabla pagos (append-only)
CREATE TABLE IF NOT EXISTS "pagos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurante_id" uuid NOT NULL REFERENCES "restaurantes"("id"),
  "orden_id" uuid NOT NULL REFERENCES "ordenes"("id"),
  "turno_id" uuid REFERENCES "turnos"("id"),
  "metodo_pago" "metodo_pago" NOT NULL,
  "monto" numeric(10, 2) NOT NULL,
  "propina_monto" numeric(10, 2) DEFAULT '0' NOT NULL,
  "creado_por" uuid NOT NULL REFERENCES "usuarios"("id"),
  "creado_en" timestamp DEFAULT now() NOT NULL
);

-- 8. Backfill retroactivo de órdenes pagadas históricas y sus propinas
INSERT INTO "pagos" (
  "restaurante_id",
  "orden_id",
  "turno_id",
  "metodo_pago",
  "monto",
  "propina_monto",
  "creado_por",
  "creado_en"
)
SELECT
  o."restaurante_id",
  o."id" AS "orden_id",
  t."id" AS "turno_id",
  CASE
    WHEN LOWER(COALESCE(o."metodo_pago", 'efectivo')) LIKE '%tarjeta%'
      OR LOWER(COALESCE(o."metodo_pago", 'efectivo')) LIKE '%terminal%'
      OR LOWER(COALESCE(o."metodo_pago", 'efectivo')) LIKE '%card%' THEN 'tarjeta'::"metodo_pago"
    WHEN LOWER(COALESCE(o."metodo_pago", 'efectivo')) LIKE '%transfer%'
      OR LOWER(COALESCE(o."metodo_pago", 'efectivo')) LIKE '%spei%'
      OR LOWER(COALESCE(o."metodo_pago", 'efectivo')) LIKE '%banco%' THEN 'transferencia'::"metodo_pago"
    ELSE 'efectivo'::"metodo_pago"
  END AS "metodo_pago",
  GREATEST(0, (COALESCE(o."total", 0) - COALESCE(o."propina", 0))) AS "monto",
  COALESCE(o."propina", 0) AS "propina_monto",
  COALESCE(o."mesero_id", (
    SELECT ur.usuario_id FROM usuario_restaurantes ur
    WHERE ur.restaurante_id = o.restaurante_id AND ur.activo = true
    LIMIT 1
  )) AS "creado_por",
  o."creado_en"
FROM "ordenes" o
LEFT JOIN LATERAL (
  SELECT t.id
  FROM turnos t
  WHERE t.restaurante_id = o.restaurante_id
    AND t.fecha_inicio <= o.creado_en
    AND (t.fecha_cierre IS NULL OR t.fecha_cierre >= o.creado_en)
  ORDER BY t.fecha_inicio DESC
  LIMIT 1
) t ON true
WHERE o."estado"::text = 'pagado'
  AND NOT EXISTS (
    SELECT 1 FROM "pagos" p WHERE p."orden_id" = o."id"
  );

