import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// Store en memoria para desarrollo, pruebas o fallback si Upstash no está configurado
const memoryStore = new Map<string, number[]>();

export function resetRateLimits() {
  memoryStore.clear();
}

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const history = (memoryStore.get(key) ?? []).filter((ts) => ts > windowStart);

  if (history.length >= limit) {
    const oldest = history[0];
    return {
      success: false,
      limit,
      remaining: 0,
      reset: oldest + windowMs,
    };
  }

  history.push(now);
  memoryStore.set(key, history);

  return {
    success: true,
    limit,
    remaining: limit - history.length,
    reset: now + windowMs,
  };
}

let upstashRedis: Redis | null = null;
if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  try {
    upstashRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (err) {
    console.warn("No se pudo inicializar Upstash Redis, usando fallback en memoria:", err);
  }
}

// Limitadores preconfigurados (Upstash o Fallback en memoria)
export const RATE_LIMIT_CONFIGS = {
  menu: { limit: 60, window: "60 s", windowMs: 60 * 1000 },
  pedido: { limit: 10, window: "60 s", windowMs: 60 * 1000 },
  login: { limit: 5, window: "60 s", windowMs: 60 * 1000 },
} as const;

export async function checkRateLimit(
  tipo: keyof typeof RATE_LIMIT_CONFIGS,
  identificador: string
): Promise<RateLimitResult> {
  const cfg = RATE_LIMIT_CONFIGS[tipo];
  const key = `ratelimit:${tipo}:${identificador}`;

  if (upstashRedis) {
    try {
      const ratelimit = new Ratelimit({
        redis: upstashRedis,
        limiter: Ratelimit.slidingWindow(cfg.limit, cfg.window),
        prefix: `restauracore:${tipo}`,
      });
      const res = await ratelimit.limit(identificador);
      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
      };
    } catch (e) {
      console.warn("Fallo Upstash Redis durante rate limit, recurriendo a memoria:", e);
    }
  }

  // Fallback en memoria
  return checkMemoryRateLimit(key, cfg.limit, cfg.windowMs);
}

export async function checkRateLimitMenu(ipAndToken: string): Promise<RateLimitResult> {
  return checkRateLimit("menu", ipAndToken);
}

export async function checkRateLimitPedido(ipAndToken: string): Promise<RateLimitResult> {
  return checkRateLimit("pedido", ipAndToken);
}

export async function checkRateLimitLogin(ip: string): Promise<RateLimitResult> {
  return checkRateLimit("login", ip);
}

