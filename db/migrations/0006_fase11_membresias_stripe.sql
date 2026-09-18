CREATE TYPE "public"."estado_suscripcion" AS ENUM('trial', 'activa', 'pago_fallido', 'cancelada');--> statement-breakpoint
CREATE TABLE "registros_pendientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"nombre_dueno" text NOT NULL,
	"nombre_restaurante" text NOT NULL,
	"direccion" text,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"plan" "plan" DEFAULT 'basico' NOT NULL,
	"stripe_session_id" text,
	"completado" boolean DEFAULT false NOT NULL,
	"expira_en" timestamp NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registros_pendientes_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_eventos_procesados" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"procesado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurantes" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "restaurantes" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "restaurantes" ADD COLUMN "estado_suscripcion" "estado_suscripcion" DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurantes" ADD COLUMN "fecha_fin_trial" timestamp;--> statement-breakpoint
ALTER TABLE "restaurantes" ADD COLUMN "umbral_foto_merma" numeric(10, 2) DEFAULT '150.00';--> statement-breakpoint
ALTER TABLE "restaurantes" ADD CONSTRAINT "restaurantes_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "restaurantes" ADD CONSTRAINT "restaurantes_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");

