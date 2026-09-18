CREATE TYPE "public"."anomalia_tipo" AS ENUM('merma_ingrediente', 'merma_usuario', 'cancelaciones_usuario');--> statement-breakpoint
CREATE TYPE "public"."turno_estado" AS ENUM('abierto', 'cerrado');--> statement-breakpoint
CREATE TABLE "alertas_anomalias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"tipo" "anomalia_tipo" NOT NULL,
	"ingrediente_id" uuid,
	"usuario_id" uuid,
	"valor_reciente" numeric(12, 3) NOT NULL,
	"promedio_historico" numeric(12, 3) NOT NULL,
	"desviacion_estandar" numeric(12, 3) NOT NULL,
	"z_score" numeric(6, 2) NOT NULL,
	"explicacion" text NOT NULL,
	"periodo_inicio" timestamp NOT NULL,
	"periodo_fin" timestamp NOT NULL,
	"atendida" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"estado" "turno_estado" DEFAULT 'abierto' NOT NULL,
	"abierto_por" uuid NOT NULL,
	"capturado_por" uuid,
	"cerrado_por" uuid,
	"monto_sistema" jsonb,
	"monto_fisico" jsonb,
	"diferencias" jsonb,
	"hay_discrepancia" boolean DEFAULT false NOT NULL,
	"notas" text,
	"fecha_inicio" timestamp DEFAULT now() NOT NULL,
	"fecha_cierre" timestamp,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertas_anomalias" ADD CONSTRAINT "alertas_anomalias_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_anomalias" ADD CONSTRAINT "alertas_anomalias_ingrediente_id_ingredientes_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingredientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_anomalias" ADD CONSTRAINT "alertas_anomalias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_abierto_por_usuarios_id_fk" FOREIGN KEY ("abierto_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_capturado_por_usuarios_id_fk" FOREIGN KEY ("capturado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;