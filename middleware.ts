import { NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase-middleware";
import { checkRateLimitMenu } from "@/lib/rate-limiter";

const RUTAS_PROTEGIDAS: Record<string, string[]> = {
  "/dashboard": ["dueno"], // Fase 7: Dashboard multi-sucursal exclusivo del Dueño
  "/inventario": ["gerente", "dueno"],
  "/compras": ["gerente", "dueno"],
  "/cocina": ["chef", "gerente", "dueno"],
  "/reportes": ["gerente", "dueno"],
  "/caja": ["cajero", "mesero", "gerente", "dueno"],
  "/personal": ["gerente", "dueno"],
  "/cancelaciones": ["gerente", "dueno"],
  "/notificaciones": ["gerente", "dueno"],
  "/auditoria": ["dueno"],
  "/home": ["mesero", "cajero", "chef", "gerente", "dueno"],
  "/perfil": ["mesero", "cajero", "chef", "gerente", "dueno"],
  "/mesas": ["mesero", "gerente", "dueno"],
  "/restaurante": ["dueno"],
  "/menu/administrar": ["gerente", "dueno"],
  "/soporte": ["gerente", "dueno"],
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  // 0. Control de Acceso perimetral en el Edge para Super-Admin (/superadmin)
  // No requiere cookie restaurante_activo — desacoplado a nivel SaaS global
  if (pathname.startsWith("/superadmin")) {
    const supabase = createSupabaseMiddlewareClient(request, response);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      const redirectRes = NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
      redirectRes.headers.set("x-superadmin-reject-reason", "no-user");
      return redirectRes;
    }

    // SEGURIDAD: NUNCA agregar un email real aquí como fallback — esta lista debe vivir EXCLUSIVAMENTE en la variable de entorno de Vercel
    const rawSuperAdmins =
      process.env.SUPER_ADMIN_EMAILS ||
      process.env.SUPER_ADMIN_EMAIL ||
      process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ||
      "";
    const superAdminEmails = rawSuperAdmins
      .split(",")
      .map((e) => e.replace(/['"]/g, "").trim().toLowerCase())
      .filter(Boolean);

    if (!superAdminEmails.includes(user.email.toLowerCase())) {
      const redirectRes = NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
      redirectRes.headers.set("x-superadmin-reject-reason", "email-not-in-list");
      redirectRes.headers.set("x-superadmin-count", String(superAdminEmails.length));
      return redirectRes;
    }

    return response;
  }

  // 1. Rate Limiting perimetral para menú público (/menu/[qrToken])

  if (pathname.startsWith("/menu") && !pathname.startsWith("/menu/administrar")) {
    const segments = pathname.split("/").filter(Boolean);
    const qrToken = segments[1] ?? "global";
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "127.0.0.1";

    const rateCheck = await checkRateLimitMenu(`${ip}:${qrToken}`);
    if (!rateCheck.success) {
      return new NextResponse(
        JSON.stringify({
          error: "Demasiadas peticiones. Por favor espera un momento.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }
    return response;
  }

  // 2. Control de Acceso perimetral para rutas protegidas
  const rutaProtegida = Object.keys(RUTAS_PROTEGIDAS).find((r) =>
    pathname.startsWith(r)
  );

  if (!rutaProtegida) return response;

  const supabase = createSupabaseMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const restauranteActivo = request.cookies.get("restaurante_activo")?.value;

  if (!restauranteActivo) {
    return NextResponse.redirect(
      new URL("/seleccionar-restaurante", request.url)
    );
  }

  const verifyUrl = new URL("/api/auth/verify-rol", request.url);
  verifyUrl.searchParams.set("restaurante_id", restauranteActivo);
  verifyUrl.searchParams.set("ruta", rutaProtegida);

  const verifyRes = await fetch(verifyUrl, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  if (!verifyRes.ok) {
    // Registro de auditoría asíncrono para no demorar la respuesta
    fetch(new URL("/api/auth/log-acceso-denegado", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        ruta: pathname,
        restaurante_id: restauranteActivo,
        ip: request.headers.get("x-forwarded-for") ?? null,
      }),
    }).catch(() => {});

    return NextResponse.redirect(
      new URL("/login?error=sin-permiso", request.url)
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/menu/:path*",
    "/dashboard/:path*",
    "/inventario/:path*",
    "/compras/:path*",
    "/cocina/:path*",
    "/reportes/:path*",
    "/caja/:path*",
    "/personal/:path*",
    "/cancelaciones/:path*",
    "/notificaciones/:path*",
    "/auditoria/:path*",
    "/home/:path*",
    "/perfil/:path*",
    "/mesas/:path*",
    "/restaurante/:path*",
    "/soporte/:path*",
    "/superadmin/:path*",
  ],
};



