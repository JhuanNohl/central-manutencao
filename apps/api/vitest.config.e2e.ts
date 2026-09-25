import { defineConfig } from 'vitest/config';

/** Ambiente dos testes de integração: banco próprio e SMTP substituído por um falso. */
export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://central:central@localhost:5433/central_test',
  APP_ORIGIN: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
  AUTH_RATE_LIMIT_PER_MINUTE: '1000',
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '25',
  MAIL_FROM: 'Central de Manutenção <teste@central.local>',
  NOTIFICATIONS_WORKER_ENABLED: 'false',
  NOTIFICATIONS_MAX_ATTEMPTS: '2',
};

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: TEST_ENV,
    // Os arquivos compartilham o mesmo banco: execução sequencial.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
