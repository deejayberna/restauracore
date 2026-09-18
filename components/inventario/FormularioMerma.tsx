"use client";

import React, { useState, useTransition, useMemo } from "react";
import { registrarMermaAction } from "@/lib/merma-actions";
import Link from "next/link";

interface IngredienteOpcion {
  id: string;
  nombre: string;
  unidad_medida: string;
  stock_actual: string;
  stock_minimo: string;
  costo_unitario: string;
}

interface FormularioMermaProps {
  ingredientes: IngredienteOpcion[];
}

/**
 * Función en cliente para comprimir imágenes usando canvas antes del upload.
 * Reduce resolución a máx 1920px y calidad a 0.82 para cumplir con el límite y optimizar ancho de banda.
 */
async function comprimirImagenCliente(file: File): Promise<File> {
  // Si no es imagen o es menor a 800KB, enviamos el archivo original
  if (!file.type.startsWith("image/") || file.size < 800 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const maxWidth = 1920;
        const maxHeight = 1080;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Exportar como jpeg o webp con compresión
        const outputFormat = file.type === "image/png" ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file); // Si la compresión no ahorró espacio, mantener el original
            } else {
              const compressedFile = new File([blob], file.name, {
                type: outputFormat,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            }
          },
          outputFormat,
          0.82
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

export function FormularioMerma({ ingredientes }: FormularioMermaProps) {
  const [ingredienteSeleccionadoId, setIngredienteSeleccionadoId] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [archivoFoto, setArchivoFoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<{
    texto: string;
    movimientoId?: string;
    stockRestante?: number;
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  const ingredienteActual = useMemo(() => {
    return ingredientes.find((i) => i.id === ingredienteSeleccionadoId) ?? null;
  }, [ingredientes, ingredienteSeleccionadoId]);

  const stockActualNum = ingredienteActual ? parseFloat(ingredienteActual.stock_actual) : 0;
  const cantidadNum = parseFloat(cantidad) || 0;
  const stockRestante = stockActualNum - cantidadNum;
  const excedeStock = ingredienteActual && cantidadNum > stockActualNum;

  // Manejador del archivo de foto con validación estricta de formatos
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorValidacion(null);
    const files = e.target.files;
    if (!files || files.length === 0) {
      setArchivoFoto(null);
      setPreviewUrl(null);
      return;
    }

    const file = files[0];
    const mime = file.type.toLowerCase();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

    // Rechazar explícitamente HEIC / HEIF o formatos no soportados
    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];
    const extensionesPermitidas = ["jpg", "jpeg", "png", "webp"];

    if (!tiposPermitidos.includes(mime) && !extensionesPermitidas.includes(extension)) {
      setErrorValidacion(
        "Formato no admitido. Solo se aceptan imágenes en JPG, PNG o WebP. No se admiten archivos HEIC/HEIF."
      );
      e.target.value = "";
      setArchivoFoto(null);
      setPreviewUrl(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorValidacion(
        `El archivo supera el límite de 5 MB (${(file.size / 1024 / 1024).toFixed(2)} MB). Por favor selecciona una imagen más liviana.`
      );
      e.target.value = "";
      setArchivoFoto(null);
      setPreviewUrl(null);
      return;
    }

    // Comprimir en cliente
    const archivoComprimido = await comprimirImagenCliente(file);
    setArchivoFoto(archivoComprimido);
    setPreviewUrl(URL.createObjectURL(archivoComprimido));
  };

  const handleEliminarFoto = () => {
    setArchivoFoto(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValidacion(null);
    setMensajeExito(null);

    if (!ingredienteSeleccionadoId) {
      setErrorValidacion("Selecciona un ingrediente para registrar la merma.");
      return;
    }

    if (cantidadNum <= 0 || isNaN(cantidadNum)) {
      setErrorValidacion("La cantidad de merma debe ser un número mayor a cero.");
      return;
    }

    if (excedeStock) {
      setErrorValidacion(
        `La cantidad a mermar (${cantidadNum}) excede el stock actual disponible (${stockActualNum} ${ingredienteActual?.unidad_medida}).`
      );
      return;
    }

    if (motivo.trim().length < 3) {
      setErrorValidacion("El motivo debe tener al menos 3 caracteres.");
      return;
    }

    const formData = new FormData();
    formData.append("ingrediente_id", ingredienteSeleccionadoId);
    formData.append("cantidad", cantidad);
    formData.append("motivo", motivo.trim());

    if (archivoFoto) {
      formData.append("foto", archivoFoto);
    }

    startTransition(async () => {
      try {
        const resultado = await registrarMermaAction(formData);
        if (!resultado.ok) {
          setErrorValidacion(resultado.error ?? "Ocurrió un error al registrar la merma.");
        } else {
          setMensajeExito({
            texto: `Merma de ${cantidad} ${ingredienteActual?.unidad_medida} registrada exitosamente.`,
            movimientoId: resultado.movimiento_id,
            stockRestante: resultado.stock_restante,
          });
          // Limpiar campos
          setCantidad("");
          setMotivo("");
          handleEliminarFoto();
        }
      } catch (err: any) {
        setErrorValidacion(err.message ?? "Error inesperado al comunicarse con el servidor.");
      }
    });
  };

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      {mensajeExito && (
        <div
          style={{
            padding: "1rem",
            marginBottom: "1.5rem",
            background: "#ecfdf5",
            border: "1px solid #10b981",
            borderRadius: "8px",
            color: "#065f46",
          }}
        >
          <p style={{ fontWeight: 600, margin: 0 }}>✓ {mensajeExito.texto}</p>
          {mensajeExito.stockRestante !== undefined && (
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
              Nuevo stock disponible: <strong>{mensajeExito.stockRestante.toFixed(3)}</strong>
            </p>
          )}
          {mensajeExito.movimientoId && (
            <div style={{ marginTop: "0.5rem" }}>
              <Link
                href={`/inventario/merma/${mensajeExito.movimientoId}`}
                style={{
                  fontSize: "0.85rem",
                  color: "#047857",
                  textDecoration: "underline",
                  fontWeight: 500,
                }}
              >
                Ver detalle de la merma y evidencia fotográfica →
              </Link>
            </div>
          )}
        </div>
      )}

      {errorValidacion && (
        <div
          style={{
            padding: "1rem",
            marginBottom: "1.5rem",
            background: "#fef2f2",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            color: "#991b1b",
          }}
        >
          <strong>Error:</strong> {errorValidacion}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          padding: "2rem",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {/* Selector de Ingrediente */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label
            htmlFor="ingrediente"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}
          >
            Ingrediente a Mermar *
          </label>
          <select
            id="ingrediente"
            value={ingredienteSeleccionadoId}
            onChange={(e) => {
              setIngredienteSeleccionadoId(e.target.value);
              setErrorValidacion(null);
            }}
            disabled={isPending}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              fontSize: "1rem",
              background: "#ffffff",
            }}
            required
          >
            <option value="">-- Selecciona un ingrediente --</option>
            {ingredientes.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.nombre} (Stock: {parseFloat(ing.stock_actual).toFixed(2)} {ing.unidad_medida})
              </option>
            ))}
          </select>
        </div>

        {/* Panel informativo del stock actual */}
        {ingredienteActual && (
          <div
            style={{
              padding: "1rem",
              background: "#f9fafb",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              marginBottom: "1.5rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
              fontSize: "0.9rem",
            }}
          >
            <div>
              <span style={{ color: "#6b7280" }}>Stock actual disponible:</span>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111827" }}>
                {stockActualNum.toFixed(3)} {ingredienteActual.unidad_medida}
              </div>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Stock tras la merma:</span>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: excedeStock ? "#dc2626" : stockRestante <= 0 ? "#d97706" : "#059669",
                }}
              >
                {cantidadNum > 0 ? stockRestante.toFixed(3) : stockActualNum.toFixed(3)}{" "}
                {ingredienteActual.unidad_medida}
              </div>
            </div>
          </div>
        )}

        {/* Cantidad a mermar */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label
            htmlFor="cantidad"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}
          >
            Cantidad a Mermar ({ingredienteActual ? ingredienteActual.unidad_medida : "unidades"}) *
          </label>
          <input
            id="cantidad"
            type="number"
            step="any"
            min="0.001"
            max={stockActualNum > 0 ? stockActualNum : undefined}
            value={cantidad}
            onChange={(e) => {
              setCantidad(e.target.value);
              setErrorValidacion(null);
            }}
            placeholder="0.00"
            disabled={isPending || !ingredienteActual}
            required
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "6px",
              border: excedeStock ? "2px solid #ef4444" : "1px solid #d1d5db",
              fontSize: "1rem",
              background: !ingredienteActual ? "#f3f4f6" : "#ffffff",
            }}
          />
          {excedeStock && (
            <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: "0.25rem", margin: 0 }}>
              ⚠ La cantidad no puede exceder el stock actual ({stockActualNum} {ingredienteActual?.unidad_medida}).
            </p>
          )}
        </div>

        {/* Motivo de la merma */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label
            htmlFor="motivo"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}
          >
            Motivo de la Merma *
          </label>
          <textarea
            id="motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Producto caducado, rotura en empaque, quemado en cocción, refrigeración fallida..."
            disabled={isPending}
            required
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              fontSize: "1rem",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Evidencia Fotográfica (Opcional pero recomendada) */}
        <div style={{ marginBottom: "2rem" }}>
          <label
            htmlFor="foto"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem", color: "#374151" }}
          >
            Evidencia Fotográfica (Recomendada para mermas grandes)
          </label>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.5rem" }}>
            Formatos admitidos: <strong>JPG, PNG, WebP</strong> (Máx. 5 MB). Compresión automática antes de subir.
          </p>

          <input
            id="foto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={isPending}
            style={{
              display: "block",
              width: "100%",
              fontSize: "0.9rem",
              padding: "0.5rem 0",
            }}
          />

          {previewUrl && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                background: "#f9fafb",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>
                  Vista previa de la evidencia ({archivoFoto ? (archivoFoto.size / 1024).toFixed(0) : 0} KB):
                </span>
                <button
                  type="button"
                  onClick={handleEliminarFoto}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#dc2626",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Eliminar foto
                </button>
              </div>
              <img
                src={previewUrl}
                alt="Vista previa evidencia"
                style={{
                  maxWidth: "100%",
                  maxHeight: "240px",
                  borderRadius: "4px",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          )}
        </div>

        {/* Botón de envío */}
        <button
          type="submit"
          disabled={isPending || excedeStock || !ingredienteActual || cantidadNum <= 0}
          style={{
            width: "100%",
            padding: "0.85rem",
            background: isPending || excedeStock ? "#9ca3af" : "#dc2626",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: isPending || excedeStock ? "not-allowed" : "pointer",
            transition: "background 0.2s",
          }}
        >
          {isPending ? "Registrando merma y subiendo evidencia..." : "Confirmar y Registrar Merma"}
        </button>
      </form>
    </div>
  );
}

