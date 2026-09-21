import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

async function testProdAccess() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, supabaseAnonKey);

  const email = "berna241190@hotmail.com";
  const password = "RestauraCore2026!";

  console.log("1. Authenticating against Supabase Auth with:", email);
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !authData.session) {
    console.error("Auth failed:", authErr);
    process.exit(1);
  }

  console.log("Authenticated successfully! Access Token acquired.");

  // Supabase stores cookies in chunks or as standard tokens.
  // In Next.js with @supabase/ssr, the cookie name typically starts with sb-ehdubgdcfxnovykcoyro-auth-token
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const sessionJson = JSON.stringify({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  });

  // Base64 encode the session payload as @supabase/ssr does
  const base64Session = Buffer.from(sessionJson).toString("base64");
  const cookieHeader = `${cookieName}=base64-${base64Session}; ${cookieName}.0=base64-${base64Session}`;

  console.log("\n2. Testing GET https://restauracore.vercel.app/superadmin with authenticated session...");
  const res = await fetch("https://restauracore.vercel.app/superadmin", {
    headers: {
      Cookie: cookieHeader,
    },
    redirect: "manual",
  });

  console.log("HTTP Response Status:", res.status);
  console.log("Location header (if redirect):", res.headers.get("location"));

  if (res.status === 200) {
    console.log("SUCCESS! /superadmin loaded with HTTP 200 OK for superadmin user.");
    const html = await res.text();
    console.log("Page snippet contains 'Super-Admin':", html.includes("Super-Admin") || html.includes("RestauraCore"));
  } else if (res.status === 307 || res.status === 302 || res.status === 303) {
    console.log("Redirected to:", res.headers.get("location"));
  }

  console.log("\n3. Testing unauthorized user (normal user without superadmin privilege)...");
  // Log in as dueno@test.com
  const { data: duenoAuth } = await client.auth.signInWithPassword({
    email: "dueno@test.com",
    password: "Password123!",
  });

  if (duenoAuth?.session) {
    const duenoSessionJson = JSON.stringify({
      access_token: duenoAuth.session.access_token,
      refresh_token: duenoAuth.session.refresh_token,
    });
    const duenoBase64 = Buffer.from(duenoSessionJson).toString("base64");
    const duenoCookie = `${cookieName}=base64-${duenoBase64}; ${cookieName}.0=base64-${duenoBase64}`;

    const resDueno = await fetch("https://restauracore.vercel.app/superadmin", {
      headers: {
        Cookie: duenoCookie,
      },
      redirect: "manual",
    });

    console.log("Dueno status against /superadmin:", resDueno.status);
    console.log("Dueno redirected to:", resDueno.headers.get("location"));
  }

  process.exit(0);
}

testProdAccess().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

