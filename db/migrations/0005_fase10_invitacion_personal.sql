-- ============================================================
-- Migración 0005 — Fase 10: Invitaciones de Personal Seguras
-- ============================================================

ALTER TABLE "usuario_restaurantes" ADD COLUMN IF NOT EXISTS "invitacion_pendiente" boolean DEFAULT false NOT NULL;

