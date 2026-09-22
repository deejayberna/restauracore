/**
 * Utilidades compartidas para validación de Super-Admin en RestauraCore.
 * Compatible con Edge Runtime (middleware.ts), Server Actions y Node.js.
 *
 * SEGURIDAD:
 * - Lee de la variable de entorno SUPER_ADMIN_EMAILS (server-side).
 * - Fallback a NEXT_PUBLIC_SUPER_ADMIN_EMAILS para compatibilidad con
 *   Edge Middleware bundling en Vercel (donde env vars sin prefijo
 *   NEXT_PUBLIC_ pueden no estar inlineadas en el bundle de Edge).
 * - NUNCA hardcodear correos directamente en el código fuente.
 */

export function getSuperAdminEmails(): string[] {
  const rawSuperAdmins =
    process.env.SUPER_ADMIN_EMAILS ||
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ||
    "";

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
