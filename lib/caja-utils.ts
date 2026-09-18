export interface ResumenMetodosPago {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  total: number;
  ordenes_count: number;
}

export interface ConteoFisicoInput {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  notas?: string | null;
  capturado_por_id?: string;
  capturado_por_nombre?: string;
  capturado_por_rol?: string;
}

export interface DetalleMetodoDiferencia {
  sistema: number;
  fisico: number;
  diferencia: number;
}

export interface DiferenciasMetodosPago {
  efectivo: DetalleMetodoDiferencia;
  tarjeta: DetalleMetodoDiferencia;
  transferencia: DetalleMetodoDiferencia;
  total: DetalleMetodoDiferencia;
  hay_discrepancia: boolean;
  tipo_discrepancia: "cuadrado" | "faltante" | "sobrante";
}

export interface EstadoTurnoInfo {
  id: string;
  codigo: string;
  estado: "abierto" | "cerrado";
  fecha_inicio: string;
  fecha_cierre?: string | null;
  abierto_por_id: string;
  cerrado_por_id?: string | null;
  responsable_id?: string | null;
  monto_fisico?: any;
  monto_sistema?: any;
  diferencias?: any;
  hay_discrepancia: boolean;
}

export type ResultadoCierreCaja =
  | {
      ok: false;
      codigo: string;
      error: string;
    }
  | {
      ok: true;
      turno_id: string;
      codigo: string;
      accion: string;
      auditoria_id?: string;
      diferencias: DiferenciasMetodosPago;
      hay_discrepancia: boolean;
      autorizado_por: { usuario_id: string; nombre: string; rol: string };
      capturado_por: { usuario_id: string; nombre: string; rol: string };
    };

/**
 * Función pura que calcula diferencias entre el sistema y el conteo físico.
 * Exportada para pruebas unitarias deterministas y lógica de caja.
 */
export function calcularDiscrepanciasCaja(
  sistema: ResumenMetodosPago,
  fisico: ConteoFisicoInput
): DiferenciasMetodosPago {
  const diffEfectivo = Number((fisico.efectivo - sistema.efectivo).toFixed(2));
  const diffTarjeta = Number((fisico.tarjeta - sistema.tarjeta).toFixed(2));
  const diffTransfer = Number((fisico.transferencia - sistema.transferencia).toFixed(2));
  const totalFisico = Number((fisico.efectivo + fisico.tarjeta + fisico.transferencia).toFixed(2));
  const totalSistema = Number(sistema.total.toFixed(2));
  const diffTotal = Number((totalFisico - totalSistema).toFixed(2));

  const hayDiscrepancia =
    Math.abs(diffEfectivo) >= 0.01 ||
    Math.abs(diffTarjeta) >= 0.01 ||
    Math.abs(diffTransfer) >= 0.01 ||
    Math.abs(diffTotal) >= 0.01;

  let tipoDiscrepancia: "cuadrado" | "faltante" | "sobrante" = "cuadrado";
  if (diffTotal < -0.009) {
    tipoDiscrepancia = "faltante";
  } else if (diffTotal > 0.009) {
    tipoDiscrepancia = "sobrante";
  }

  return {
    efectivo: {
      sistema: sistema.efectivo,
      fisico: fisico.efectivo,
      diferencia: diffEfectivo,
    },
    tarjeta: {
      sistema: sistema.tarjeta,
      fisico: fisico.tarjeta,
      diferencia: diffTarjeta,
    },
    transferencia: {
      sistema: sistema.transferencia,
      fisico: fisico.transferencia,
      diferencia: diffTransfer,
    },
    total: {
      sistema: totalSistema,
      fisico: totalFisico,
      diferencia: diffTotal,
    },
    hay_discrepancia: hayDiscrepancia,
    tipo_discrepancia: tipoDiscrepancia,
  };
}

