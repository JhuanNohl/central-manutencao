import { existsSync } from 'node:fs';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // Nome próprio (não PORT) para não herdar a porta injetada por outras ferramentas.
  API_PORT: z.coerce.number().int().positive().default(3000),
  // Número de proxies reversos confiáveis à frente da API (ex.: 1 com Traefik).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.url(),
  APP_ORIGIN: z.url().transform((value) => new URL(value).origin),
  COOKIE_SECURE: booleanString.default(false),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(120),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  OPERATIONAL_TIMEZONE: z.string().default('America/Sao_Paulo'),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(3),
  NOTIFICATIONS_WORKER_ENABLED: booleanString.default(true),
  NOTIFICATIONS_POLL_SECONDS: z.coerce.number().positive().default(5),
  NOTIFICATIONS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

/** Carrega `.env` (se existir) sem sobrescrever variáveis já definidas. */
export function loadEnvFile(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${details}`);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    throw new Error('Em produção, COOKIE_SECURE deve ser true.');
  }
  return env;
}
