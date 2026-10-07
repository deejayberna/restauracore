-- ============================================================
-- Migración 0012: Creación de tabla log_sistema
-- Eventos de infraestructura y fallos de correo de autenticación
-- Versionada, idempotente y transaccional
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."log_sistema" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tipo" text NOT NULL,
  "origen" text NOT NULL,
  "servicio" text DEFAULT 'supabase_auth_smtp',
  "email_dominio" text,
  "estado_http" integer,
  "codigo_error" text,
  "mensaje_error" text,
  "ip_origen" text,
  "metadata" jsonb,
  "creado_en" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_log_sistema_tipo_creado_en" 
  ON "public"."log_sistema" ("tipo", "creado_en" DESC);

-- Habilitar Row Level Security sin políticas para anon/authenticated
ALTER TABLE "public"."log_sistema" ENABLE ROW LEVEL SECURITY;

-- Revocar permisos a roles públicos de Supabase
REVOKE ALL ON TABLE "public"."log_sistema" FROM anon, authenticated;

