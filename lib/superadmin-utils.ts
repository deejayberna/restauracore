/**
 * Utilidades compartidas para validación de Super-Admin en RestauraCore.
 * Compatible con Edge Runtime (middleware.ts), Server Actions y Node.js.
 *
 * SEGURIDAD:
 * - Lee EXCLUSIVAMENTE de SUPER_ADMIN_EMAILS (variable de entorno server-side).
 * - Si la variable no existe o está vacía, retorna lista vacía → acceso denegado.
 * - Sin fallbacks, sin valores por defecto, sin correos en el código.
 */

export function getSuperAdminEmails(): string[] {
  const rawSuperAdmins = process.env.SUPER_ADMIN_EMAILS ?? "";

  return rawSuperAdmins
    .split(",")
    .map((e) => e.replace(/['"]/g, "").trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const emails = getSuperAdminEmails();
  return emails.includes(email.trim().toLowerCase());
}
