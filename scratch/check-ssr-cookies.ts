import { createServerClient } from "@supabase/ssr";
import { config } from "dotenv";
config({ path: ".env.local" });

async function checkCookies() {
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

  console.log("Sign in error:", error);
  console.log("Cookies set count:", map.size);
  for (const [k, v] of map.entries()) {
    console.log(`Cookie: ${k}=${v.slice(0, 40)}...`);
  }

  // Now create the exact Cookie header string:
  const cookieHeader = Array.from(map.entries())
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");

  console.log("\nCookie Header to send:\n", cookieHeader.slice(0, 100) + "...");

  const res = await fetch("https://restauracore.vercel.app/superadmin", {
    headers: {
      Cookie: Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; "),
    },
    redirect: "manual",
  });

  console.log("\nProduction Response Status:", res.status);
  console.log("Location:", res.headers.get("location"));
  console.log("x-superadmin-reject-reason:", res.headers.get("x-superadmin-reject-reason"));
  console.log("x-superadmin-count:", res.headers.get("x-superadmin-count"));
  for (const [hk, hv] of res.headers.entries()) {
    if (hk.startsWith("x-")) {
      console.log(`Header ${hk}: ${hv}`);
    }
  }
  if (res.status === 200) {
    const text = await res.text();
    console.log("Response text length:", text.length);
    console.log("Contains 'Super-Admin':", text.includes("Super-Admin") || text.includes("superadmin"));
  }

  process.exit(0);
}

checkCookies();

