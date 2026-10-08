import { isStaffRole } from '@central/contracts';
import { z } from 'zod';
import { accounts } from '../database/schema/index.js';
import {
  accountByEmail,
  importedPasswordHash,
  normalizedEmail,
  type ImportContext,
} from './import-context.js';
import {
  importedEntityOf,
  LEGACY_SOURCES,
  recordLegacy,
} from './legacy-records.js';
import type { LegacyStaff } from './legacy-source.js';

const emailSchema = z.email();

/** Conta de cada agente importado: staff_id do legado → conta aqui. */
export type StaffAccounts = ReadonlyMap<number, string>;

const sourceOf = (staff: LegacyStaff) => `ost_staff ${staff.id}`;

/**
 * E-mail da conta do agente: o da lista de-para ou o do legado. Um e-mail
 * repetido entre agentes não serve (decisão de 06/10/2026): a conta
 * compartilhada apagaria quem fez cada ação.
 *
 * A conta do legado com a caixa do setor entra só para assinar o histórico
 * (decisão de 08/10/2026): desativada, sem login, para as respostas que ela
 * deu continuarem visíveis ao cliente na conversa.
 */
interface StaffEmail {
  email: string;
  historyOnly: boolean;
}

function staffEmailOf(
  ctx: ImportContext,
  staff: LegacyStaff,
  repeated: ReadonlySet<string>,
): StaffEmail | { problem: string } {
  const listed = ctx.options.staffEmails.get(staff.id);
  const email = normalizedEmail(listed ?? staff.email);
  const needsList = `informe o e-mail próprio do agente na lista --staff-emails (staff_id ${staff.id})`;
  if (!email || !emailSchema.safeParse(email).success) {
    return { problem: `sem e-mail válido; ${needsList}` };
  }
  if (listed) return { email, historyOnly: false };
  if (email === ctx.options.maintenanceInbox) {
    return { email, historyOnly: true };
  }
  if (repeated.has(email)) {
    return { problem: `e-mail repetido entre agentes; ${needsList}` };
  }
  return { email, historyOnly: false };
}

/** E-mails do legado usados por mais de um agente sem e-mail na lista. */
function repeatedEmails(ctx: ImportContext, staff: LegacyStaff[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const member of staff) {
    if (ctx.options.staffEmails.has(member.id)) continue;
    const email = normalizedEmail(member.email);
    if (!email) continue;
    if (seen.has(email)) repeated.add(email);
    seen.add(email);
  }
  return repeated;
}

async function importMember(
  ctx: ImportContext,
  staff: LegacyStaff,
  { email, historyOnly }: StaffEmail,
): Promise<string> {
  // Conta já existente com o mesmo e-mail (ex.: o primeiro administrador,
  // criado pela linha de comando): é a mesma pessoa, vincula sem alterar.
  const existing = await accountByEmail(ctx.db, email);
  if (existing) {
    ctx.report.warn(
      sourceOf(staff),
      'já existia uma conta com o e-mail; vinculada sem alterações',
    );
    await recordLegacy(ctx.db, [
      {
        sourceTable: LEGACY_SOURCES.staff,
        sourceId: staff.id,
        entityType: 'account',
        entityId: existing.id,
      },
    ]);
    return existing.id;
  }
  // Conta só de histórico: nem a senha do legado entra.
  const passwordHash = await importedPasswordHash(
    historyOnly ? null : staff.passwordHash,
  );
  const active = staff.isActive && !historyOnly;
  if (historyOnly) {
    ctx.report.warn(
      sourceOf(staff),
      'conta da caixa do setor: entra desativada, só como autora do histórico',
    );
  }
  return ctx.db.transaction(async (tx) => {
    const [account] = await tx
      .insert(accounts)
      .values({
        email,
        name: staff.name,
        passwordHash,
        role: staff.isAdmin ? 'administrador' : 'agente',
        status: active ? 'ativa' : 'desativada',
        disabledAt: active ? null : new Date(),
        emailVerifiedAt: staff.createdAt,
        lastLoginAt: staff.lastLoginAt,
        createdAt: staff.createdAt,
      })
      .returning({ id: accounts.id });
    await recordLegacy(tx, [
      {
        sourceTable: LEGACY_SOURCES.staff,
        sourceId: staff.id,
        entityType: 'account',
        entityId: account.id,
      },
    ]);
    return account.id;
  });
}

/** Equipe (`ost_staff`) → contas de agente e administrador. */
export async function importStaff(ctx: ImportContext): Promise<StaffAccounts> {
  const staff = await ctx.source.staff();
  const repeated = repeatedEmails(ctx, staff);
  const imported = new Map<number, string>();
  for (const member of staff) {
    const previous = await importedEntityOf(
      ctx.db,
      LEGACY_SOURCES.staff,
      member.id,
    );
    if (previous) {
      imported.set(member.id, previous);
      ctx.report.countExisting('equipe');
      continue;
    }
    const login = staffEmailOf(ctx, member, repeated);
    if ('problem' in login) {
      ctx.report.skip(sourceOf(member), login.problem);
      continue;
    }
    const existing = await accountByEmail(ctx.db, login.email);
    if (existing && !isStaffRole(existing.role)) {
      ctx.report.skip(
        sourceOf(member),
        'o e-mail já é de uma conta de cliente; informe outro na lista --staff-emails',
      );
      continue;
    }
    imported.set(member.id, await importMember(ctx, member, login));
    ctx.report.count('equipe');
  }
  return imported;
}
