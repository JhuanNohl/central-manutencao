import type { Role } from '@central/contracts';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/passwords.js';
import { DATABASE } from '../src/database/database.module.js';
import type { Database } from '../src/database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
} from '../src/database/schema/index.js';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '../src/notifications/mail-transport.js';
import { NotificationProcessor } from '../src/notifications/notification-processor.service.js';

export type TestAgent = ReturnType<typeof request.agent>;

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'senha-de-teste-123';

/** SMTP falso: guarda as mensagens e pode simular indisponibilidade. */
export class FakeMailTransport implements MailTransport {
  sent: MailMessage[] = [];
  failing = false;

  async send(message: MailMessage): Promise<void> {
    if (this.failing) throw new Error('SMTP indisponível (simulado)');
    this.sent.push(message);
  }

  /** Token do último e-mail enviado ao destinatário. */
  tokenFor(recipient: string): string {
    const message = this.sent.filter((m) => m.to === recipient).at(-1);
    const token = message?.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
    if (!token)
      throw new Error(`Nenhum link com token enviado para ${recipient}.`);
    return token;
  }
}

export interface TestContext {
  app: INestApplication;
  db: Database;
  mail: FakeMailTransport;
  processor: NotificationProcessor;
  /** Cliente HTTP sem cookies, já com a Origin do frontend. */
  http: () => TestAgent;
}

export async function createTestApp(): Promise<TestContext> {
  const mail = new FakeMailTransport();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: ['error'],
  });
  configureApp(app, { trustProxyHops: 0, https: false });
  await app.init();

  return {
    app,
    mail,
    db: app.get<Database>(DATABASE),
    processor: app.get(NotificationProcessor),
    http: () => request.agent(app.getHttpServer()).set('Origin', ORIGIN),
  };
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`truncate table
    audit_events, notifications, sessions, account_tokens, invitations,
    customer_contacts, customers, accounts restart identity cascade`);
}

let passwordHash: Promise<string> | undefined;

export async function createAccount(
  db: Database,
  input: { email: string; role: Role; name?: string },
): Promise<string> {
  passwordHash ??= hashPassword(PASSWORD);
  const [row] = await db
    .insert(accounts)
    .values({
      email: input.email,
      name: input.name ?? input.email.split('@')[0],
      role: input.role,
      passwordHash: await passwordHash,
      emailVerifiedAt: new Date(),
    })
    .returning({ id: accounts.id });
  return row.id;
}

/** Cliente com contato; com `portal`, o contato recebe conta de portal. */
export async function createCustomer(
  db: Database,
  input: {
    document: string;
    name: string;
    contactEmail: string;
    portal?: boolean;
  },
): Promise<{
  customerId: string;
  contactId: string;
  accountId: string | null;
}> {
  const [customer] = await db
    .insert(customers)
    .values({
      kind: 'pessoa_juridica',
      name: input.name,
      document: input.document,
    })
    .returning({ id: customers.id });
  const accountId = input.portal
    ? await createAccount(db, { email: input.contactEmail, role: 'cliente' })
    : null;
  const [contact] = await db
    .insert(customerContacts)
    .values({
      customerId: customer.id,
      name: `Contato ${input.name}`,
      email: input.contactEmail,
      accountId,
    })
    .returning({ id: customerContacts.id });
  return { customerId: customer.id, contactId: contact.id, accountId };
}

/** Agente HTTP autenticado (o cookie de sessão fica guardado no agente). */
export async function signIn(
  ctx: TestContext,
  email: string,
): Promise<TestAgent> {
  const agent = ctx.http();
  await agent
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return agent;
}

/** Gera um CNPJ numérico válido a partir de 12 dígitos. */
export function cnpj(base12: string): string {
  const digit = (value: string) => {
    let sum = 0;
    let weight = 2;
    for (let i = value.length - 1; i >= 0; i--) {
      sum += Number(value[i]) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = `${base12}${digit(base12)}`;
  return `${first}${digit(first)}`;
}
