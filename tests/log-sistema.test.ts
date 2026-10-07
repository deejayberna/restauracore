import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { logSistema } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import {
  registrarEventoSistema,
  esFalloServicioCorreo,
  extraerDominioEmail,
} from "@/lib/log-sistema";
import { AuthApiError } from "@supabase/supabase-js";

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

  describe("1. Clasificación estricta de errores (error.status y error.code)", () => {
    it("clasifica como fallo real de servicio status 5xx", () => {
      const err500 = new AuthApiError("Internal Server Error", 500, "unexpected_failure");
      const err502 = new AuthApiError("Bad Gateway SMTP", 502, "bad_gateway");
      const err503 = new AuthApiError("Service Unavailable", 503, "service_unavailable");

      expect(esFalloServicioCorreo(err500)).toBe(true);
      expect(esFalloServicioCorreo(err502)).toBe(true);
      expect(esFalloServicioCorreo(err503)).toBe(true);
    });

    it("clasifica como fallo real código email_provider_disabled", () => {
      const errDisabled = { code: "email_provider_disabled", message: "Email provider is disabled" };
      expect(esFalloServicioCorreo(errDisabled)).toBe(true);
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

      expect(esFalloServicioCorreo(errNotFound)).toBe(false);
      expect(esFalloServicioCorreo(errEmailNotFound)).toBe(false);
      expect(esFalloServicioCorreo(errValidation)).toBe(false);
      expect(esFalloServicioCorreo(errCreds)).toBe(false);
    });
  });

  describe("2. Extracción de dominio de correo (privacidad)", () => {
    it("extrae exclusivamente el dominio sin parte local ni arroba", () => {
      expect(extraerDominioEmail("usuario.secreto@ejemplo.com")).toBe("ejemplo.com");
      expect(extraerDominioEmail("Admin+tag@DOMINIO.ORG")).toBe("dominio.org");
      expect(extraerDominioEmail("invalido")).toBeNull();
      expect(extraerDominioEmail("")).toBeNull();
      expect(extraerDominioEmail(null)).toBeNull();
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

    it("garantiza que NINGÚN campo guardado contiene el correo completo, contraseñas, tokens de Turnstile ni enlaces", async () => {
      const correoSensible = "secreto.usuario.123@corporativo-privado.com";
      const errorConDetalle = new AuthApiError(
        "Fallo de conexión SMTP hacia smtp.servidor.com:465 tras intento con password de app",
        500,
        "unexpected_failure"
      );

      await registrarEventoSistema({
        tipo: "FALLO_ENVIO_CORREO_AUTH",
        origen: "alta_registro",
        email: correoSensible,
        error: errorConDetalle,
        ip: "198.51.100.22",
        metadata: {
          motivo: "error_servidor",
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

      // Inspección exhaustiva de todos los valores de la fila
      const textoCompletoFila = JSON.stringify(fila).toLowerCase();

      // 1. Correo completo nunca presente
      expect(textoCompletoFila).not.toContain(correoSensible.toLowerCase());
      expect(textoCompletoFila).not.toContain("secreto.usuario.123");

      // 2. Sin passwords reales ni hashes
      expect(textoCompletoFila).not.toContain("password123");
      expect(textoCompletoFila).not.toContain("scrypt");

      // 3. Sin tokens de Turnstile
      expect(textoCompletoFila).not.toContain("0.xxxx");

      // 4. Sin token_hash de recuperación
      expect(textoCompletoFila).not.toContain("token_hash");
      expect(textoCompletoFila).not.toContain("type=recovery");

      // 5. Sin enlaces HTTP/HTTPS
      expect(textoCompletoFila).not.toContain("http://");
      expect(textoCompletoFila).not.toContain("https://");
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
