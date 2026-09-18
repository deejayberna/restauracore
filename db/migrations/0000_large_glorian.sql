CREATE TYPE "public"."alerta_nivel" AS ENUM('bajo', 'critico');--> statement-breakpoint
CREATE TYPE "public"."compra_estado" AS ENUM('pendiente', 'confirmada', 'recibida', 'incidencia', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."movimiento_tipo" AS ENUM('venta', 'merma', 'compra', 'ajuste_manual');--> statement-breakpoint
CREATE TYPE "public"."orden_estado" AS ENUM('pendiente', 'confirmada', 'en_preparacion', 'listo', 'entregado', 'pagado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('basico', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('mesero', 'chef', 'gerente', 'dueno');--> statement-breakpoint
CREATE TYPE "public"."unidad_medida" AS ENUM('g', 'kg', 'ml', 'l', 'pieza');--> statement-breakpoint
CREATE TABLE "alertas_inventario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"ingrediente_id" uuid NOT NULL,
	"nivel" "alerta_nivel" NOT NULL,
	"atendida" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias_menu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compra_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"ingrediente_id" uuid NOT NULL,
	"cantidad_pedida" numeric(10, 3) NOT NULL,
	"cantidad_recibida" numeric(10, 3),
	"costo_unitario_pactado" numeric(10, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"estado" "compra_estado" DEFAULT 'pendiente' NOT NULL,
	"total_estimado" numeric(10, 2),
	"total_real" numeric(10, 2),
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"unidad_medida" "unidad_medida" NOT NULL,
	"costo_unitario" numeric(10, 4) NOT NULL,
	"stock_actual" numeric(10, 3) DEFAULT '0' NOT NULL,
	"stock_minimo" numeric(10, 3) DEFAULT '0' NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"accion" text NOT NULL,
	"tabla_afectada" text,
	"registro_id" text,
	"valores_anteriores" jsonb,
	"valores_nuevos" jsonb,
	"ip_origen" text,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"qr_token" text NOT NULL,
	CONSTRAINT "mesas_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE "movimientos_inventario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingrediente_id" uuid NOT NULL,
	"tipo" "movimiento_tipo" NOT NULL,
	"cantidad" numeric(10, 3) NOT NULL,
	"orden_id" uuid,
	"motivo" text,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orden_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orden_id" uuid NOT NULL,
	"platillo_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unitario_congelado" numeric(10, 2) NOT NULL,
	"notas" text,
	"estado" "orden_estado" DEFAULT 'pendiente' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ordenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"mesa_id" uuid NOT NULL,
	"mesero_id" uuid,
	"estado" "orden_estado" DEFAULT 'pendiente' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"propina" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"metodo_pago" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platillos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"categoria_id" uuid,
	"nombre" text NOT NULL,
	"descripcion" text,
	"precio" numeric(10, 2) NOT NULL,
	"foto_url" text,
	"disponible" boolean DEFAULT true NOT NULL,
	"tiempo_prep_minutos" integer
);
--> statement-breakpoint
CREATE TABLE "predicciones_demanda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingrediente_id" uuid NOT NULL,
	"fecha" timestamp NOT NULL,
	"cantidad_estimada" numeric(10, 3) NOT NULL,
	"generado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"contacto" text,
	"telefono" text,
	"email" text,
	"calificacion" numeric(3, 2)
);
--> statement-breakpoint
CREATE TABLE "recetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platillo_id" uuid NOT NULL,
	"ingrediente_id" uuid NOT NULL,
	"cantidad_requerida" numeric(10, 3) NOT NULL,
	CONSTRAINT "recetas_platillo_id_ingrediente_id_unique" UNIQUE("platillo_id","ingrediente_id")
);
--> statement-breakpoint
CREATE TABLE "restaurantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"plan" "plan" DEFAULT 'basico' NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_restaurantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"rol" "rol" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_restaurantes_usuario_id_restaurante_id_unique" UNIQUE("usuario_id","restaurante_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_id" text NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_auth_id_unique" UNIQUE("auth_id")
);
--> statement-breakpoint
ALTER TABLE "alertas_inventario" ADD CONSTRAINT "alertas_inventario_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_inventario" ADD CONSTRAINT "alertas_inventario_ingrediente_id_ingredientes_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingredientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias_menu" ADD CONSTRAINT "categorias_menu_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_items" ADD CONSTRAINT "compra_items_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_items" ADD CONSTRAINT "compra_items_ingrediente_id_ingredientes_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingredientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredientes" ADD CONSTRAINT "ingredientes_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ingrediente_id_ingredientes_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingredientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_platillo_id_platillos_id_fk" FOREIGN KEY ("platillo_id") REFERENCES "public"."platillos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_mesero_id_usuarios_id_fk" FOREIGN KEY ("mesero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platillos" ADD CONSTRAINT "platillos_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platillos" ADD CONSTRAINT "platillos_categoria_id_categorias_menu_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_menu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predicciones_demanda" ADD CONSTRAINT "predicciones_demanda_ingrediente_id_ingredientes_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingredientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_platillo_id_platillos_id_fk" FOREIGN KEY ("platillo_id") REFERENCES "public"."platillos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_ingrediente_id_ingredientes_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingredientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_restaurantes" ADD CONSTRAINT "usuario_restaurantes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_restaurantes" ADD CONSTRAINT "usuario_restaurantes_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE no action ON UPDATE no action;