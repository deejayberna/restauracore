import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  alertasInventario,
  ingredientes,
  movimientosInventario,
  ordenes,
  ordenItems,
  reportesDiariosEnviados,
  restaurantes,
  turnos,
  usuarioRestaurantes,
  usuarios,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { enviarNotificacionReporteDiario } from "@/lib/notificaciones";
import { calcularVentanasTiempo } from "@/lib/dashboard-actions";

export async function GET(request: NextRequest) {
  // 1. SEGURIDAD: Validación estricta del header de autorización de Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forzarEnvio = searchParams.get("force") === "true";

  const todosRestaurantes = await db.query.restaurantes.findMany();
  const resultados: {
    restaurante_id: string;
    nombre: string;
    procesado: boolean;
    omitido_por_horario?: boolean;
    omitido_por_duplicado?: boolean;
    error?: string;
  }[] = [];

  const ahora = new Date();

  for (const rest of todosRestaurantes) {
    const tz = rest.timezone ?? "America/Mexico_City";

    // 2. Extraer la hora local del restaurante
    const horaLocalStr = ahora.toLocaleTimeString("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: tz,
    });
    const horaLocal = parseInt(horaLocalStr, 10);

    // Solo se dispara a las 23:00 hora local (a menos que se fuerce para pruebas)
    if (horaLocal !== 23 && !forzarEnvio) {
      resultados.push({
        restaurante_id: rest.id,
        nombre: rest.nombre,
        procesado: false,
        omitido_por_horario: true,
      });
      continue;
    }

    const { formatoLocal: fechaLocal, inicioHoy } = calcularVentanasTiempo(ahora, tz);

    // 3. IDEMPOTENCIA ATÓMICA: Registrar en reportes_diarios_enviados antes de notificar.
    // UNIQUE(restaurante_id, fecha) previene envíos duplicados a nivel de base de datos.
    let registroReporteId: string;
    try {
      const [insertado] = await db
        .insert(reportesDiariosEnviados)
        .values({
          restaurante_id: rest.id,
          fecha: fechaLocal,
          enviado_en: new Date(),
        })
        .returning({ id: reportesDiariosEnviados.id });

      registroReporteId = insertado.id;
    } catch (dbErr: any) {
      // Código PostgreSQL 23505 = unique_violation
      if (dbErr?.code === "23505" || dbErr?.cause?.code === "23505") {
        resultados.push({
          restaurante_id: rest.id,
          nombre: rest.nombre,
          procesado: false,
          omitido_por_duplicado: true,
        });
        continue;
      }

      console.error(`[Cron Reporte Diario] Error al verificar idempotencia para ${rest.nombre}:`, dbErr);
      resultados.push({
        restaurante_id: rest.id,
        nombre: rest.nombre,
        procesado: false,
        error: "Error de base de datos al validar duplicidad",
      });
      continue;
    }

    try {
      // 4. Compilar métricas del día:
      // a) Ventas del día con Criterio Híbrido (Ventas Devengadas):
      //    El resumen ejecutivo nocturno (23:00) contabiliza:
      //    1. Cuentas ya cobradas (ordenes.estado = 'pagado').
      //    2. Consumo servido en mesas que continúan abiertas a las 23:00 (orden_items.estado = 'entregado').
      //    Racionalidad contable: Los ingredientes de platillos entregados ya salieron del inventario hoy;
      //    omitir este consumo falsearía el costo de alimentos y la rentabilidad real de la jornada.
      //    Los platillos aún en preparación o pendientes NO se contabilizan pues no han sido servidos.
      const ordenesHoy = await db
        .select({
          total: ordenes.total,
        })
        .from(ordenes)
        .where(
          and(
            eq(ordenes.restaurante_id, rest.id),
            eq(ordenes.estado, "pagado"),
            gte(ordenes.creado_en, inicioHoy)
          )
        );

      let ventasCobradas = 0;
      for (const o of ordenesHoy) {
        ventasCobradas += parseFloat(o.total);
      }

      // Consumo de platillos entregados a mesas en curso con cuenta aún abierta o solicitada
      const consumoEntregadoAbierto = await db
        .select({
          subtotal: sql<string>`COALESCE(SUM(${ordenItems.precio_unitario_congelado} * ${ordenItems.cantidad}), 0)`,
        })
        .from(ordenItems)
        .innerJoin(ordenes, eq(ordenes.id, ordenItems.orden_id))
        .where(
          and(
            eq(ordenes.restaurante_id, rest.id),
            inArray(ordenes.estado, ["abierta", "cuenta_solicitada"]),
            eq(ordenItems.estado, "entregado"),
            gte(ordenes.creado_en, inicioHoy)
          )
        );

      const ventasAbiertasEntregadas = parseFloat(consumoEntregadoAbierto[0]?.subtotal ?? "0");
      const ventasTotales = ventasCobradas + ventasAbiertasEntregadas;

      // b) Costo total de mermas del día
      const mermasHoy = await db
        .select({
          cantidad: movimientosInventario.cantidad,
          costo_unitario: ingredientes.costo_unitario,
        })
        .from(movimientosInventario)
        .innerJoin(ingredientes, eq(ingredientes.id, movimientosInventario.ingrediente_id))
        .where(
          and(
            eq(ingredientes.restaurante_id, rest.id),
            eq(movimientosInventario.tipo, "merma"),
            gte(movimientosInventario.creado_en, inicioHoy)
          )
        );

      let costoMermas = 0;
      for (const m of mermasHoy) {
        const cant = Math.abs(parseFloat(m.cantidad));
        const costo = parseFloat(m.costo_unitario);
        costoMermas += cant * costo;
      }

      // c) Conteo de alertas de inventario no atendidas
      const alertasCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(alertasInventario)
        .where(
          and(
            eq(alertasInventario.restaurante_id, rest.id),
            eq(alertasInventario.atendida, false)
          )
        );

      // d) Último corte de caja
      const ultimoTurno = await db.query.turnos.findFirst({
        where: and(eq(turnos.restaurante_id, rest.id), eq(turnos.estado, "cerrado")),
        orderBy: desc(turnos.fecha_cierre),
      });

      let discrepanciaUltimoCierre: number | null = null;
      if (ultimoTurno) {
        const dif = ultimoTurno.diferencias as any;
        discrepanciaUltimoCierre = dif?.total?.diferencia ?? (dif?.total ?? 0);
      }

      // 5. Consultar los dueños del restaurante
      const duenos = await db
        .select({
          id: usuarios.id,
          nombre: usuarios.nombre,
          email: usuarios.email,
        })
        .from(usuarioRestaurantes)
        .innerJoin(usuarios, eq(usuarios.id, usuarioRestaurantes.usuario_id))
        .where(
          and(
            eq(usuarioRestaurantes.restaurante_id, rest.id),
            eq(usuarioRestaurantes.rol, "dueno"),
            eq(usuarioRestaurantes.activo, true)
          )
        );

      const resumenData = {
        ventas_totales: Number(ventasTotales.toFixed(2)),
        ventas_cobradas: Number(ventasCobradas.toFixed(2)),
        ventas_abiertas_entregadas: Number(ventasAbiertasEntregadas.toFixed(2)),
        ordenes_cobradas: ordenesHoy.length,
        costo_mermas: Number(costoMermas.toFixed(2)),
        alertas_pendientes: alertasCount[0]?.count ?? 0,
        discrepancia_ultimo_cierre: discrepanciaUltimoCierre,
      };

      // 6. Despachar notificación a cada dueño (patrón anti-silencio con log explícito)
      for (const dueno of duenos) {
        try {
          await enviarNotificacionReporteDiario({
            restaurante: rest.nombre,
            fecha: fechaLocal,
            ventas_totales: resumenData.ventas_totales,
            ordenes_cobradas: resumenData.ordenes_cobradas,
            costo_mermas: resumenData.costo_mermas,
            alertas_pendientes: resumenData.alertas_pendientes,
            discrepancia_ultimo_cierre: resumenData.discrepancia_ultimo_cierre,
            destinatario_email: dueno.email,
          });
        } catch (notifErr: any) {
          // Patrón anti-silencio: console.error explícito obligatorio
          console.error(
            `[FALLO_ENVIO_REPORTE_DIARIO] No se pudo entregar reporte diario de '${rest.nombre}' al dueño ${dueno.email}:`,
            notifErr?.message ?? notifErr
          );
        }
      }

      // Guardar resumen en la base de datos
      await db
        .update(reportesDiariosEnviados)
        .set({ datos_resumen: resumenData })
        .where(eq(reportesDiariosEnviados.id, registroReporteId));

      resultados.push({
        restaurante_id: rest.id,
        nombre: rest.nombre,
        procesado: true,
      });
    } catch (procErr: any) {
      console.error(`[Cron Reporte Diario] Error compilando métricas para ${rest.nombre}:`, procErr);
      resultados.push({
        restaurante_id: rest.id,
        nombre: rest.nombre,
        procesado: false,
        error: procErr?.message ?? "Error interno al compilar métricas",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ejecutado_en: ahora.toISOString(),
    resultados,
  });
}
