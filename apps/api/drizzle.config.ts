import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sem .env: DATABASE_URL precisa vir do ambiente.
  }
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
