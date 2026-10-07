import { existsSync } from 'node:fs';
import { isValidCnpj, normalizeDocument } from '@central/contracts';
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
  // Número de proxies reversos confiáveis à frente da API (no servidor, 2:
  // Traefik e Caddy; na homologação, 1: Caddy).
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
  // Caixa do setor de manutenção: recebe aberturas, mudanças de etapa,
  // cancelamentos e mensagens dos clientes. Obrigatória em produção.
  MAINTENANCE_INBOX_EMAIL: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .optional(),
  NOTIFICATIONS_WORKER_ENABLED: booleanString.default(true),
  NOTIFICATIONS_POLL_SECONDS: z.coerce.number().positive().default(5),
  NOTIFICATIONS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Prazo padrão por equipamento (P01: 30 períodos de 24 horas desde o recebimento).
  RMA_SLA_HOURS: z.coerce.number().int().positive().default(720),
  // Arquivos privados em disco local (P03); a pasta precisa entrar no backup.
  FILES_STORAGE_DIR: z.string().min(1).default('storage/files'),
  FILES_TEMP_TTL_HOURS: z.coerce.number().positive().default(24),
  // Envios de arquivos: por IP a cada minuto e simultâneos no processo (memória).
  UPLOAD_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  UPLOAD_MAX_CONCURRENT: z.coerce.number().int().positive().default(8),
  FILES_CLEANUP_ENABLED: booleanString.default(true),
  // Cloudflare Turnstile nas rotas públicas (entrar, cadastro, redefinição de
  // senha). A chave do site é pública; a secreta fica só no servidor.
  TURNSTILE_SITE_KEY: z.string().trim().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().trim().min(1).optional(),
  // Termo de garantia da empresa (JSON), fora do repositório; em produção é obrigatório.
  WARRANTY_TERMS_FILE: z.string().min(1).default('legal/termo-garantia.json'),
  // CNPJ que deve constar como destinatário nas notas de remessa (P04).
  INVOICE_RECIPIENT_DOCUMENT: z
    .string()
    .optional()
    .transform((value) => (value ? normalizeDocument(value) : undefined))
    .refine((value) => !value || isValidCnpj(value), 'CNPJ inválido'),
});

export type Env = z.infer<typeof envSchema>;

/** O que produção exige além do esquema (a aplicação fica exposta ao público). */
const PRODUCTION_REQUIREMENTS: {
  isMet: (env: Env) => boolean;
  message: string;
}[] = [
  {
    isMet: (env) => env.COOKIE_SECURE,
    message: 'COOKIE_SECURE deve ser true.',
  },
  {
    isMet: (env) => Boolean(env.MAINTENANCE_INBOX_EMAIL),
    message: 'MAINTENANCE_INBOX_EMAIL é obrigatório.',
  },
  {
    isMet: (env) => Boolean(env.INVOICE_RECIPIENT_DOCUMENT),
    message: 'INVOICE_RECIPIENT_DOCUMENT é obrigatório.',
  },
  {
    isMet: (env) => Boolean(env.TURNSTILE_SECRET_KEY),
    message: 'TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY são obrigatórias.',
  },
];

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
  if (Boolean(env.TURNSTILE_SITE_KEY) !== Boolean(env.TURNSTILE_SECRET_KEY)) {
    throw new Error(
      'Informe TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY juntas, ou nenhuma.',
    );
  }
  if (env.NODE_ENV !== 'production') return env;
  const missing = PRODUCTION_REQUIREMENTS.filter((rule) => !rule.isMet(env));
  if (missing.length > 0) {
    throw new Error(
      `Em produção:\n${missing.map((rule) => `  - ${rule.message}`).join('\n')}`,
    );
  }
  return env;
}
