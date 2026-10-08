import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { logSistema } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import {
  registrarEventoSistema,
  esFalloServicioCorreo,
  extraerDominioEmail,
  sanitizarTextoSeguro,
  sanitizarMetadata,
} from "@/lib/log-sistema";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

describe("Parte 2: Tabla log_sistema y Clasificación de Fallos de Correo", () => {
  const idsCreados: string[] = [];

  afterEach(async () => {
    // Limpieza de registros creados en desarrollo
    if (idsCreados.length > 0) {
      for (const id of idsCreados) {
        await db.delete(logSistema).where(eq(logSistema.id, id)).catch(() => {});
      }
      idsCreados.length = 0;
    }
  });

  describe("1. Clasificación estricta de errores (error.status, error.code, red y timeouts)", () => {
    it("clasifica como fallo real de servicio status 5xx", () => {
      const err500 = new AuthApiError("Internal Server Error", 500, "unexpected_failure");
      const err502 = new AuthApiError("Bad Gateway SMTP", 502, "bad_gateway");
      const err503 = new AuthApiError("Service Unavailable", 503, "service_unavailable");

      expect(esFalloServicioCorreo(err500)).toBe(true);
      expect(esFalloServicioCorreo(err502)).toBe(true);
      expect(esFalloServicioCorreo(err503)).toBe(true);
    });

    it("clasifica como fallo real código email_provider_disabled y unexpected_failure", () => {
      const errDisabled = { code: "email_provider_disabled", message: "Email provider is disabled" };
      const errUnexpected = { code: "unexpected_failure", message: "Unexpected failure in backend" };
      expect(esFalloServicioCorreo(errDisabled)).toBe(true);
      expect(esFalloServicioCorreo(errUnexpected)).toBe(true);
    });

    it("clasifica como fallo real errores de red o tiempo de espera hacia Supabase (AuthRetryableFetchError, status 0 o sin status)", () => {
      // Instancia de AuthRetryableFetchError
      const errRetryableInstance = new AuthRetryableFetchError("Network request failed", 0);
      expect(esFalloServicioCorreo(errRetryableInstance)).toBe(true);

      // Objeto con name AuthRetryableFetchError
      const errRetryableName = { name: "AuthRetryableFetchError", message: "Failed to fetch" };
      expect(esFalloServicioCorreo(errRetryableName)).toBe(true);

      // Error con status 0 (típico de fetch offline o CORS bloqueado)
      const errStatusCero = { status: 0, message: "Network connection refused" };
      expect(esFalloServicioCorreo(errStatusCero)).toBe(true);

      // Error sin status (Error estándar de Node/fetch como ETIMEDOUT / ECONNREFUSED)
      const errSinStatus = new Error("connect ETIMEDOUT 104.18.25.10:443");
      expect(esFalloServicioCorreo(errSinStatus)).toBe(true);
    });

    it("NO clasifica como fallo de servicio los límites de frecuencia (429 y rate limit codes)", () => {
      const err429 = new AuthApiError("Too many requests", 429, "over_email_send_rate_limit");
      const errRateCode = { code: "over_email_send_rate_limit", message: "Rate limit reached" };
      const errRequestRate = { code: "over_request_rate_limit", message: "Request limit" };

      expect(esFalloServicioCorreo(err429)).toBe(false);
      expect(esFalloServicioCorreo(errRateCode)).toBe(false);
      expect(esFalloServicioCorreo(errRequestRate)).toBe(false);
    });

    it("NO clasifica como fallo de servicio correos inexistentes o errores de cliente 4xx", () => {
      const errNotFound = new AuthApiError("User not found", 400, "user_not_found");
      const errEmailNotFound = { code: "email_not_found", message: "Email not found" };
      const errValidation = new AuthApiError("Validation failed", 422, "validation_failed");
      const errCreds = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
      const errForbidden = { status: 403, message: "Forbidden action" };

      expect(esFalloServicioCorreo(errNotFound)).toBe(false);
      expect(esFalloServicioCorreo(errEmailNotFound)).toBe(false);
      expect(esFalloServicioCorreo(errValidation)).toBe(false);
      expect(esFalloServicioCorreo(errCreds)).toBe(false);
      expect(esFalloServicioCorreo(errForbidden)).toBe(false);
    });
  });

  describe("2. Sanitización y extracción de dominio (privacidad estricta)", () => {
    it("extrae exclusivamente el dominio sin parte local ni arroba", () => {
      expect(extraerDominioEmail("usuario.secreto@ejemplo.com")).toBe("ejemplo.com");
      expect(extraerDominioEmail("Admin+tag@DOMINIO.ORG")).toBe("dominio.org");
      expect(extraerDominioEmail("invalido")).toBeNull();
      expect(extraerDominioEmail("")).toBeNull();
      expect(extraerDominioEmail(null)).toBeNull();
    });

    it("sanitizarTextoSeguro elimina correos, URLs, tokens JWT y hashes largos", () => {
      const texto =
        "Error en https://auth.supabase.co/verify?token=pk_live_sec1234567890abcdef1234567890 para el correo usuario.privado@empresa.com con hash a3f5b2c9d0e1f2a3b4c5d6e7f8a9b0c1";
      const limpio = sanitizarTextoSeguro(texto);

      expect(limpio).not.toBeNull();
      expect(limpio).not.toContain("https://auth.supabase.co");
      expect(limpio).not.toContain("pk_live_sec1234567890abcdef1234567890");
      expect(limpio).not.toContain("usuario.privado@empresa.com");
      expect(limpio).not.toContain("a3f5b2c9d0e1f2a3b4c5d6e7f8a9b0c1");
    });

    it("sanitizarMetadata limpia recursivamente objetos y arrays", () => {
      const meta = {
        callback_url: "https://miapp.com/auth/callback?token=secret12345678901234567890",
        contacto: "soporte@dominio.com",
        lista: ["otra_url: https://api.otro.com/v1", "normal"],
      };

      const metaLimpia = sanitizarMetadata(meta);
      expect(metaLimpia.callback_url).not.toContain("https://miapp.com");
      expect(metaLimpia.contacto).not.toContain("soporte@dominio.com");
      expect(metaLimpia.lista[0]).not.toContain("https://api.otro.com");
    });
  });

  describe("3. Inserción de eventos en base de datos Postgres de desarrollo", () => {
    it("asienta una fila por cada flujo con tipo, origen y dominio correctos", async () => {
      const flujos = [
        { origen: "alta_registro" as const, email: "dueno.alta@restauraproyecto.com" },
        { origen: "recuperacion_contrasena" as const, email: "cliente.olvido@proveedorcorreo.net" },
        { origen: "invitacion_personal" as const, email: "mesero.nuevo@sucursalrest.mx" },
      ];

      for (const f of flujos) {
        const errorSmtp = new AuthApiError("535 Authentication credentials invalid", 500, "unexpected_failure");
        await registrarEventoSistema({
          tipo: "FALLO_ENVIO_CORREO_AUTH",
          origen: f.origen,
          email: f.email,
          error: errorSmtp,
          ip: "203.0.113.195",
          metadata: f.origen === "invitacion_personal" ? { restaurante_id: "c0000000-0000-0000-0000-000000000001" } : null,
        });

        // Consultar el registro insertado
        const [fila] = await db
          .select()
          .from(logSistema)
          .where(eq(logSistema.origen, f.origen))
          .orderBy(desc(logSistema.creado_en))
          .limit(1);

        expect(fila).toBeDefined();
        idsCreados.push(fila.id);

        expect(fila.tipo).toBe("FALLO_ENVIO_CORREO_AUTH");
        expect(fila.origen).toBe(f.origen);
        expect(fila.servicio).toBe("supabase_auth_smtp");
        expect(fila.estado_http).toBe(500);
        expect(fila.codigo_error).toBe("unexpected_failure");
        expect(fila.mensaje_error).toContain("535 Authentication credentials invalid");
        expect(fila.ip_origen).toBe("203.0.113.195");

        // Validar que el dominio es exactamente el esperado
        const dominioEsperado = f.email.split("@")[1];
        expect(fila.email_dominio).toBe(dominioEsperado);

        // Si es invitacion_personal, verificar metadata de restaurante_id
        if (f.origen === "invitacion_personal") {
          expect((fila.metadata as any)?.restaurante_id).toBe("c0000000-0000-0000-0000-000000000001");
        }
      }
    });

    it("garantiza que un mensaje de error con un correo y una URL con token NO quedan guardados", async () => {
      const correoFuga = "fuga.secreta@corporativo-privado.com";
      const tokenFuga = "sec_tok_9876543210fedcba9876543210";
      const urlFuga = `https://supabase.internal/auth/v1/verify?token=${tokenFuga}&redirect_to=https://app.com`;
      const mensajePeligroso = `Fallo al enviar a ${correoFuga} mediante ${urlFuga} con hash 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d`;

      const errorConFugas = new AuthApiError(mensajePeligroso, 500, "unexpected_failure");

      await registrarEventoSistema({
        tipo: "FALLO_ENVIO_CORREO_AUTH",
        origen: "alta_registro",
        email: "otro.usuario@corporativo-privado.com",
        error: errorConFugas,
        ip: "198.51.100.22",
        metadata: {
          url_redireccion: urlFuga,
          correo_destino: correoFuga,
        },
      });

      const [fila] = await db
        .select()
        .from(logSistema)
        .where(eq(logSistema.email_dominio, "corporativo-privado.com"))
        .orderBy(desc(logSistema.creado_en))
        .limit(1);

      expect(fila).toBeDefined();
      idsCreados.push(fila.id);

      // Verificación exhaustiva: ni mensaje_error ni metadata guardan el correo ni la URL con token
      const filaJson = JSON.stringify(fila).toLowerCase();

      // Correo no guardado
      expect(filaJson).not.toContain(correoFuga.toLowerCase());
      expect(fila.mensaje_error).not.toContain(correoFuga);

      // URL no guardada
      expect(filaJson).not.toContain("https://supabase.internal");
      expect(fila.mensaje_error).not.toContain("https://supabase.internal");

      // Token no guardado
      expect(filaJson).not.toContain(tokenFuga.toLowerCase());
      expect(fila.mensaje_error).not.toContain(tokenFuga);
      expect(fila.mensaje_error).not.toContain("1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d");
    });

    it("errores 429 y de validación NO generan ninguna fila en log_sistema", async () => {
      const conteoAntesRes = await db.select({ count: sql<number>`count(*)` }).from(logSistema);
      const conteoAntes = Number(conteoAntesRes[0]?.count ?? 0);

      // 1. Intentar con error 429
      await registrarEventoSistema({
        tipo: "FALLO_ENVIO_CORREO_AUTH",
        origen: "alta_registro",
        email: "spam@descartar.com",
        error: new AuthApiError("Rate limited", 429, "over_email_send_rate_limit"),
      });

      // 2. Intentar con error 400 user_not_found
      await registrarEventoSistema({
        tipo: "FALLO_ENVIO_CORREO_AUTH",
        origen: "recuperacion_contrasena",
        email: "noexiste@descartar.com",
        error: new AuthApiError("User not found", 400, "user_not_found"),
      });

      const conteoDespuesRes = await db.select({ count: sql<number>`count(*)` }).from(logSistema);
      const conteoDespues = Number(conteoDespuesRes[0]?.count ?? 0);

      expect(conteoDespues).toBe(conteoAntes);
    });

    it("resiliencia: si el INSERT falla, nunca lanza excepción y emite console.error con LOG_SISTEMA_ERROR", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Simular fallo en db.insert
      const dbInsertSpy = vi.spyOn(db, "insert").mockImplementationOnce(() => {
        throw new Error("Fallo de conexión simulado con PostgreSQL");
      });

      // No debe lanzar excepción
      await expect(
        registrarEventoSistema({
          tipo: "FALLO_ENVIO_CORREO_AUTH",
          origen: "alta_registro",
          email: "prueba.resiliencia@dominio.com",
          error: new AuthApiError("SMTP timeout", 500, "unexpected_failure"),
        })
      ).resolves.not.toThrow();

      // Debe haber emitido console.error con tag LOG_SISTEMA_ERROR
      const llamadasError = consoleSpy.mock.calls.filter((c) =>
        c.some((arg) => (typeof arg === "string" && arg.includes("LOG_SISTEMA_ERROR")) || (typeof arg === "object" && arg?.tag === "LOG_SISTEMA_ERROR"))
      );
      expect(llamadasError.length).toBeGreaterThan(0);

      dbInsertSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe("4. Seguridad RLS: anon y authenticated no tienen permisos de lectura ni escritura", () => {
    it("bloquea acceso SELECT e INSERT a roles anon y authenticated", async () => {
      // 1. Probar con rol anon
      let errorSelectAnon: any = null;
      let errorInsertAnon: any = null;

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL role = anon;`);
          await tx.execute(sql`SELECT * FROM log_sistema LIMIT 1;`);
        });
      } catch (err: any) {
        errorSelectAnon = err;
      }

      expect(errorSelectAnon).not.toBeNull();
      const msgSelectAnon = String(errorSelectAnon?.cause?.message || errorSelectAnon?.message || "").toLowerCase();
      const codeSelectAnon = String(errorSelectAnon?.cause?.code || errorSelectAnon?.code || "");
      expect(msgSelectAnon.includes("permission denied") || codeSelectAnon === "42501").toBe(true);

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL role = anon;`);
          await tx.execute(
            sql`INSERT INTO log_sistema (tipo, origen, email_dominio) VALUES ('TEST', 'alta_registro', 'ejemplo.com');`
          );
        });
      } catch (err: any) {
        errorInsertAnon = err;
      }

      expect(errorInsertAnon).not.toBeNull();
      const msgInsertAnon = String(errorInsertAnon?.cause?.message || errorInsertAnon?.message || "").toLowerCase();
      const codeInsertAnon = String(errorInsertAnon?.cause?.code || errorInsertAnon?.code || "");
      expect(msgInsertAnon.includes("permission denied") || codeInsertAnon === "42501").toBe(true);

      // 2. Probar con rol authenticated
      let errorSelectAuth: any = null;
      let errorInsertAuth: any = null;

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL role = authenticated;`);
          await tx.execute(sql`SELECT * FROM log_sistema LIMIT 1;`);
        });
      } catch (err: any) {
        errorSelectAuth = err;
      }

      expect(errorSelectAuth).not.toBeNull();
      const msgSelectAuth = String(errorSelectAuth?.cause?.message || errorSelectAuth?.message || "").toLowerCase();
      const codeSelectAuth = String(errorSelectAuth?.cause?.code || errorSelectAuth?.code || "");
      expect(msgSelectAuth.includes("permission denied") || codeSelectAuth === "42501").toBe(true);

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL role = authenticated;`);
          await tx.execute(
            sql`INSERT INTO log_sistema (tipo, origen, email_dominio) VALUES ('TEST', 'alta_registro', 'ejemplo.com');`
          );
        });
      } catch (err: any) {
        errorInsertAuth = err;
      }

      expect(errorInsertAuth).not.toBeNull();
      const msgInsertAuth = String(errorInsertAuth?.cause?.message || errorInsertAuth?.message || "").toLowerCase();
      const codeInsertAuth = String(errorInsertAuth?.cause?.code || errorInsertAuth?.code || "");
      expect(msgInsertAuth.includes("permission denied") || codeInsertAuth === "42501").toBe(true);
    });
  });
});

