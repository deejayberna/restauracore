import { z, ZodSchema } from "zod";
import { ValidationError } from "./errors";

export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new ValidationError(message);
  }
  return result.data;
}

// Re-exporta z para que los consumidores no necesiten importar zod directamente
export { z };
