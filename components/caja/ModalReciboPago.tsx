"use client";

import React, { useEffect, useState } from "react";
import { obtenerDatosReciboAction, type DatosRecibo } from "@/lib/recibo-actions";
import { Button } from "@/components/ui/Button";
import { Printer, X, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

interface ModalReciboPagoProps {
  ordenId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ModalReciboPago({ ordenId, isOpen, onClose }: ModalReciboPagoProps) {
  const [datos, setDatos] = useState<DatosRecibo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && ordenId) {
      setLoading(true);
      setError(null);
      obtenerDatosReciboAction(ordenId)
        .then((res) => {
          setDatos(res);
        })
        .catch((err) => {
          console.error("Error al cargar recibo:", err);
          setError(err.message || "No se pudo cargar la información del recibo.");
        })
        .finally(() => setLoading(false));
    } else {
      setDatos(null);
    }
  }, [isOpen, ordenId]);

  if (!isOpen) return null;

  function imprimirRecibo() {
    if (!datos) return;

    const itemsHtml = datos.items
      .map(
        (it) => `
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px; font-size: 13px;">
          <span>${it.cantidad}x ${it.platillo}</span>
          <span style="font-weight:bold;">$${it.total.toFixed(2)}</span>
        </div>
        ${
          it.notas
            ? `<div style="font-size: 11px; color: #555; margin-left: 10px;">${it.notas}</div>`
            : ""
        }
      `
      )
      .join("");

    const propinasHtml = Object.entries(datos.propinaPorMetodo)
      .map(
        ([metodo, monto]) =>
          `<div style="display:flex; justify-content:space-between; font-size:12px; color:#333;">
            <span style="text-transform:capitalize;">Propina (${metodo}):</span>
            <span>+$${monto.toFixed(2)}</span>
          </div>`
      )
      .join("");

    const pagosHtml = datos.pagos
      .map(
        (p) =>
          `<div style="display:flex; justify-content:space-between; font-size:12px;">
            <span style="text-transform:capitalize;">${p.metodo}:</span>
            <span>$${(p.monto + p.propina).toFixed(2)}</span>
          </div>`
      )
      .join("");

    const printWin = window.open("", "_blank", "width=380,height=600");
    if (!printWin) {
      alert("Por favor permite las ventanas emergentes para imprimir el recibo.");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo de Cobro - ${datos.folio}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace, sans-serif;
              width: 74mm;
              margin: 3mm auto;
              padding: 0;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
            .subtitle { font-size: 11px; margin-bottom: 2px; }
            .disclaimer {
              font-size: 10px;
              font-weight: bold;
              border: 1px solid #000;
              padding: 4px;
              margin: 6px 0;
              text-align: center;
              line-height: 1.2;
            }
            .row { display: flex; justify-content: space-between; font-size: 13px; margin: 2px 0; }
            .total-row { font-size: 16px; font-weight: bold; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="title">${datos.restaurante.nombre}</div>
            ${datos.restaurante.direccion ? `<div class="subtitle">${datos.restaurante.direccion}</div>` : ""}
            <div class="divider"></div>
            <div class="disclaimer">
              COMPROBANTE DE PAGO / RECIBO SIMPLE<br />
              * NO VÁLIDO COMO FACTURA FISCAL (CFDI) *
            </div>
            <div class="divider"></div>
            <div class="subtitle bold">${datos.mesa} | ${datos.folio}</div>
            <div class="subtitle">${datos.fecha}</div>
          </div>
          <div class="divider"></div>
          <div>${itemsHtml}</div>
          <div class="divider"></div>
          <div class="row">
            <span>Subtotal:</span>
            <span>$${datos.subtotal.toFixed(2)}</span>
          </div>
          ${propinasHtml}
          <div class="divider"></div>
          <div class="row total-row">
            <span>TOTAL PAGADO:</span>
            <span>$${datos.total.toFixed(2)}</span>
          </div>
          <div class="divider"></div>
          <div style="margin: 4px 0;">
            <div class="bold subtitle">Métodos de Pago:</div>
            ${pagosHtml}
          </div>
          <div class="divider"></div>
          <div class="center" style="margin-top: 12px; font-size: 12px;">
            ¡Gracias por su preferencia!<br />
            <span style="font-size: 9px; color: #555;">RestauraCore Cloud POS</span>
          </div>
        </body>
      </html>
    `);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 300);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
              Recibo Térmico de Pago (80mm)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 text-slate-800 dark:text-slate-200">
          {loading && (
            <div className="py-12 text-center text-slate-500 text-sm">
              <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto mb-2" />
              Cargando desglose del recibo...
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {datos && (
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-5 font-mono text-xs shadow-inner space-y-3">
              {/* Encabezado Recibo */}
              <div className="text-center space-y-1">
                <div className="font-bold text-sm tracking-wider uppercase text-slate-900 dark:text-slate-50">
                  {datos.restaurante.nombre}
                </div>
                {datos.restaurante.direccion && (
                  <div className="text-[11px] text-slate-500">{datos.restaurante.direccion}</div>
                )}
                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-2" />
                <div className="bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[10px] p-2 rounded font-bold leading-tight">
                  COMPROBANTE DE PAGO / RECIBO SIMPLE
                  <br />
                  * NO VÁLIDO COMO FACTURA FISCAL (CFDI) *
                </div>
                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-2" />
                <div className="flex justify-between text-slate-600 dark:text-slate-400 font-semibold">
                  <span>{datos.mesa}</span>
                  <span>{datos.folio}</span>
                </div>
                <div className="text-[10px] text-slate-500 text-right">{datos.fecha}</div>
              </div>

              {/* Items */}
              <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1.5">
                {datos.items.map((it, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between items-center text-slate-800 dark:text-slate-200">
                      <span>
                        {it.cantidad}x {it.platillo}
                      </span>
                      <span className="font-bold">${it.total.toFixed(2)}</span>
                    </div>
                    {it.notas && (
                      <div className="text-[10px] text-slate-500 italic pl-3">
                        Nota: {it.notas}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desglose Totales */}
              <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal:</span>
                  <span>${datos.subtotal.toFixed(2)}</span>
                </div>
                {Object.entries(datos.propinaPorMetodo).map(([metodo, monto]) => (
                  <div key={metodo} className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span className="capitalize">Propina ({metodo}):</span>
                    <span>+${monto.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-400 dark:border-slate-600 pt-1 flex justify-between font-bold text-sm text-slate-900 dark:text-slate-50">
                  <span>TOTAL PAGADO:</span>
                  <span>${datos.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Métodos de Pago */}
              <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1">
                <div className="font-semibold text-slate-600 dark:text-slate-400">Pagos Registrados:</div>
                {datos.pagos.map((p, idx) => (
                  <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span className="capitalize">{p.metodo}</span>
                    <span>${(p.monto + p.propina).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Pie de Recibo */}
              <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-3 text-center text-slate-500 text-[11px]">
                ¡Gracias por su visita!
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={imprimirRecibo}
            disabled={!datos || loading}
            className="flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Imprimir Recibo (80mm)
          </Button>
        </div>
      </div>
    </div>
  );
}

