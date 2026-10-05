import { Inject, Injectable } from '@nestjs/common';
import type { ContactView } from '@central/contracts';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import {
  temporaryCredentials,
  type TemporaryCredentials,
} from '../common/crypto/passwords.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
} from '../database/schema/index.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AuthContext } from './auth-context.js';
import { ensureEmailAvailable } from './account-rules.js';
import { revokeOpenInvitations } from './invitation-queries.js';

/** Contato que recebe o acesso, já gravado e sem conta. */
export interface PortalContact {
  id: string;
  name: string;
  email: string;
  customerId: string;
  customerName: string;
}

/**
 * Acesso ao portal criado pela equipe para um contato de cliente (decisão
 * de 02/10/2026), no cadastro do cliente ou depois, pelo detalhe dele. A
 * conta nasce com uma senha provisória única, enviada por e-mail, e a troca
 * é obrigatória no primeiro acesso.
 */
@Injectable()
export class PortalAccessService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
  ) {}

  async grantForContact(
    auth: AuthContext,
    customerId: string,
    contactId: string,
  ): Promise<ContactView> {
    const credentials = await temporaryCredentials();

    return this.db.transaction(async (tx) => {
      const [contact] = await tx
        .select({
          id: customerContacts.id,
          name: customerContacts.name,
          email: customerContacts.email,
          phone: customerContacts.phone,
          accountId: customerContacts.accountId,
          customerId: customerContacts.customerId,
          customerName: customers.name,
        })
        .from(customerContacts)
        .innerJoin(customers, eq(customers.id, customerContacts.customerId))
        .where(
          and(
            eq(customerContacts.id, contactId),
            eq(customerContacts.customerId, customerId),
          ),
        )
        .for('update', { of: customerContacts });
      if (!contact) throw ApiException.notFound('Contato não encontrado.');
      if (contact.accountId) {
        throw ApiException.conflict('Este contato já possui acesso ao portal.');
      }
      await this.grant(tx, auth, contact, credentials);

      return {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        hasPortalAccess: true,
      };
    });
  }

  /**
   * Cria a conta do contato e o aviso com a senha provisória, na transação
   * de quem chama. `emailPath` aponta o campo do formulário em conflito.
   */
  async grant(
    tx: Executor,
    auth: AuthContext,
    contact: PortalContact,
    credentials: TemporaryCredentials,
    emailPath?: string,
  ): Promise<void> {
    await ensureEmailAvailable(tx, contact.email, emailPath);

    // Um convite antigo em aberto deixa de valer: o acesso agora é este.
    await revokeOpenInvitations(tx, contact.email);
    const [account] = await tx
      .insert(accounts)
      .values({
        email: contact.email,
        name: contact.name,
        passwordHash: credentials.passwordHash,
        role: 'cliente',
        passwordChangeRequired: true,
      })
      .returning({ id: accounts.id });
    await tx
      .update(customerContacts)
      .set({ accountId: account.id })
      .where(eq(customerContacts.id, contact.id));

    await this.audit.record(tx, {
      actorAccountId: auth.account.id,
      action: 'conta.acesso_portal_criado',
      entityType: 'account',
      entityId: account.id,
      data: { customerId: contact.customerId, contactId: contact.id },
    });
    // A senha sai do payload assim que o e-mail é enviado (redactPayload).
    await this.notifications.enqueue(tx, {
      template: 'acesso_portal',
      recipient: contact.email,
      origin: `account:${account.id}`,
      dedupeKey: `acesso_portal:${account.id}`,
      payload: {
        name: contact.name,
        customerName: contact.customerName,
        email: contact.email,
        temporaryPassword: credentials.temporaryPassword,
        link: this.links.login(),
      },
    });
  }
}
