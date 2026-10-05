import { emailSchema, personNameSchema } from '@central/contracts';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Database } from '../database/database.types.js';
import { accounts } from '../database/schema/index.js';
import { ensureEmailAvailable } from './account-rules.js';
import type { TemporaryCredentials } from '../common/crypto/passwords.js';

export const administratorInputSchema = z.object({
  email: emailSchema,
  name: personNameSchema,
});
export type AdministratorInput = z.infer<typeof administratorInputSchema>;

/**
 * Primeiro administrador de um ambiente novo (homologação ou produção), que
 * ainda não tem quem convide. A conta nasce com senha provisória, trocada no
 * primeiro acesso; os demais integrantes entram por convite.
 */
export async function createAdministrator(
  db: Database,
  input: AdministratorInput,
  credentials: TemporaryCredentials,
): Promise<string> {
  return db.transaction(async (tx) => {
    await ensureEmailAvailable(tx, input.email);
    const [account] = await tx
      .insert(accounts)
      .values({
        email: input.email,
        name: input.name,
        passwordHash: credentials.passwordHash,
        role: 'administrador',
        passwordChangeRequired: true,
      })
      .returning({ id: accounts.id });
    // Sem ator: a conta foi criada por linha de comando, no servidor.
    await new AuditService().record(tx, {
      actorAccountId: null,
      action: 'conta.administrador_inicial_criado',
      entityType: 'account',
      entityId: account.id,
    });
    return account.id;
  });
}
