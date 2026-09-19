import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const planEnum = pgEnum("plan", ["basico", "pro", "enterprise"]);
export const rolEnum = pgEnum("rol", ["mesero", "cajero", "chef", "gerente", "dueno"]);
export const cuentaEstadoEnum = pgEnum("cuenta_estado", [
  "abierta",
  "cuenta_solicitada",
  "pagado",
  "cancelado",
]);
export const metodoPagoEnum = pgEnum("metodo_pago", [
  "efectivo",
  "tarjeta",
  "transferencia",
]);
export const unidadMedidaEnum = pgEnum("unidad_medida", ["g", "kg", "ml", "l", "pieza"]);
export const ordenEstadoEnum = pgEnum("orden_estado", [
  "pendiente",
  "confirmada",
  "en_preparacion",
  "listo",
  "entregado",
  "pagado",
  "cancelado",
]);
export const movimientoTipoEnum = pgEnum("movimiento_tipo", [
  "venta",
  "merma",
  "compra",
  "ajuste_manual",
]);
export const compraEstadoEnum = pgEnum("compra_estado", [
  "pendiente",
  "confirmada",
  "recibida",
  "incidencia",
  "cancelada",
]);
export const alertaNivelEnum = pgEnum("alerta_nivel", ["bajo", "critico"]);
export const anomaliaTipoEnum = pgEnum("anomalia_tipo", [
  "merma_ingrediente",
  "merma_usuario",
  "cancelaciones_usuario",
]);
export const turnoEstadoEnum = pgEnum("turno_estado", ["abierto", "cerrado"]);
export const estadoSuscripcionEnum = pgEnum("estado_suscripcion", [
  "trial",
  "activa",
  "pago_fallido",
  "cancelada",
]);

// ─── Tablas ──────────────────────────────────────────────────────────────────

export const restaurantes = pgTable("restaurantes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  direccion: text("direccion"),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  plan: planEnum("plan").notNull().default("basico"),
  stripe_customer_id: text("stripe_customer_id").unique(),
  stripe_subscription_id: text("stripe_subscription_id").unique(),
  estado_suscripcion: estadoSuscripcionEnum("estado_suscripcion").notNull().default("trial"),
  fecha_fin_trial: timestamp("fecha_fin_trial"),
  umbral_foto_merma: decimal("umbral_foto_merma", { precision: 10, scale: 2 }).default("150.00"),
  telegram_chat_id: text("telegram_chat_id"),
  email_alertas: text("email_alertas"),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  auth_id: text("auth_id").notNull().unique(), // referencia a Supabase Auth
  nombre: text("nombre").notNull(),
  email: text("email").notNull(),
  activo: boolean("activo").notNull().default(true),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const usuarioRestaurantes = pgTable(
  "usuario_restaurantes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuario_id: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    restaurante_id: uuid("restaurante_id")
      .notNull()
      .references(() => restaurantes.id),
    rol: rolEnum("rol").notNull(),
    activo: boolean("activo").notNull().default(true),
    invitacion_pendiente: boolean("invitacion_pendiente").notNull().default(false),
    creado_en: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => [unique().on(t.usuario_id, t.restaurante_id)]
);

export const categoriasMenu = pgTable("categorias_menu", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  nombre: text("nombre").notNull(),
  orden: integer("orden").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
});

export const platillos = pgTable("platillos", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  categoria_id: uuid("categoria_id").references(() => categoriasMenu.id),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  precio: decimal("precio", { precision: 10, scale: 2 }).notNull(),
  foto_url: text("foto_url"),
  disponible: boolean("disponible").notNull().default(true),
  tiempo_prep_minutos: integer("tiempo_prep_minutos"),
});

export const ingredientes = pgTable("ingredientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  nombre: text("nombre").notNull(),
  unidad_medida: unidadMedidaEnum("unidad_medida").notNull(),
  costo_unitario: decimal("costo_unitario", { precision: 10, scale: 4 }).notNull(),
  stock_actual: decimal("stock_actual", { precision: 10, scale: 3 }).notNull().default("0"),
  stock_minimo: decimal("stock_minimo", { precision: 10, scale: 3 }).notNull().default("0"),
  actualizado_en: timestamp("actualizado_en").notNull().defaultNow(),
});

export const recetas = pgTable(
  "recetas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platillo_id: uuid("platillo_id")
      .notNull()
      .references(() => platillos.id),
    ingrediente_id: uuid("ingrediente_id")
      .notNull()
      .references(() => ingredientes.id),
    cantidad_requerida: decimal("cantidad_requerida", { precision: 10, scale: 3 }).notNull(),
  },
  (t) => [unique().on(t.platillo_id, t.ingrediente_id)]
);

export const mesas = pgTable("mesas", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  numero: integer("numero").notNull(),
  qr_token: text("qr_token").notNull().unique(),
});

export const ordenes = pgTable("ordenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  mesa_id: uuid("mesa_id")
    .notNull()
    .references(() => mesas.id),
  mesero_id: uuid("mesero_id").references(() => usuarios.id), // nullable
  estado: cuentaEstadoEnum("estado").notNull().default("abierta"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  propina: decimal("propina", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  /** @deprecated Reemplazado por la tabla `pagos` (append-only) para soportar pagos divididos. */
  metodo_pago: text("metodo_pago"),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
  actualizado_en: timestamp("actualizado_en").notNull().defaultNow(),
});

export const ordenItems = pgTable("orden_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orden_id: uuid("orden_id")
    .notNull()
    .references(() => ordenes.id),
  platillo_id: uuid("platillo_id")
    .notNull()
    .references(() => platillos.id),
  cantidad: integer("cantidad").notNull(),
  // Precio congelado al momento de ordenar — nunca referencia el precio actual del platillo
  precio_unitario_congelado: decimal("precio_unitario_congelado", {
    precision: 10,
    scale: 2,
  }).notNull(),
  notas: text("notas"),
  estado: ordenEstadoEnum("estado").notNull().default("pendiente"),
});

export const movimientosInventario = pgTable("movimientos_inventario", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingrediente_id: uuid("ingrediente_id")
    .notNull()
    .references(() => ingredientes.id),
  tipo: movimientoTipoEnum("tipo").notNull(),
  cantidad: decimal("cantidad", { precision: 10, scale: 3 }).notNull(), // puede ser negativa
  orden_id: uuid("orden_id").references(() => ordenes.id), // nullable
  motivo: text("motivo"),
  // Path interno en Supabase Storage — NUNCA una URL permanente.
  // La URL firmada (createSignedUrl) se genera bajo demanda con expiración de 1 hora.
  foto_path: text("foto_path"), // nullable — solo mermas con evidencia fotográfica
  revision_pendiente: boolean("revision_pendiente").notNull().default(false),
  creado_por: uuid("creado_por")
    .notNull()
    .references(() => usuarios.id),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const proveedores = pgTable("proveedores", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  nombre: text("nombre").notNull(),
  contacto: text("contacto"),
  telefono: text("telefono"),
  email: text("email"),
  calificacion: decimal("calificacion", { precision: 3, scale: 2 }),
});

export const compras = pgTable("compras", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  proveedor_id: uuid("proveedor_id")
    .notNull()
    .references(() => proveedores.id),
  estado: compraEstadoEnum("estado").notNull().default("pendiente"),
  total_estimado: decimal("total_estimado", { precision: 10, scale: 2 }),
  total_real: decimal("total_real", { precision: 10, scale: 2 }),
  creado_por: uuid("creado_por")
    .notNull()
    .references(() => usuarios.id),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const compraItems = pgTable("compra_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  compra_id: uuid("compra_id")
    .notNull()
    .references(() => compras.id),
  ingrediente_id: uuid("ingrediente_id")
    .notNull()
    .references(() => ingredientes.id),
  cantidad_pedida: decimal("cantidad_pedida", { precision: 10, scale: 3 }).notNull(),
  cantidad_recibida: decimal("cantidad_recibida", { precision: 10, scale: 3 }),
  costo_unitario_pactado: decimal("costo_unitario_pactado", { precision: 10, scale: 4 }).notNull(),
});

export const turnos = pgTable("turnos", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  codigo: text("codigo").notNull(),
  estado: turnoEstadoEnum("estado").notNull().default("abierto"),
  abierto_por: uuid("abierto_por")
    .notNull()
    .references(() => usuarios.id),
  responsable_id: uuid("responsable_id").references(() => usuarios.id), // Cajero o mesero asignado
  capturado_por: uuid("capturado_por").references(() => usuarios.id),
  cerrado_por: uuid("cerrado_por").references(() => usuarios.id),
  monto_sistema: jsonb("monto_sistema"),
  monto_fisico: jsonb("monto_fisico"),
  diferencias: jsonb("diferencias"),
  hay_discrepancia: boolean("hay_discrepancia").notNull().default(false),
  notas: text("notas"),
  fecha_inicio: timestamp("fecha_inicio").notNull().defaultNow(),
  fecha_cierre: timestamp("fecha_cierre"),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
  actualizado_en: timestamp("actualizado_en").notNull().defaultNow(),
});

export const logAuditoria = pgTable("log_auditoria", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  usuario_id: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  accion: text("accion").notNull(),
  tabla_afectada: text("tabla_afectada"),
  registro_id: text("registro_id"),
  valores_anteriores: jsonb("valores_anteriores"),
  valores_nuevos: jsonb("valores_nuevos"),
  ip_origen: text("ip_origen"),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const alertasInventario = pgTable("alertas_inventario", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  ingrediente_id: uuid("ingrediente_id")
    .notNull()
    .references(() => ingredientes.id),
  nivel: alertaNivelEnum("nivel").notNull(),
  atendida: boolean("atendida").notNull().default(false),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

// Alertas de anomalías estadísticas (Fase 5.3) — visibles SOLO para el rol 'dueno'.
// El sujeto de la anomalía es un ingrediente o un usuario, según el tipo: por eso
// ambas FK son nullable y solo una se llena en cada fila.
export const alertasAnomalias = pgTable("alertas_anomalias", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  tipo: anomaliaTipoEnum("tipo").notNull(),
  ingrediente_id: uuid("ingrediente_id").references(() => ingredientes.id), // nullable
  usuario_id: uuid("usuario_id").references(() => usuarios.id), // nullable
  // Métricas que sustentan la alerta — se guardan para que el dueño pueda auditar
  // el cálculo y no dependa de la explicación en texto
  valor_reciente: decimal("valor_reciente", { precision: 12, scale: 3 }).notNull(),
  promedio_historico: decimal("promedio_historico", { precision: 12, scale: 3 }).notNull(),
  desviacion_estandar: decimal("desviacion_estandar", { precision: 12, scale: 3 }).notNull(),
  z_score: decimal("z_score", { precision: 6, scale: 2 }).notNull(),
  explicacion: text("explicacion").notNull(),
  periodo_inicio: timestamp("periodo_inicio").notNull(),
  periodo_fin: timestamp("periodo_fin").notNull(),
  atendida: boolean("atendida").notNull().default(false),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const prediccionesDemanda = pgTable("predicciones_demanda", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingrediente_id: uuid("ingrediente_id")
    .notNull()
    .references(() => ingredientes.id),
  fecha: timestamp("fecha").notNull(),
  cantidad_estimada: decimal("cantidad_estimada", { precision: 10, scale: 3 }).notNull(),
  generado_en: timestamp("generado_en").notNull().defaultNow(),
});

// Registro de reportes diarios ejecutados (Fase 7 — Idempotencia del Cron)
// La combinación UNIQUE(restaurante_id, fecha) garantiza a nivel de BD que jamás
// se envíen reportes duplicados en un mismo día aunque el cron corra múltiples veces.
export const reportesDiariosEnviados = pgTable(
  "reportes_diarios_enviados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurante_id: uuid("restaurante_id")
      .notNull()
      .references(() => restaurantes.id),
    fecha: text("fecha").notNull(), // Formato "YYYY-MM-DD" local del restaurante
    enviado_en: timestamp("enviado_en").notNull().defaultNow(),
    datos_resumen: jsonb("datos_resumen"),
  },
  (table) => [
    unique("reportes_diarios_restaurante_fecha_unique").on(
      table.restaurante_id,
      table.fecha
    ),
  ]
);

// Registro de recordatorios de trial enviados (Idempotencia y prevención de duplicados)
// UNIQUE(restaurante_id, dias_restantes) previene enviar más de una vez el aviso de 2 días o de 1 día
export const recordatoriosTrialEnviados = pgTable(
  "recordatorios_trial_enviados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurante_id: uuid("restaurante_id")
      .notNull()
      .references(() => restaurantes.id),
    dias_restantes: integer("dias_restantes").notNull(), // 2 o 1
    fecha: text("fecha").notNull(), // Formato "YYYY-MM-DD" local del restaurante
    enviado_en: timestamp("enviado_en").notNull().defaultNow(),
  },
  (table) => [
    unique("recordatorios_trial_restaurante_dias_unique").on(
      table.restaurante_id,
      table.dias_restantes
    ),
  ]
);

export const asignacionesMesa = pgTable("asignaciones_mesa", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  mesa_id: uuid("mesa_id")
    .notNull()
    .references(() => mesas.id),
  mesero_id: uuid("mesero_id")
    .notNull()
    .references(() => usuarios.id),
  turno_id: uuid("turno_id").references(() => turnos.id),
  fecha: text("fecha").notNull(), // Formato "YYYY-MM-DD"
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const solicitudesCancelacionItem = pgTable("solicitudes_cancelacion_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  orden_item_id: uuid("orden_item_id")
    .notNull()
    .references(() => ordenItems.id),
  orden_id: uuid("orden_id")
    .notNull()
    .references(() => ordenes.id),
  solicitado_por: uuid("solicitado_por")
    .notNull()
    .references(() => usuarios.id),
  estado_item_al_solicitar: text("estado_item_al_solicitar").notNull(),
  motivo: text("motivo").notNull(),
  estado: text("estado").notNull().default("pendiente"), // pendiente, aprobada, rechazada
  aprobado_por: uuid("aprobado_por").references(() => usuarios.id),
  motivo_resolucion: text("motivo_resolucion"),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
  resuelto_en: timestamp("resuelto_en"),
});

export const pagos = pgTable("pagos", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id),
  orden_id: uuid("orden_id")
    .notNull()
    .references(() => ordenes.id),
  turno_id: uuid("turno_id").references(() => turnos.id),
  metodo_pago: metodoPagoEnum("metodo_pago").notNull(),
  monto: decimal("monto", { precision: 10, scale: 2 }).notNull(),
  propina_monto: decimal("propina_monto", { precision: 10, scale: 2 }).notNull().default("0"),
  creado_por: uuid("creado_por")
    .notNull()
    .references(() => usuarios.id),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

// [LEGACY / CÓDIGO PRESERVADO - FASE 11]
// Tabla de registros pendientes del flujo original con tarjeta obligatoria inicial.
// Actualmente sin uso activo tras la adopción del modelo trial directo sin tarjeta.
// Se conserva intacta en el esquema de PostgreSQL para contingencia o reactivación futura.
export const registrosPendientes = pgTable("registros_pendientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  password_hash: text("password_hash").notNull(),
  nombre_dueno: text("nombre_dueno").notNull(),
  nombre_restaurante: text("nombre_restaurante").notNull(),
  direccion: text("direccion"),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  plan: planEnum("plan").notNull().default("basico"),
  stripe_session_id: text("stripe_session_id").unique(),
  completado: boolean("completado").notNull().default(false),
  expira_en: timestamp("expira_en").notNull(),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export const stripeEventosProcesados = pgTable("stripe_eventos_procesados", {
  id: text("id").primaryKey(), // event.id de Stripe
  tipo: text("tipo").notNull(),
  procesado_en: timestamp("procesado_en").notNull().defaultNow(),
});

export const ticketsSoporte = pgTable("tickets_soporte", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurante_id: uuid("restaurante_id")
    .notNull()
    .references(() => restaurantes.id, { onDelete: "cascade" }),
  usuario_id: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  asunto: text("asunto").notNull(),
  mensaje: text("mensaje").notNull(),
  estado: text("estado").notNull().default("abierto"), // "abierto" | "en_proceso" | "resuelto"
  respuesta: text("respuesta"),
  respondido_por: uuid("respondido_por").references(() => usuarios.id, { onDelete: "set null" }),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
  respondido_en: timestamp("respondido_en"),
});

// ─── Relaciones ──────────────────────────────────────────────────────────────


export const restaurantesRelations = relations(restaurantes, ({ many }) => ({
  usuarioRestaurantes: many(usuarioRestaurantes),
  categoriasMenu: many(categoriasMenu),
  platillos: many(platillos),
  ingredientes: many(ingredientes),
  mesas: many(mesas),
  ordenes: many(ordenes),
  proveedores: many(proveedores),
  compras: many(compras),
  logAuditoria: many(logAuditoria),
  alertasInventario: many(alertasInventario),
  alertasAnomalias: many(alertasAnomalias),
  turnos: many(turnos),
  reportesDiariosEnviados: many(reportesDiariosEnviados),
  recordatoriosTrialEnviados: many(recordatoriosTrialEnviados),
  ticketsSoporte: many(ticketsSoporte),
}));

export const turnosRelations = relations(turnos, ({ one }) => ({
  restaurante: one(restaurantes, {
    fields: [turnos.restaurante_id],
    references: [restaurantes.id],
  }),
  abiertoPor: one(usuarios, {
    fields: [turnos.abierto_por],
    references: [usuarios.id],
  }),
  capturadoPor: one(usuarios, {
    fields: [turnos.capturado_por],
    references: [usuarios.id],
  }),
  cerradoPor: one(usuarios, {
    fields: [turnos.cerrado_por],
    references: [usuarios.id],
  }),
}));

export const alertasAnomaliasRelations = relations(alertasAnomalias, ({ one }) => ({
  restaurante: one(restaurantes, {
    fields: [alertasAnomalias.restaurante_id],
    references: [restaurantes.id],
  }),
  ingrediente: one(ingredientes, {
    fields: [alertasAnomalias.ingrediente_id],
    references: [ingredientes.id],
  }),
  usuario: one(usuarios, { fields: [alertasAnomalias.usuario_id], references: [usuarios.id] }),
}));

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  usuarioRestaurantes: many(usuarioRestaurantes),
}));

export const usuarioRestaurantesRelations = relations(usuarioRestaurantes, ({ one }) => ({
  usuario: one(usuarios, { fields: [usuarioRestaurantes.usuario_id], references: [usuarios.id] }),
  restaurante: one(restaurantes, {
    fields: [usuarioRestaurantes.restaurante_id],
    references: [restaurantes.id],
  }),
}));

export const platillosRelations = relations(platillos, ({ one, many }) => ({
  restaurante: one(restaurantes, {
    fields: [platillos.restaurante_id],
    references: [restaurantes.id],
  }),
  categoria: one(categoriasMenu, {
    fields: [platillos.categoria_id],
    references: [categoriasMenu.id],
  }),
  recetas: many(recetas),
  ordenItems: many(ordenItems),
}));

export const ingredientesRelations = relations(ingredientes, ({ one, many }) => ({
  restaurante: one(restaurantes, {
    fields: [ingredientes.restaurante_id],
    references: [restaurantes.id],
  }),
  recetas: many(recetas),
  movimientos: many(movimientosInventario),
  alertas: many(alertasInventario),
  predicciones: many(prediccionesDemanda),
}));

export const recetasRelations = relations(recetas, ({ one }) => ({
  platillo: one(platillos, { fields: [recetas.platillo_id], references: [platillos.id] }),
  ingrediente: one(ingredientes, {
    fields: [recetas.ingrediente_id],
    references: [ingredientes.id],
  }),
}));

export const ordenesRelations = relations(ordenes, ({ one, many }) => ({
  restaurante: one(restaurantes, {
    fields: [ordenes.restaurante_id],
    references: [restaurantes.id],
  }),
  mesa: one(mesas, { fields: [ordenes.mesa_id], references: [mesas.id] }),
  mesero: one(usuarios, { fields: [ordenes.mesero_id], references: [usuarios.id] }),
  items: many(ordenItems),
}));

export const ordenItemsRelations = relations(ordenItems, ({ one }) => ({
  orden: one(ordenes, { fields: [ordenItems.orden_id], references: [ordenes.id] }),
  platillo: one(platillos, { fields: [ordenItems.platillo_id], references: [platillos.id] }),
}));

export const comprasRelations = relations(compras, ({ one, many }) => ({
  restaurante: one(restaurantes, {
    fields: [compras.restaurante_id],
    references: [restaurantes.id],
  }),
  proveedor: one(proveedores, { fields: [compras.proveedor_id], references: [proveedores.id] }),
  items: many(compraItems),
}));

export const compraItemsRelations = relations(compraItems, ({ one }) => ({
  compra: one(compras, { fields: [compraItems.compra_id], references: [compras.id] }),
  ingrediente: one(ingredientes, {
    fields: [compraItems.ingrediente_id],
    references: [ingredientes.id],
  }),
}));

export const ticketsSoporteRelations = relations(ticketsSoporte, ({ one }) => ({
  restaurante: one(restaurantes, {
    fields: [ticketsSoporte.restaurante_id],
    references: [restaurantes.id],
  }),
  usuario: one(usuarios, {
    fields: [ticketsSoporte.usuario_id],
    references: [usuarios.id],
  }),
  respondidoPor: one(usuarios, {
    fields: [ticketsSoporte.respondido_por],
    references: [usuarios.id],
  }),
}));

// ─── Tipos inferidos ─────────────────────────────────────────────────────────


export type Restaurante = InferSelectModel<typeof restaurantes>;
export type NuevoRestaurante = InferInsertModel<typeof restaurantes>;

export type Usuario = InferSelectModel<typeof usuarios>;
export type NuevoUsuario = InferInsertModel<typeof usuarios>;

export type UsuarioRestaurante = InferSelectModel<typeof usuarioRestaurantes>;
export type NuevoUsuarioRestaurante = InferInsertModel<typeof usuarioRestaurantes>;

export type CategoriaMenu = InferSelectModel<typeof categoriasMenu>;
export type NuevaCategoriaMenu = InferInsertModel<typeof categoriasMenu>;

export type Platillo = InferSelectModel<typeof platillos>;
export type NuevoPlatillo = InferInsertModel<typeof platillos>;

export type Ingrediente = InferSelectModel<typeof ingredientes>;
export type NuevoIngrediente = InferInsertModel<typeof ingredientes>;

export type Receta = InferSelectModel<typeof recetas>;
export type NuevaReceta = InferInsertModel<typeof recetas>;

export type Mesa = InferSelectModel<typeof mesas>;
export type NuevaMesa = InferInsertModel<typeof mesas>;

export type Orden = InferSelectModel<typeof ordenes>;
export type NuevaOrden = InferInsertModel<typeof ordenes>;

export type OrdenItem = InferSelectModel<typeof ordenItems>;
export type NuevoOrdenItem = InferInsertModel<typeof ordenItems>;

export type MovimientoInventario = InferSelectModel<typeof movimientosInventario>;
export type NuevoMovimientoInventario = InferInsertModel<typeof movimientosInventario>;

export type Proveedor = InferSelectModel<typeof proveedores>;
export type NuevoProveedor = InferInsertModel<typeof proveedores>;

export type Compra = InferSelectModel<typeof compras>;
export type NuevaCompra = InferInsertModel<typeof compras>;

export type CompraItem = InferSelectModel<typeof compraItems>;
export type NuevoCompraItem = InferInsertModel<typeof compraItems>;

export type LogAuditoria = InferSelectModel<typeof logAuditoria>;
export type NuevoLogAuditoria = InferInsertModel<typeof logAuditoria>;

export type AlertaInventario = InferSelectModel<typeof alertasInventario>;
export type NuevaAlertaInventario = InferInsertModel<typeof alertasInventario>;

export type PrediccionDemanda = InferSelectModel<typeof prediccionesDemanda>;
export type NuevaPrediccionDemanda = InferInsertModel<typeof prediccionesDemanda>;

export type AlertaAnomalia = InferSelectModel<typeof alertasAnomalias>;
export type NuevaAlertaAnomalia = InferInsertModel<typeof alertasAnomalias>;

export type Turno = InferSelectModel<typeof turnos>;
export type NuevoTurno = InferInsertModel<typeof turnos>;

export type ReporteDiarioEnviado = InferSelectModel<typeof reportesDiariosEnviados>;
export type NuevoReporteDiarioEnviado = InferInsertModel<typeof reportesDiariosEnviados>;

export type RecordatorioTrialEnviado = InferSelectModel<typeof recordatoriosTrialEnviados>;
export type NuevoRecordatorioTrialEnviado = InferInsertModel<typeof recordatoriosTrialEnviados>;

export type AsignacionMesa = InferSelectModel<typeof asignacionesMesa>;
export type NuevaAsignacionMesa = InferInsertModel<typeof asignacionesMesa>;

export type SolicitudCancelacionItem = InferSelectModel<typeof solicitudesCancelacionItem>;
export type NuevaSolicitudCancelacionItem = InferInsertModel<typeof solicitudesCancelacionItem>;

export type Pago = InferSelectModel<typeof pagos>;
export type NuevoPago = InferInsertModel<typeof pagos>;

export type RegistroPendiente = InferSelectModel<typeof registrosPendientes>;
export type NuevoRegistroPendiente = InferInsertModel<typeof registrosPendientes>;

export type StripeEventoProcesado = InferSelectModel<typeof stripeEventosProcesados>;
export type NuevoStripeEventoProcesado = InferInsertModel<typeof stripeEventosProcesados>;

export type TicketSoporte = InferSelectModel<typeof ticketsSoporte>;
export type NuevoTicketSoporte = InferInsertModel<typeof ticketsSoporte>;

