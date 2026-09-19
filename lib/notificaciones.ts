interface AlertaPayload {
  ingrediente: string;
  nivel: "bajo" | "critico";
  stock_actual: string;
  stock_minimo: string;
  unidad: string;
  restaurante: string;
  destinatario_email: string | string[];
  chat_id?: string; // Telegram chat_id del gerente/dueño
}

function normalizarEmails(email?: string | string[]): string[] {
  if (!email) return [];
  if (Array.isArray(email)) return email.map((e) => e.trim()).filter(Boolean);
  const t = email.trim();
  return t ? [t] : [];
}

export async function enviarNotificacionAlerta(payload: AlertaPayload): Promise<void> {
  // Enviar Telegram y email en paralelo — independientes entre sí
  await Promise.allSettled([
    enviarTelegram(payload),
    enviarEmail(payload),
  ]);
  // Promise.allSettled nunca lanza — si uno falla el otro sigue
}

async function enviarTelegram(payload: AlertaPayload): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("[Notificaciones] Telegram no configurado — omitiendo");
    return;
  }

  const chat_id = payload.chat_id;
  if (!chat_id) {
    console.warn("[Notificaciones] Restaurante sin chat_id de Telegram — omitiendo Telegram");
    return;
  }

  const emoji = payload.nivel === "critico" ? "🚨" : "⚠️";
  const texto =
    `${emoji} *Alerta de inventario*\n\n` +
    `🏠 Restaurante: *${payload.restaurante}*\n` +
    `🥗 Ingrediente: *${payload.ingrediente}*\n` +
    `📦 Stock actual: \`${payload.stock_actual} ${payload.unidad}\`\n` +
    `📉 Stock mínimo: \`${payload.stock_minimo} ${payload.unidad}\`\n` +
    `🔴 Nivel: *${payload.nivel.toUpperCase()}*`;

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: texto,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!res.ok) {
    console.error("[Notificaciones] Error Telegram:", await res.text());
  }
}

async function enviarEmail(payload: AlertaPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.warn("[Notificaciones] Resend no configurado — omitiendo");
    return;
  }

  const destinatarios = normalizarEmails(payload.destinatario_email);
  if (destinatarios.length === 0) {
    console.warn("[Notificaciones] Sin destinatarios de email para alerta — omitiendo");
    return;
  }

  const emoji = payload.nivel === "critico" ? "🚨" : "⚠️";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinatarios.length === 1 ? destinatarios[0] : destinatarios,
      subject: `${emoji} Alerta de inventario: ${payload.ingrediente} — ${payload.restaurante}`,
      html: `
        <h2>${emoji} Alerta de inventario</h2>
        <p><strong>Restaurante:</strong> ${payload.restaurante}</p>
        <p><strong>Ingrediente:</strong> ${payload.ingrediente}</p>
        <p><strong>Stock actual:</strong> ${payload.stock_actual} ${payload.unidad}</p>
        <p><strong>Stock mínimo:</strong> ${payload.stock_minimo} ${payload.unidad}</p>
        <p><strong>Nivel:</strong> ${payload.nivel.toUpperCase()}</p>
      `,
    }),
  });

    if (!res.ok) {
    console.error("[Notificaciones] Error Resend:", await res.text());
  }
}

export interface DiscrepanciaCajaPayload {
  restaurante: string;
  usuario_cierre: string;
  usuario_captura: string;
  turno_id: string;
  diferencia_total: number;
  desglose: {
    efectivo: { sistema: number; fisico: number; diferencia: number };
    tarjeta: { sistema: number; fisico: number; diferencia: number };
    transferencia: { sistema: number; fisico: number; diferencia: number };
  };
  notas?: string | null;
  destinatario_email?: string | string[];
  chat_id?: string;
}

export async function enviarNotificacionDiscrepanciaCaja(
  payload: DiscrepanciaCajaPayload
): Promise<void> {
  const [resTelegram, resEmail] = await Promise.allSettled([
    enviarTelegramDiscrepancia(payload),
    enviarEmailDiscrepancia(payload),
  ]);

  const telegramFallo = resTelegram.status === "rejected";
  const emailFallo = resEmail.status === "rejected";

  if (telegramFallo && emailFallo) {
    const errorTelegram =
      resTelegram.reason instanceof Error
        ? resTelegram.reason.message
        : String(resTelegram.reason);
    const errorEmail =
      resEmail.reason instanceof Error
        ? resEmail.reason.message
        : String(resEmail.reason);
    throw new Error(
      `Fallo total en envío de alerta de discrepancia de caja multicanal: [Telegram: ${errorTelegram}] | [Email: ${errorEmail}]`
    );
  }

  if (telegramFallo) {
    console.warn(
      "[Notificaciones Discrepancia Caja] Telegram falló pero Email tuvo éxito:",
      resTelegram.reason
    );
  }
  if (emailFallo) {
    console.warn(
      "[Notificaciones Discrepancia Caja] Email falló pero Telegram tuvo éxito:",
      resEmail.reason
    );
  }
}

async function enviarTelegramDiscrepancia(payload: DiscrepanciaCajaPayload): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  }

  const chat_id = payload.chat_id;
  if (!chat_id) {
    console.warn("[Notificaciones Discrepancia Caja] Restaurante sin chat_id de Telegram — omitiendo");
    return;
  }

  const signo = payload.diferencia_total > 0 ? "+" : "";
  const tipo = payload.diferencia_total < 0 ? "FALTANTE" : "SOBRANTE";
  const texto =
    `🚨 *Alerta de Arqueo de Caja — ${tipo}*\n\n` +
    `🏠 Restaurante: *${payload.restaurante}*\n` +
    `🆔 Turno: \`${payload.turno_id}\`\n` +
    `👤 Capturado por: *${payload.usuario_captura}*\n` +
    `🔐 Autorizado por: *${payload.usuario_cierre}*\n\n` +
    `💰 *Diferencia Total:* \`${signo}$${payload.diferencia_total.toFixed(2)}\`\n\n` +
    `*Desglose por Método:*\n` +
    `💵 Efectivo: Sis $${payload.desglose.efectivo.sistema.toFixed(2)} | Fís $${payload.desglose.efectivo.fisico.toFixed(2)} | Dif $${payload.desglose.efectivo.diferencia.toFixed(2)}\n` +
    `💳 Tarjeta: Sis $${payload.desglose.tarjeta.sistema.toFixed(2)} | Fís $${payload.desglose.tarjeta.fisico.toFixed(2)} | Dif $${payload.desglose.tarjeta.diferencia.toFixed(2)}\n` +
    `📱 Transfer: Sis $${payload.desglose.transferencia.sistema.toFixed(2)} | Fís $${payload.desglose.transferencia.fisico.toFixed(2)} | Dif $${payload.desglose.transferencia.diferencia.toFixed(2)}\n` +
    (payload.notas ? `\n📝 *Notas:* ${payload.notas}` : "");

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: texto,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Telegram retornó ${res.status}: ${errText}`);
  }
}

async function enviarEmailDiscrepancia(payload: DiscrepanciaCajaPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Credenciales de Resend no configuradas (RESEND_API_KEY o RESEND_FROM_EMAIL)");
  }

  const destinatarios = normalizarEmails(payload.destinatario_email);
  if (destinatarios.length === 0) {
    console.warn("[Notificaciones Discrepancia Caja] Restaurante sin emails de alerta configurados — omitiendo");
    return;
  }

  const signo = payload.diferencia_total > 0 ? "+" : "";
  const tipo = payload.diferencia_total < 0 ? "Faltante" : "Sobrante";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinatarios.length === 1 ? destinatarios[0] : destinatarios,
      subject: `🚨 Discrepancia de Caja (${tipo} ${signo}$${payload.diferencia_total.toFixed(2)}): ${payload.restaurante}`,
      html: `
        <h2>🚨 Alerta de Discrepancia en Arqueo de Caja</h2>
        <p><strong>Restaurante:</strong> ${payload.restaurante}</p>
        <p><strong>Turno:</strong> ${payload.turno_id}</p>
        <p><strong>Capturado por (Cajero/Mesero):</strong> ${payload.usuario_captura}</p>
        <p><strong>Autorizado y Cerrado por:</strong> ${payload.usuario_cierre}</p>
        <h3 style="color: ${payload.diferencia_total < 0 ? "#dc2626" : "#2563eb"};">
          Diferencia Total: ${signo}$${payload.diferencia_total.toFixed(2)} (${tipo})
        </h3>
        <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th>Método</th>
              <th>Sistema</th>
              <th>Físico</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Efectivo</td>
              <td>$${payload.desglose.efectivo.sistema.toFixed(2)}</td>
              <td>$${payload.desglose.efectivo.fisico.toFixed(2)}</td>
              <td style="font-weight: bold; color: ${payload.desglose.efectivo.diferencia < 0 ? "#dc2626" : "#16a34a"};">
                $${payload.desglose.efectivo.diferencia.toFixed(2)}
              </td>
            </tr>
            <tr>
              <td>Tarjeta</td>
              <td>$${payload.desglose.tarjeta.sistema.toFixed(2)}</td>
              <td>$${payload.desglose.tarjeta.fisico.toFixed(2)}</td>
              <td style="font-weight: bold; color: ${payload.desglose.tarjeta.diferencia < 0 ? "#dc2626" : "#16a34a"};">
                $${payload.desglose.tarjeta.diferencia.toFixed(2)}
              </td>
            </tr>
            <tr>
              <td>Transferencia</td>
              <td>$${payload.desglose.transferencia.sistema.toFixed(2)}</td>
              <td>$${payload.desglose.transferencia.fisico.toFixed(2)}</td>
              <td style="font-weight: bold; color: ${payload.desglose.transferencia.diferencia < 0 ? "#dc2626" : "#16a34a"};">
                $${payload.desglose.transferencia.diferencia.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
        ${payload.notas ? `<p><strong>Observaciones:</strong> ${payload.notas}</p>` : ""}
        <p style="color: #6b7280; font-size: 0.85rem;">Este incidente ha sido asentado permanentemente en la bitácora de auditoría inmutable.</p>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Resend retornó ${res.status}: ${errText}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerta de Robo Sospechado (Fase 6.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface RoboSospechosoPaPayload {
  restaurante: string;
  ingrediente: string;
  cantidad: number;
  unidad: string;
  registrado_por_nombre: string;
  registrado_por_email: string;
  registrado_por_rol: string;
  movimiento_id: string;
  destinatario_email?: string | string[];
  chat_id?: string;
}

/**
 * Alerta inmediata anti-robo: se dispara cuando el motivo de una merma es "robo sospechado".
 * Notifica multicanal (Telegram + email) sin bloquear la respuesta al usuario.
 * Usa el mismo patrón Promise.allSettled que las demás funciones de este módulo.
 */
export async function enviarNotificacionRoboSospechoso(
  payload: RoboSospechosoPaPayload
): Promise<void> {
  const [resTelegram, resEmail] = await Promise.allSettled([
    enviarTelegramRoboSospechoso(payload),
    enviarEmailRoboSospechoso(payload),
  ]);

  const telegramFallo = resTelegram.status === "rejected";
  const emailFallo = resEmail.status === "rejected";

  if (telegramFallo && emailFallo) {
    const errorTelegram = resTelegram.reason instanceof Error ? resTelegram.reason.message : String(resTelegram.reason);
    const errorEmail = resEmail.reason instanceof Error ? resEmail.reason.message : String(resEmail.reason);
    throw new Error(
      `Fallo total en envío de alerta de robo multicanal: [Telegram: ${errorTelegram}] | [Email: ${errorEmail}]`
    );
  }

  if (telegramFallo) {
    console.warn("[Notificaciones Robo Sospechado] Telegram falló pero Email tuvo éxito:", resTelegram.reason);
  }
  if (emailFallo) {
    console.warn("[Notificaciones Robo Sospechado] Email falló pero Telegram tuvo éxito:", resEmail.reason);
  }
}

async function enviarTelegramRoboSospechoso(payload: RoboSospechosoPaPayload): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  }

  const chat_id = payload.chat_id;
  if (!chat_id) {
    console.warn("[Notificaciones Robo Sospechado] Restaurante sin chat_id de Telegram — omitiendo");
    return;
  }

  // Usamos array + join para evitar conflictos de backtick dentro de template literals
  const texto = [
    "🚨🔴 *ALERTA DE ROBO SOSPECHADO*",
    "",
    `🏠 Restaurante: *${payload.restaurante}*`,
    `🥗 Ingrediente: *${payload.ingrediente}*`,
    `📦 Cantidad: ${payload.cantidad} ${payload.unidad}`,
    "",
    `👤 Registrado por: *${payload.registrado_por_nombre}*`,
    `🔖 Rol: ${payload.registrado_por_rol}`,
    `📧 Email: ${payload.registrado_por_email}`,
    "",
    `🆔 Movimiento ID: ${payload.movimiento_id}`,
    "",
    "⚠️ Este evento fue asentado en la bitácora de auditoría inmutable. Revisa de inmediato.",
  ].join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: texto,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Telegram retornó ${res.status}: ${errText}`);
  }
}

async function enviarEmailRoboSospechoso(payload: RoboSospechosoPaPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Credenciales de Resend no configuradas (RESEND_API_KEY o RESEND_FROM_EMAIL)");
  }

  const destinatarios = normalizarEmails(payload.destinatario_email);
  if (destinatarios.length === 0) {
    console.warn("[Notificaciones Robo Sospechado] Restaurante sin emails de alerta configurados — omitiendo");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinatarios.length === 1 ? destinatarios[0] : destinatarios,
      subject: `🚨 ROBO SOSPECHADO en ${payload.restaurante} — ${payload.ingrediente}`,
      html: `
        <h2 style="color: #dc2626;">🚨🔴 Alerta Inmediata de Robo Sospechado</h2>
        <p><strong>Restaurante:</strong> ${payload.restaurante}</p>
        <hr/>
        <p><strong>Ingrediente:</strong> ${payload.ingrediente}</p>
        <p><strong>Cantidad registrada como merma:</strong> ${payload.cantidad} ${payload.unidad}</p>
        <hr/>
        <p><strong>Registrado por:</strong> ${payload.registrado_por_nombre}</p>
        <p><strong>Rol:</strong> ${payload.registrado_por_rol}</p>
        <p><strong>Email:</strong> ${payload.registrado_por_email}</p>
        <hr/>
        <p><strong>ID de movimiento en auditoría:</strong> <code>${payload.movimiento_id}</code></p>
        <p style="color: #6b7280; font-size: 0.85rem;">
          Este evento ha sido asentado permanentemente en la bitácora de auditoría inmutable.
          Revisa el panel de inventario de inmediato.
        </p>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Resend retornó ${res.status}: ${errText}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporte Diario al Dueño (Fase 7 — Cron 23:00)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReporteDiarioPayload {
  restaurante: string;
  fecha: string;
  ventas_totales: number;
  ordenes_cobradas: number;
  costo_mermas: number;
  alertas_pendientes: number;
  discrepancia_ultimo_cierre: number | null;
  destinatario_email: string;
  chat_id?: string;
}

export async function enviarNotificacionReporteDiario(
  payload: ReporteDiarioPayload
): Promise<void> {
  const [resTelegram, resEmail] = await Promise.allSettled([
    enviarTelegramReporteDiario(payload),
    enviarEmailReporteDiario(payload),
  ]);

  const telegramFallo = resTelegram.status === "rejected";
  const emailFallo = resEmail.status === "rejected";

  if (telegramFallo && emailFallo) {
    const errorTelegram = (resTelegram as PromiseRejectedResult).reason?.message ?? "Error desconocido";
    const errorEmail = (resEmail as PromiseRejectedResult).reason?.message ?? "Error desconocido";
    throw new Error(
      `Fallo multicanal total al enviar Reporte Diario: [Telegram: ${errorTelegram}] [Email: ${errorEmail}]`
    );
  }
}

async function enviarTelegramReporteDiario(payload: ReporteDiarioPayload): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  }

  const chat_id = payload.chat_id ?? process.env.TELEGRAM_CHAT_ID_GERENTE;
  if (!chat_id) {
    throw new Error("TELEGRAM_CHAT_ID_GERENTE no configurado");
  }

  const texto = [
    "📊 *REPORTE DIARIO DE OPERACIONES*",
    "",
    `🏠 Restaurante: *${payload.restaurante}*`,
    `📅 Fecha: *${payload.fecha}*`,
    "",
    `💰 Ventas Totales: *$${payload.ventas_totales.toFixed(2)}*`,
    `🧾 Órdenes Cobradas: *${payload.ordenes_cobradas}*`,
    `🗑️ Costo de Mermas: *$${payload.costo_mermas.toFixed(2)}*`,
    `⚠️ Alertas Pendientes: *${payload.alertas_pendientes}*`,
    `💵 Discrepancia Último Cierre: *${payload.discrepancia_ultimo_cierre !== null ? "$" + payload.discrepancia_ultimo_cierre.toFixed(2) : "Sin arqueos cerrados hoy"}*`,
  ].join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: texto,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Telegram retornó ${res.status}: ${errText}`);
  }
}

async function enviarEmailReporteDiario(payload: ReporteDiarioPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Credenciales de Resend no configuradas (RESEND_API_KEY o RESEND_FROM_EMAIL)");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: payload.destinatario_email,
      subject: `📊 Reporte Diario de Operaciones (${payload.fecha}) — ${payload.restaurante}`,
      html: `
        <h2>📊 Reporte Diario de Operaciones</h2>
        <p><strong>Restaurante:</strong> ${payload.restaurante}</p>
        <p><strong>Fecha:</strong> ${payload.fecha}</p>
        <hr/>
        <ul>
          <li><strong>Ventas Totales:</strong> $${payload.ventas_totales.toFixed(2)}</li>
          <li><strong>Órdenes Cobradas:</strong> ${payload.ordenes_cobradas}</li>
          <li><strong>Costo de Mermas:</strong> $${payload.costo_mermas.toFixed(2)}</li>
          <li><strong>Alertas de Inventario:</strong> ${payload.alertas_pendientes}</li>
          <li><strong>Discrepancia en Caja:</strong> ${payload.discrepancia_ultimo_cierre !== null ? "$" + payload.discrepancia_ultimo_cierre.toFixed(2) : "Sin arqueos cerrados hoy"}</li>
        </ul>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Resend retornó ${res.status}: ${errText}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerta de Incidencia en Recepción de Compra (Fase 8 — Control Anti-Fraude)
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidenciaCompraPayload {
  restaurante: string;
  proveedor_nombre: string;
  compra_id: string;
  total_pedido: number;
  total_recibido: number;
  porcentaje_faltante: number;
  desglose_faltantes: Array<{
    ingrediente: string;
    unidad: string;
    pedido: number;
    recibido: number;
    faltante: number;
  }>;
  usuario_recepcion: string;
  destinatario_email?: string | string[];
  chat_id?: string;
}

export async function enviarNotificacionIncidenciaCompra(
  payload: IncidenciaCompraPayload
): Promise<void> {
  const [resTelegram, resEmail] = await Promise.allSettled([
    enviarTelegramIncidenciaCompra(payload),
    enviarEmailIncidenciaCompra(payload),
  ]);

  const telegramFallo = resTelegram.status === "rejected";
  const emailFallo = resEmail.status === "rejected";

  if (telegramFallo && emailFallo) {
    const errorTelegram = (resTelegram as PromiseRejectedResult).reason?.message ?? "Error desconocido";
    const errorEmail = (resEmail as PromiseRejectedResult).reason?.message ?? "Error desconocido";
    throw new Error(
      `Fallo multicanal total al enviar Alerta de Incidencia en Compra: [Telegram: ${errorTelegram}] [Email: ${errorEmail}]`
    );
  }
}

async function enviarTelegramIncidenciaCompra(payload: IncidenciaCompraPayload): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  }

  const chat_id = payload.chat_id;
  if (!chat_id) {
    console.warn("[Notificaciones Incidencia Compra] Restaurante sin chat_id de Telegram — omitiendo");
    return;
  }

  const lineasFaltantes = payload.desglose_faltantes
    .map(
      (f) =>
        `  • *${f.ingrediente}*: pedido ${f.pedido} ${f.unidad}, recibido ${f.recibido} ${f.unidad} (Faltante: ${f.faltante} ${f.unidad})`
    )
    .join("\n");

  const texto = [
    "🚨📦 *INCIDENCIA EN RECEPCIÓN DE COMPRA*",
    "",
    `🏠 Restaurante: *${payload.restaurante}*`,
    `🏢 Proveedor: *${payload.proveedor_nombre}*`,
    `🆔 Orden: \`${payload.compra_id}\``,
    `👤 Recibido por: *${payload.usuario_recepcion}*`,
    "",
    `⚠️ *Faltante Total:* ${payload.porcentaje_faltante.toFixed(1)}%`,
    `📦 Total pedido: ${payload.total_pedido} | Total recibido: ${payload.total_recibido}`,
    "",
    "*Desglose de faltantes:*",
    lineasFaltantes,
    "",
    "⚠️ Posible fraude de entrega o error de conteo. Asentado en auditoría.",
  ].join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: texto,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Telegram retornó ${res.status}: ${errText}`);
  }
}

async function enviarEmailIncidenciaCompra(payload: IncidenciaCompraPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Credenciales de Resend no configuradas (RESEND_API_KEY o RESEND_FROM_EMAIL)");
  }

  const destinatarios = normalizarEmails(payload.destinatario_email);
  if (destinatarios.length === 0) {
    console.warn("[Notificaciones Incidencia Compra] Restaurante sin emails de alerta configurados — omitiendo");
    return;
  }

  const filasFaltantes = payload.desglose_faltantes
    .map(
      (f) => `
      <tr>
        <td>${f.ingrediente}</td>
        <td>${f.pedido} ${f.unidad}</td>
        <td>${f.recibido} ${f.unidad}</td>
        <td style="color: #dc2626; font-weight: bold;">-${f.faltante} ${f.unidad}</td>
      </tr>
    `
    )
    .join("");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinatarios.length === 1 ? destinatarios[0] : destinatarios,
      subject: `🚨 Incidencia en Entrega de Proveedor: ${payload.proveedor_nombre} (${payload.porcentaje_faltante.toFixed(1)}% faltante) — ${payload.restaurante}`,
      html: `
        <h2 style="color: #dc2626;">🚨 Incidencia en Recepción de Mercancía</h2>
        <p><strong>Restaurante:</strong> ${payload.restaurante}</p>
        <p><strong>Proveedor:</strong> ${payload.proveedor_nombre}</p>
        <p><strong>ID Compra:</strong> <code>${payload.compra_id}</code></p>
        <p><strong>Recibido por:</strong> ${payload.usuario_recepcion}</p>
        <h3 style="color: #dc2626;">Faltante Global: ${payload.porcentaje_faltante.toFixed(1)}%</h3>
        <table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <thead>
            <tr style="background: #fee2e2;">
              <th>Ingrediente</th>
              <th>Pedido</th>
              <th>Recibido</th>
              <th>Faltante</th>
            </tr>
          </thead>
          <tbody>
            ${filasFaltantes}
          </tbody>
        </table>
        <p style="color: #6b7280; font-size: 0.85rem; margin-top: 1rem;">
          Evento registrado permanentemente en la bitácora de auditoría inmutable de RestauraCore.
        </p>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Resend retornó ${res.status}: ${errText}`);
  }
}

export interface SolicitudCancelacionPayload {
  restaurante: string;
  mesa_numero: number;
  platillo_nombre: string;
  cantidad: number;
  estado_item: string;
  motivo: string;
  solicitado_por: string;
  destinatario_email?: string | string[];
  chat_id?: string;
}

export async function enviarNotificacionSolicitudCancelacion(
  payload: SolicitudCancelacionPayload
): Promise<void> {
  const resultados = await Promise.allSettled([
    enviarTelegramSolicitudCancelacion(payload),
    enviarEmailSolicitudCancelacion(payload),
  ]);

  const alMenosUnoExitoso = resultados.some((r) => r.status === "fulfilled");
  if (!alMenosUnoExitoso) {
    const errores = resultados
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason?.message ?? String(r.reason));
    throw new Error(
      `Fallo multicanal al enviar notificación de solicitud de cancelación: ${errores.join("; ")}`
    );
  }
}

async function enviarTelegramSolicitudCancelacion(payload: SolicitudCancelacionPayload): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const chat_id = payload.chat_id;
  if (!chat_id) return;

  const texto =
    `⚠️ *Solicitud de Cancelación de Platillo*\n\n` +
    `🏠 Restaurante: *${payload.restaurante}*\n` +
    `🪑 Mesa: *${payload.mesa_numero}*\n` +
    `🍽️ Platillo: *${payload.cantidad}x ${payload.platillo_nombre}*\n` +
    `⏳ Estado en cocina: *${payload.estado_item}*\n` +
    `📝 Motivo: _${payload.motivo}_\n` +
    `👤 Solicitado por: *${payload.solicitado_por}*\n\n` +
    `👉 Requiere autorización de Gerente o Dueño.`;

  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text: texto, parse_mode: "Markdown" }),
  });

  if (!res.ok) {
    throw new Error(`Telegram retornó status ${res.status}`);
  }
}

async function enviarEmailSolicitudCancelacion(payload: SolicitudCancelacionPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  const destinatarios = normalizarEmails(payload.destinatario_email);
  if (destinatarios.length === 0) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinatarios.length === 1 ? destinatarios[0] : destinatarios,
      subject: `⚠️ Solicitud de Cancelación: Mesa ${payload.mesa_numero} — ${payload.platillo_nombre}`,
      html: `
        <h2>⚠️ Solicitud de Cancelación Pendiente</h2>
        <p><strong>Restaurante:</strong> ${payload.restaurante}</p>
        <p><strong>Mesa:</strong> ${payload.mesa_numero}</p>
        <p><strong>Platillo:</strong> ${payload.cantidad}x ${payload.platillo_nombre}</p>
        <p><strong>Estado en cocina:</strong> ${payload.estado_item}</p>
        <p><strong>Motivo:</strong> ${payload.motivo}</p>
        <p><strong>Solicitado por:</strong> ${payload.solicitado_por}</p>
      `,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend retornó status ${res.status}`);
  }
}

export interface RecordatorioTrialPayload {
  restaurante: string;
  diasRestantes: number;
  destinatario_email: string | string[];
  chat_id?: string | null;
}

export async function enviarNotificacionRecordatorioTrial(
  payload: RecordatorioTrialPayload
): Promise<void> {
  await Promise.allSettled([
    enviarTelegramRecordatorioTrial(payload),
    enviarEmailRecordatorioTrial(payload),
  ]);
}

async function enviarTelegramRecordatorioTrial(payload: RecordatorioTrialPayload): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const chat_id = payload.chat_id ?? process.env.TELEGRAM_CHAT_ID_GERENTE;
  if (!chat_id) return;

  const diasTexto = payload.diasRestantes === 1 ? "1 día (mañana)" : `${payload.diasRestantes} días`;
  const texto = [
    "⏳ *RECORDATORIO: FIN DE PRUEBA GRATUITA*",
    "",
    `🏠 Restaurante: *${payload.restaurante}*`,
    `⚠️ Tu periodo de prueba de 14 días concluye en *${diasTexto}*.`,
    "",
    "Para asegurar que tus comandas, comandera KDS e inventarios continúen operando sin interrupción, por favor adquiere tu membresía en el panel de control de RestauraCore.",
  ].join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: texto,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Telegram retornó status ${res.status}`);
  }
}

async function enviarEmailRecordatorioTrial(payload: RecordatorioTrialPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  const destinatarios = normalizarEmails(payload.destinatario_email);
  if (destinatarios.length === 0) return;

  const diasTexto = payload.diasRestantes === 1 ? "1 día" : `${payload.diasRestantes} días`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinatarios.length === 1 ? destinatarios[0] : destinatarios,
      subject: `⏳ Tu prueba gratuita en RestauraCore finaliza en ${diasTexto} — ${payload.restaurante}`,
      html: `
        <h2>⏳ Tu prueba gratuita está por concluir</h2>
        <p>Hola,</p>
        <p>Te recordamos que a tu restaurante <strong>${payload.restaurante}</strong> le restan <strong>${diasTexto}</strong> de prueba gratuita en RestauraCore.</p>
        <p>Para asegurar que tus comandas, personal, cocina e inventarios sigan operando con normalidad y sin bloqueos, te invitamos a contratar tu membresía desde la plataforma.</p>
        <br/>
        <p>Equipo RestauraCore</p>
      `,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend retornó status ${res.status}`);
  }
}

// ─── Notificación de Nuevo Ticket de Soporte (para el Dueño del SaaS) ─────────

export interface NuevoTicketSoportePayload {
  ticketId: string;
  restaurante: string;
  usuarioNombre: string;
  usuarioEmail: string;
  asunto: string;
  mensaje: string;
}

export async function notificarNuevoTicketSoporte(
  payload: NuevoTicketSoportePayload
): Promise<void> {
  await Promise.allSettled([
    enviarTelegramNuevoTicket(payload),
    enviarEmailNuevoTicket(payload),
  ]);
}

async function enviarTelegramNuevoTicket(
  payload: NuevoTicketSoportePayload
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const chat_id = process.env.TELEGRAM_CHAT_ID_GERENTE;
  if (!chat_id) return;

  const texto =
    `🎫 *NUEVO TICKET DE SOPORTE — RestauraCore*\n\n` +
    `🏠 *Restaurante:* ${payload.restaurante}\n` +
    `👤 *Usuario:* ${payload.usuarioNombre} (${payload.usuarioEmail})\n` +
    `📌 *Asunto:* ${payload.asunto}\n` +
    `💬 *Mensaje:*\n${payload.mensaje}\n\n` +
    `👉 _Ingresa al panel Super-Admin (/superadmin) para responder._`;

  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: texto,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!res.ok) {
    console.error("[Notificaciones Ticket] Error Telegram:", await res.text());
  }
}

async function enviarEmailNuevoTicket(
  payload: NuevoTicketSoportePayload
): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  const destinatario = process.env.GERENTE_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!destinatario) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: destinatario,
      subject: `🎫 [Soporte SaaS] Nuevo Ticket: ${payload.asunto} — ${payload.restaurante}`,
      html: `
        <h2>🎫 Nuevo Ticket de Soporte Levantado</h2>
        <p><strong>Restaurante:</strong> ${payload.restaurante}</p>
        <p><strong>Usuario:</strong> ${payload.usuarioNombre} (${payload.usuarioEmail})</p>
        <p><strong>Asunto:</strong> ${payload.asunto}</p>
        <hr/>
        <p><strong>Mensaje:</strong></p>
        <blockquote style="background:#f4f4f5;padding:12px;border-left:4px solid #f97316;">
          ${payload.mensaje.replace(/\n/g, "<br/>")}
        </blockquote>
        <br/>
        <p>Puedes responder este ticket ingresando al panel de Super-Admin en <a href="https://restauracore.vercel.app/superadmin">/superadmin</a>.</p>
      `,
    }),
  });

  if (!res.ok) {
    console.error("[Notificaciones Ticket] Error Resend:", await res.text());
  }
}