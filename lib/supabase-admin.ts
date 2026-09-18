import { createClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo de Supabase con Service Role Key.
 * EXCLUSIVO para operaciones del lado del servidor que requieren permisos elevados
 * (por ejemplo, invitar usuarios mediante auth.admin.inviteUserByEmail).
 * NUNCA exponer al cliente / navegador.
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas para operaciones de administración."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

