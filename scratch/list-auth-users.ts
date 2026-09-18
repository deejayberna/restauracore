import { createSupabaseAdminClient } from "../lib/supabase-admin";
import { config } from "dotenv";
config({ path: ".env.local" });

async function checkUsers() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    console.error("Error listing users:", error);
    process.exit(1);
  }
  console.log(`Found ${data.users.length} users in Supabase Auth:`);
  data.users.forEach((u) => console.log(`- ${u.email} (id: ${u.id})`));
  process.exit(0);
}

checkUsers();

