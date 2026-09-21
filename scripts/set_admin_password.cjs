/**
 * Script para crear o actualizar la contraseña de un Super-Admin en Supabase Auth de Producción.
 * Uso:
 *   node scripts/set_admin_password.cjs <correo> <contraseña>
 * Ejemplo:
 *   node scripts/set_admin_password.cjs mi-correo@gmail.com MiPasswordSeguro123!
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de producción
const envPath = path.resolve(__dirname, '../.env.production.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: No se encontró el archivo .env.production.local');
  process.exit(1);
}

const env = dotenv.parse(fs.readFileSync(envPath));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están definidas en .env.production.local');
  process.exit(1);
}

const email = process.argv[2]?.trim();
const password = process.argv[3]?.trim();

if (!email || !password) {
  console.log('\nUso del script:');
  console.log('  node scripts/set_admin_password.cjs <correo> <contraseña>\n');
  console.log('Ejemplo:');
  console.log('  node scripts/set_admin_password.cjs tu-email@dominio.com TuPassword123!\n');
  process.exit(1);
}

if (password.length < 6) {
  console.error('❌ La contraseña debe tener al menos 6 caracteres.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log(`\n🔍 Verificando usuario "${email}" en Supabase Auth de Producción...`);
  
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Error consultando usuarios en Supabase:', listErr.message);
    process.exit(1);
  }

  const existingUser = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    console.log(`👤 Usuario encontrado (ID: ${existingUser.id}). Actualizando contraseña...`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    });
    if (updateErr) {
      console.error('❌ Error actualizando contraseña:', updateErr.message);
      process.exit(1);
    }
    console.log('✅ ¡Contraseña actualizada exitosamente y correo confirmado!');
  } else {
    console.log(`➕ El usuario no existe en Auth. Creando nueva cuenta confirmada...`);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      console.error('❌ Error creando usuario:', createErr.message);
      process.exit(1);
    }
    console.log(`✅ ¡Usuario creado exitosamente (ID: ${created.user.id}) con contraseña activa!`);
  }

  console.log(`\n🎉 Todo listo: Ya puedes ingresar a https://restauracore.vercel.app/login con:`);
  console.log(`   Email   : ${email}`);
  console.log(`   Password: [la contraseña que definiste]`);
  console.log(`   (Al ingresar, el sistema te redirigirá directamente a /superadmin)\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});

