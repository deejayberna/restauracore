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
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

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
  ],
};


