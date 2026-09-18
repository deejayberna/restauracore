# RestauraCore

ERP para restaurantes — Next.js 14 + Drizzle ORM + Supabase + IA.

## Stack

- **Frontend/Backend:** Next.js 14 (App Router) + TypeScript strict
- **Base de datos:** PostgreSQL en Supabase
- **ORM:** Drizzle ORM (tipado fuerte, migraciones versionadas)
- **Auth:** Supabase Auth + `@supabase/ssr`
- **Tiempo real:** Supabase Realtime
- **IA:** Anthropic / OpenAI
- **Notificaciones:** Twilio WhatsApp + Resend (email)
- **Testing:** Vitest + Playwright

## Instalación

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd restauracore
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus credenciales reales. **Nunca subas este archivo a Git.**

### 3. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ve a **Settings → Database** y copia el **Connection string** (modo `Transaction` o `Session`) → pégalo en `DATABASE_URL`
3. Ve a **Settings → API** y copia `URL` y `anon key` → `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Aplicar migraciones

```bash
npm run db:generate   # genera SQL desde el schema
npm run db:migrate    # aplica la migración en Supabase
```

### 5. Seed de datos de prueba

```bash
npm run db:seed
```

### 6. Correr en desarrollo

```bash
npm run dev
```

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run type-check` | Verificación de tipos TypeScript |
| `npm run format` | Formatear con Prettier |
| `npm run test` | Pruebas unitarias (Vitest) |
| `npm run test:watch` | Pruebas en modo watch |
| `npm run test:e2e` | Pruebas end-to-end (Playwright) |
| `npm run db:generate` | Generar migración desde schema |
| `npm run db:migrate` | Aplicar migraciones |
| `npm run db:studio` | Drizzle Studio (UI de base de datos) |
| `npm run db:seed` | Insertar datos de prueba |

## Diferencia: Drizzle (DATABASE_URL) vs @supabase/supabase-js

| | Drizzle ORM | @supabase/supabase-js |
|---|---|---|
| **Conexión** | Connection string directa de Postgres | URL del API REST de Supabase |
| **Uso en este proyecto** | Todas las queries, mutaciones y migraciones | Solo Auth y Realtime |
| **Por qué** | Tipado fuerte, migraciones versionadas, protección contra SQL injection | Auth y Realtime no tienen equivalente nativo en Drizzle |

> **Regla:** usa `db` (Drizzle) para leer/escribir datos. Usa `supabase` (cliente JS) solo para `supabase.auth.*` y `supabase.channel()`.

## Estructura de carpetas

```
/app          → rutas y páginas (App Router)
/components   → componentes UI reutilizables
/db           → schema Drizzle, migraciones, seed
/lib          → utilidades, validaciones, clientes externos
/lib/ai       → integración con modelos de IA
/types        → tipos TypeScript compartidos
/tests        → pruebas unitarias y e2e
```
