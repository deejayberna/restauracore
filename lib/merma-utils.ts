import { z } from "@/lib/validation";

// Límite de tamaño: 5 MB
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB en bytes
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const STORAGE_BUCKET = "mermas-evidencia";

export interface MermaInput {
  ingrediente_id: string;
  cantidad: number;
  motivo: string;
}

export interface ValidacionArchivoResult {
  valido: boolean;
  error?: string;
  extension?: string;
}

export interface ResultadoRegistroMerma {
  ok: boolean;
  movimiento_id?: string;
  foto_path?: string | null;
  stock_anterior?: number;
  stock_restante?: number;
  error?: string;
  codigo?: string;
}

/**
 * Esquema Zod de validación de datos base de la merma.
 */
export const mermaSchema = z.object({
  ingrediente_id: z.string().uuid("Identificador de ingrediente inválido"),
  cantidad: z
    .number({ message: "La cantidad debe ser un número válido" })
    .positive("La cantidad de merma debe ser mayor a cero"),
  motivo: z
    .string()
    .min(3, "El motivo debe tener al menos 3 caracteres")
    .max(500, "El motivo no puede exceder 500 caracteres"),
});

/**
 * Función pura que valida la cantidad contra el stock actual disponible.
 * Exportada para pruebas unitarias.
 */
export function validarStockParaMerma(
  cantidad: number,
  stockActual: number
): { valido: boolean; error?: string } {
  if (cantidad <= 0) {
    return { valido: false, error: "La cantidad de merma debe ser mayor a cero." };
  }
  if (cantidad > stockActual) {
    return {
      valido: false,
      error: `La cantidad a mermar (${cantidad}) no puede exceder el stock actual disponible (${stockActual}).`,
    };
  }
  return { valido: true };
}

/**
 * Función pura que valida el archivo de evidencia fotográfica.
 * Exportada para pruebas unitarias.
 */
export function validarArchivoEvidencia(archivo: {
  size: number;
  type: string;
  name?: string;
} | null | undefined): ValidacionArchivoResult {
  if (!archivo) {
    return { valido: true }; // La foto es opcional
  }

  if (archivo.size > MAX_FILE_SIZE) {
    return {
      valido: false,
      error: `El archivo supera el tamaño máximo permitido de 5 MB (${(archivo.size / 1024 / 1024).toFixed(2)} MB).`,
    };
  }

  const mime = archivo.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mime as any)) {
    return {
      valido: false,
      error: "Formato no permitido. Solo se aceptan imágenes en formato JPG, PNG o WebP.",
    };
  }

  let extension = "jpg";
  if (mime === "image/png") extension = "png";
  if (mime === "image/webp") extension = "webp";

  return { valido: true, extension };
}

