-- ==============================================================================
-- Migración 0008: Sincronización de Producción (Idempotente y Estrictamente Aditiva)
-- ==============================================================================

-- 1. Columna 'activo' en categorias_menu
ALTER TABLE "public"."categorias_menu"
  ADD COLUMN IF NOT EXISTS "activo" boolean NOT NULL DEFAULT true;

-- 2. Tabla recordatorios_trial_enviados
CREATE TABLE IF NOT EXISTS "public"."recordatorios_trial_enviados" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurante_id" uuid NOT NULL REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE,
  "dias_restantes" integer NOT NULL,
  "fecha" text NOT NULL,
  "enviado_en" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "recordatorios_trial_restaurante_dias_unique" UNIQUE ("restaurante_id", "dias_restantes")
);

-- RLS habilitado (uso exclusivo del backend / service_role; sin políticas para authenticated)
ALTER TABLE "public"."recordatorios_trial_enviados" ENABLE ROW LEVEL SECURITY;

-- Permisos para service_role
GRANT ALL ON TABLE "public"."recordatorios_trial_enviados" TO service_role;

-- 3. Bucket de Storage 'menu-fotos' (Público, 5MB límite, imágenes permitidas)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'menu-fotos',
      'menu-fotos',
      true,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

-- 4. Políticas de Storage para 'menu-fotos' en storage.objects
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    -- Lectura pública para comensales y personal
    DROP POLICY IF EXISTS "menu_fotos_storage_select" ON storage.objects;
    CREATE POLICY "menu_fotos_storage_select" ON storage.objects
      FOR SELECT USING (bucket_id = 'menu-fotos');

    -- Subida exclusiva para gerente o dueño del restaurante (carpeta = restaurante_id)
    DROP POLICY IF EXISTS "menu_fotos_storage_insert" ON storage.objects;
    CREATE POLICY "menu_fotos_storage_insert" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'menu-fotos'
        AND EXISTS (
          SELECT 1 FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.restaurante_id = (storage.foldername(name))[1]::uuid
            AND ur.activo = true
            AND ur.rol IN ('gerente', 'dueno')
        )
      );

    -- Eliminación exclusiva para gerente o dueño del restaurante
    DROP POLICY IF EXISTS "menu_fotos_storage_delete" ON storage.objects;
    CREATE POLICY "menu_fotos_storage_delete" ON storage.objects
      FOR DELETE USING (
        bucket_id = 'menu-fotos'
        AND EXISTS (
          SELECT 1 FROM usuario_restaurantes ur
          JOIN usuarios u ON u.id = ur.usuario_id
          WHERE u.auth_id = auth.uid()::text
            AND ur.restaurante_id = (storage.foldername(name))[1]::uuid
            AND ur.activo = true
            AND ur.rol IN ('gerente', 'dueno')
        )
      );
  END IF;
END $$;
