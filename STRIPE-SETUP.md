# RestauraCore — Guía de Configuración de Stripe (Fase 11)

Esta guía documenta paso a paso cómo configurar los productos, precios, portal de facturación y webhooks de Stripe en tu cuenta para operar el SaaS RestauraCore.

---

## 1. Modo de Pruebas (Test Mode)

1. Inicia sesión en [Stripe Dashboard](https://dashboard.stripe.com/).
2. Asegúrate de activar el interruptor **"Modo de prueba"** (Test mode) en la esquina superior derecha.

---

## 2. Crear los 3 Productos y Precios Recurrentes

Dirígete a **Catálogo de productos** (`Product catalog` / `/products`):

### A. Plan Básico
- **Nombre:** RestauraCore Básico
- **Descripción:** Menú digital con QR dinámico, comanda de cocina (KDS), cuenta abierta y cobros en mesa.
- **Precio:** `799.00`
- **Moneda:** `MXN` (Peso mexicano)
- **Frecuencia:** Mensual (`recurring / monthly`)
- Guarda el producto y copia el **Price ID** (formato: `price_...`).

### B. Plan Pro
- **Nombre:** RestauraCore Pro
- **Descripción:** Todo lo básico + Inventario automático por recetas, alertas de stock, food cost, arqueo de caja y mermas con foto.
- **Precio:** `1,499.00`
- **Moneda:** `MXN` (Peso mexicano)
- **Frecuencia:** Mensual (`recurring / monthly`)
- Guarda el producto y copia el **Price ID** (formato: `price_...`).

### C. Plan Enterprise
- **Nombre:** RestauraCore Enterprise
- **Descripción:** Todo Pro + IA (predicción de demanda, detección de anomalías, menu engineering), dashboard multi-sucursal y compras/proveedores.
- **Precio:** `2,999.00`
- **Moneda:** `MXN` (Peso mexicano)
- **Frecuencia:** Mensual (`recurring / monthly`)
- Guarda el producto y copia el **Price ID** (formato: `price_...`).

---

## 3. Configurar el Portal del Cliente (Stripe Customer Portal)

1. Ve a **Configuración** > **Facturación** > **Portal del cliente** (`Customer portal` / `settings/billing/portal`).
2. Activa el portal y configura:
   - **Permitir a los clientes cambiar de plan:** Activado. Agrega los 3 productos (Básico, Pro, Enterprise) para que puedan hacer upgrade/downgrade.
   - **Permitir a los clientes actualizar el método de pago:** Activado.
   - **Permitir a los clientes cancelar la suscripción:** Activado (marca "cancelar al final del periodo de facturación").
   - **Historial de facturas:** Activado (permite descargar PDFs de facturas y recibos).
3. Haz clic en **Guardar cambios**.

---

## 4. Configurar el Webhook de Stripe

1. Ve a **Desarrolladores** > **Webhooks** (`/test/webhooks`).
2. Haz clic en **Agregar destino** / **Añadir endpoint**:
   - **URL del extremo:** `https://tudominio.com/api/webhooks/stripe` (en desarrollo local con Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`).
   - **Eventos a escuchar:**
     - `checkout.session.completed` (Activa el restaurante y dueño tras el checkout inicial)
     - `customer.subscription.trial_will_end` (Notifica 3 días antes del fin del trial de 14 días)
     - `invoice.payment_succeeded` (Mantiene o actualiza suscripción a activa)
     - `invoice.payment_failed` (Marca estado pago fallido y notifica al dueño)
     - `customer.subscription.deleted` (Marca suscripción cancelada preservando datos)
3. Copia el **Secreto de firma del webhook** (formato: `whsec_...`).

---

## 5. Variables de Entorno Requeridas

Agrega las siguientes variables a tu `.env.local` y `.env.production.local` (y en el panel de Vercel para producción):

```bash
# Claves de API de Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# IDs de los precios recurrentes creados en el catálogo
STRIPE_PRICE_BASICO=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

