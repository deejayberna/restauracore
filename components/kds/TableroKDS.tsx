"use client";

import { useEffect, useTransition, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { actualizarEstadoItem } from "@/lib/cocina-actions";
import { descontarInventarioPorOrden } from "@/lib/inventario-actions";
import type { ItemKDS, EstadoKDS } from "@/lib/kds-queries";

const COLUMNAS: { estado: EstadoKDS; label: string; color: string; siguiente?: EstadoKDS; accion?: string; btnColor: string }[] = [
  { estado: "pendiente",      label: "🔴 Pendiente",          color: "#fff3f3", siguiente: "en_preparacion", accion: "▶ Iniciar",  btnColor: "#e74c3c" },
  { estado: "en_preparacion", label: "🟡 En Preparación",     color: "#fffbf0", siguiente: "listo",          accion: "✓ Listo",    btnColor: "#f39c12" },
  { estado: "listo",          label: "🟢 Listo para entregar", color: "#f0fff4", btnColor: "#27ae60" },
];

interface Props {
  itemsIniciales: ItemKDS[];
  restaurante_id: string;
  restauranteNombre?: string;
}

export function TableroKDS({ itemsIniciales, restaurante_id, restauranteNombre }: Props) {
  const [items, setItems] = useState<ItemKDS[]>(itemsIniciales);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function imprimirComanda(itemPrincipal: ItemKDS) {
    const itemsOrden = items.filter((i) => i.orden_id === itemPrincipal.orden_id);
    const itemsImprimir = itemsOrden.length > 0 ? itemsOrden : [itemPrincipal];
    const fechaHora = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(itemPrincipal.creado_en));

    const itemsHtml = itemsImprimir
      .map(
        (it) => `
        <div style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold;">
            <span>${it.cantidad}x ${it.platillo_nombre}</span>
          </div>
          ${
            it.notas
              ? `<div style="font-size: 13px; font-weight: bold; background: #eee; padding: 3px 5px; margin-top: 3px; border-left: 3px solid #000;">
                  *** NOTA: ${it.notas} ***
                </div>`
              : ""
          }
        </div>
      `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=380,height=550");
    if (!printWindow) {
      alert("Por favor permite las ventanas emergentes en el navegador para imprimir la comanda.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Comanda - Mesa ${itemPrincipal.mesa_numero}</title>
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
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .header { font-size: 18px; font-weight: bold; text-transform: uppercase; }
            .sub { font-size: 13px; margin: 2px 0; }
            .mesa { font-size: 22px; font-weight: bold; margin: 6px 0; }
            .box-chef {
              border: 1px dashed #000;
              min-height: 48px;
              margin-top: 12px;
              padding: 4px;
              font-size: 11px;
            }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="header">${restauranteNombre || "RESTAURANTE"}</div>
            <div class="sub">--- COMANDA DE COCINA ---</div>
            <div class="divider"></div>
            <div class="mesa">MESA ${itemPrincipal.mesa_numero}</div>
            <div class="sub">Fecha/Hora: ${fechaHora}</div>
            <div class="sub">Folio: ORD-${itemPrincipal.orden_id.slice(0, 8).toUpperCase()}</div>
          </div>
          <div class="divider"></div>
          <div style="margin: 8px 0;">
            ${itemsHtml}
          </div>
          <div class="divider"></div>
          <div class="box-chef">
            <strong>Anotaciones manuales / Tiempos del Chef:</strong>
            <br /><br />
          </div>
          <div class="text-center" style="margin-top: 10px; font-size: 11px;">
            * RestauraCore KDS Térmico 80mm *
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }


  function moverItem(item_id: string, nuevoEstado: EstadoKDS) {
    setItems((prev) =>
      prev.map((i) => (i.id === item_id ? { ...i, estado: nuevoEstado } : i))
    );
    startTransition(async () => {
      const fd = new FormData();
      fd.set("item_id", item_id);
      let result: { error: string } | null = null;
      if (nuevoEstado === "listo") {
        result = await descontarInventarioPorOrden(null, fd);
      } else {
        fd.set("estado", nuevoEstado);
        await actualizarEstadoItem(fd);
      }
      if (result?.error) {
        setError(result.error);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item_id
              ? { ...i, estado: nuevoEstado === "listo" ? "en_preparacion" : "pendiente" }
              : i
          )
        );
      } else {
        setError(null);
      }
    });
  }

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`kds-${restaurante_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orden_items" }, (payload) => {
        if (payload.eventType === "INSERT") {
          fetch(`/api/kds/item/${payload.new.id}`)
            .then((r) => r.json())
            .then((item: ItemKDS) => {
              if (item)
                setItems((prev) => {
                  if (prev.find((i) => i.id === item.id)) return prev;
                  return [...prev, item];
                });
            })
            .catch(() => {});
        } else if (payload.eventType === "UPDATE") {
          setItems((prev) =>
            prev.map((i) =>
              i.id === payload.new.id ? { ...i, estado: payload.new.estado as EstadoKDS } : i
            )
          );
        } else if (payload.eventType === "DELETE") {
          setItems((prev) => prev.filter((i) => i.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurante_id]);

  return (
    <>
      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "0.75rem 1rem", margin: "0.5rem 1rem", borderRadius: "6px", fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", padding: "1rem", minHeight: "80vh" }}>
        {COLUMNAS.map((col) => (
          <div key={col.estado} style={{ background: col.color, borderRadius: "10px", padding: "1rem", border: "1px solid #e0e0e0" }}>
            <h2 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1rem", fontWeight: 700, color: "#1a1a1a" }}>
              {col.label}
              <span style={{ marginLeft: "0.5rem", background: "#1a1a1a", color: "#fff", borderRadius: "999px", padding: "2px 10px", fontSize: "0.8rem" }}>
                {items.filter((i) => i.estado === col.estado).length}
              </span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {items
                .filter((i) => i.estado === col.estado)
                .sort((a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime())
                .map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "#ffffff",
                      borderRadius: "8px",
                      padding: "0.875rem",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                      opacity: isPending ? 0.6 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <strong style={{ fontSize: "1rem", color: "#1a1a1a" }}>{item.platillo_nombre}</strong>
                      <span style={{ background: "#1a1a1a", color: "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "0.8rem", fontWeight: 600 }}>
                        Mesa {item.mesa_numero}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "#555", marginBottom: "0.25rem" }}>
                      Cantidad: <strong>{item.cantidad}</strong>
                    </div>
                    {item.notas && (
                      <div style={{ fontSize: "0.85rem", color: "#b45309", background: "#fef3c7", padding: "0.3rem 0.5rem", borderRadius: "4px", marginBottom: "0.4rem" }}>
                        📝 {item.notas}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                      <button
                        onClick={() => imprimirComanda(item)}
                        style={{
                          flex: col.siguiente ? 1 : undefined,
                          width: col.siguiente ? undefined : "100%",
                          padding: "0.5rem",
                          background: "#f1f5f9",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                        }}
                        title="Imprimir comanda térmica (80mm)"
                      >
                        🖨️ Comanda
                      </button>
                      {col.siguiente && col.accion && (
                        <button
                          onClick={() => moverItem(item.id, col.siguiente!)}
                          disabled={isPending}
                          style={{
                            flex: 1.5,
                            padding: "0.5rem",
                            background: col.btnColor,
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            cursor: isPending ? "not-allowed" : "pointer",
                          }}
                        >
                          {col.accion}
                        </button>
                      )}
                    </div>
                  </div>

                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
