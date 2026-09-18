/**
 * RestauraCore — Definición de Planes y Feature Gating (Fase 11)
 * Alineado al 100% con Plan-Financiero-RestauraCore.md
 */

export type Plan = "basico" | "pro" | "enterprise";

export type Feature =
  // Básico ($799 MXN/mes)
  | "menu_digital"
  | "pedido_qr"
  | "cocina_kds"
  | "cuenta_abierta"
  // Pro ($1,499 MXN/mes)
  | "inventario_automatico"
  | "alertas_stock"
  | "food_cost"
  | "arqueo_caja"
  | "mermas_evidencia"
  | "control_cancelaciones"
  // Enterprise ($2,999 MXN/mes)
  | "ia_prediccion"
  | "ia_anomalias"
  | "ia_menu_engineering"
  | "dashboard_multisucursal"
  | "compras_proveedores"
  | "auditoria_avanzada";

export const PLAN_JERARQUIA: Record<Plan, number> = {
  basico: 1,
  pro: 2,
  enterprise: 3,
};

export const FEATURE_PLAN_MINIMO: Record<Feature, Plan> = {
  menu_digital: "basico",
  pedido_qr: "basico",
  cocina_kds: "basico",
  cuenta_abierta: "basico",

  inventario_automatico: "pro",
  alertas_stock: "pro",
  food_cost: "pro",
  arqueo_caja: "pro",
  mermas_evidencia: "pro",
  control_cancelaciones: "pro",

  ia_prediccion: "enterprise",
  ia_anomalias: "enterprise",
  ia_menu_engineering: "enterprise",
  dashboard_multisucursal: "enterprise",
  compras_proveedores: "enterprise",
  auditoria_avanzada: "enterprise",
};

/**
 * Verifica si un plan dado tiene permiso para acceder a una funcionalidad.
 */
export function tienePermisoPlan(planActual: Plan | null | undefined, feature: Feature): boolean {
  if (!planActual) return false;
  const planMinimo = FEATURE_PLAN_MINIMO[feature];
  return PLAN_JERARQUIA[planActual] >= PLAN_JERARQUIA[planMinimo];
}

export interface RestauranteResumenPlan {
  id: string;
  nombre: string;
  plan: Plan;
  estado_suscripcion?: string | null;
}

export interface ResultadoMultiSucursal {
  permitido: boolean;
  sucursalesConsolidadas: RestauranteResumenPlan[];
  sucursalesPendientesUpgrade: RestauranteResumenPlan[];
}

/**
 * Regla Multi-Sucursal (Opción A):
 * - El Dashboard Consolidado se activa si AL MENOS UNO de los restaurantes vinculados
 *   está en plan 'enterprise' (activo o trial).
 * - En las métricas consolidadas se incluyen ÚNICAMENTE los restaurantes en plan 'enterprise'.
 * - Los restaurantes en planes inferiores (básico o pro) se listan por separado como
 *   pendientes de upgrade con un botón/aviso claro (nunca se ocultan sin explicación).
 */
export function evaluarAccesoMultiSucursal(
  restaurantes: RestauranteResumenPlan[]
): ResultadoMultiSucursal {
  const sucursalesConsolidadas: RestauranteResumenPlan[] = [];
  const sucursalesPendientesUpgrade: RestauranteResumenPlan[] = [];

  for (const r of restaurantes) {
    if (r.plan === "enterprise") {
      sucursalesConsolidadas.push(r);
    } else {
      sucursalesPendientesUpgrade.push(r);
    }
  }

  return {
    permitido: sucursalesConsolidadas.length > 0,
    sucursalesConsolidadas,
    sucursalesPendientesUpgrade,
  };
}

export interface InfoPlan {
  id: Plan;
  nombre: string;
  precioMensual: number;
  precioTexto: string;
  descripcion: string;
  destacado?: boolean;
  caracteristicas: string[];
}

export const PLANES_DETALLE: Record<Plan, InfoPlan> = {
  basico: {
    id: "basico",
    nombre: "Básico",
    precioMensual: 799,
    precioTexto: "$799 MXN / mes",
    descripcion: "Para restaurantes que quieren digitalizar pedidos y agilizar cocina de inmediato.",
    caracteristicas: [
      "Menú digital QR autogestionable",
      "Pedido en mesa por tablet / código QR",
      "Comandera de cocina en tiempo real (KDS)",
      "Cuenta abierta y pagos en mesa",
      "Soporte por correo electrónico",
    ],
  },
  pro: {
    id: "pro",
    nombre: "Pro",
    precioMensual: 1499,
    precioTexto: "$1,499 MXN / mes",
    descripcion: "El plan ancla para el control operativo total, inventarios automáticos y cero fugas.",
    destacado: true,
    caracteristicas: [
      "Todo lo incluido en Básico",
      "Inventario automático descontado por recetas",
      "Alertas de stock bajo y crítico en tiempo real",
      "Cálculo de Food Cost y reporte de rentabilidad",
      "Control de turnos y arqueo ciego de caja",
      "Registro de mermas con evidencia fotográfica",
      "Flujo de cancelaciones supervisadas anti-fraude",
    ],
  },
  enterprise: {
    id: "enterprise",
    nombre: "Enterprise",
    precioMensual: 2999,
    precioTexto: "$2,999 MXN / mes",
    descripcion: "Para grupos y restaurantes en expansión que demandan IA predictiva y visión multi-sucursal.",
    caracteristicas: [
      "Todo lo incluido en Pro",
      "IA: Predicción de demanda a 7 días con clima y festivos",
      "IA: Detección estadística de anomalías y mermas sospechosas",
      "IA: Menu Engineering (Matriz BCG de popularidad y margen)",
      "Dashboard multi-sucursal consolidado",
      "Módulo de compras, recepción y comparador de proveedores",
      "Pistas de auditoría forense inmutable",
    ],
  },
};

