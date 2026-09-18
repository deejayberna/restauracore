import { db } from "@/db";
import { sql } from "drizzle-orm";

async function checkGrants() {
  const grants: any = await db.execute(sql`
    SELECT grantee, table_name, privilege_type 
    FROM information_schema.role_table_grants 
    WHERE table_schema = 'public' 
      AND grantee IN ('authenticated', 'anon')
    ORDER BY table_name, grantee, privilege_type;
  `);

  const rows = grants.rows || grants;
  console.log(`Total Grants para authenticated/anon: ${rows.length}`);
  const summary: Record<string, string[]> = {};
  for (const r of rows) {
    const key = `${r.table_name} (${r.grantee})`;
    if (!summary[key]) summary[key] = [];
    summary[key].push(r.privilege_type);
  }
  for (const [k, v] of Object.entries(summary)) {
    console.log(`${k}: ${v.join(', ')}`);
  }
  process.exit(0);
}

checkGrants().catch(console.error);

