/**
 * Utilidades compartidas para validación de Super-Admin en RestauraCore.
 * Compatible con Edge Runtime (middleware.ts), Server Actions y Node.js.
 * 
 * SEGURIDAD:
 * - Lee exclusivamente la variable de entorno SUPER_ADMIN_EMAILS.
 * - NUNCA usar valores hardcodeados ni NEXT_PUBLIC_* para listas de administradores.
 */

export function getSuperAdminEmails(): string[] {
  const rawSuperAdmins = process.env.SUPER_ADMIN_EMAILS || "";

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

