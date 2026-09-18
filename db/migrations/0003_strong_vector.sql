CREATE TABLE "reportes_diarios_enviados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"enviado_en" timestamp DEFAULT now() NOT NULL,
	"datos_resumen" jsonb,
	CONSTRAINT "reportes_diarios_restaurante_fecha_unique" UNIQUE("restaurante_id","fecha")
);
--> statement-breakpoint
ALTER TABLE "reportes_diarios_enviados" ADD CONSTRAINT "reportes_diarios_enviados_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;