import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnvFile, parseEnv } from './config/env.js';

loadEnvFile();
const env = parseEnv();

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bodyParser: false,
});
configureApp(app, {
  trustProxyHops: env.TRUST_PROXY_HOPS,
  https: env.COOKIE_SECURE,
});
await app.listen(env.API_PORT);
