import { createServerClient } from "@supabase/ssr";
import { config } from "dotenv";
config({ path: ".env.local" });

async function testLocalMiddleware() {
  const map = new Map<string, string>();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => Array.from(map.entries()).map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => map.set(name, value));
        },
      },
    }
  );

  const { data, error } = await client.auth.signInWithPassword({
    email: "berna241190@hotmail.com",
    password: "RestauraCore2026!",
  });

  console.log("Logged in auth user:", data.user?.email);

  // Now simulate middleware reading the cookie
  const cookieList = Array.from(map.entries()).map(([name, value]) => ({ name, value }));

  const middlewareClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieList,
        setAll: () => {},
      },
    }
  );

  const { data: userData, error: userError } = await middlewareClient.auth.getUser();
  console.log("Middleware getUser result:", userData.user?.email, "Error:", userError?.message);

  process.exit(0);
}

testLocalMiddleware();

