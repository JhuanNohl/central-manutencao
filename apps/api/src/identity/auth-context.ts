import {
  hasPermission,
  permissionsOf,
  type Permission,
  type Role,
  type SessionAccount,
} from '@central/contracts';

export interface AuthenticatedAccount {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  /** Senha provisória ainda não trocada (conta criada pela equipe). */
  passwordChangeRequired: boolean;
  /** Versão do termo de garantia aceita pela conta. */
  acceptedTermsVersion: string | null;
  /** Cliente ao qual a conta de portal está vinculada (nulo para a equipe). */
  customer: { id: string; name: string } | null;
}

export interface AuthContext {
  sessionId: string;
  account: AuthenticatedAccount;
}

export function can(auth: AuthContext, permission: Permission): boolean {
  return hasPermission(auth.account.role, permission);
}

export function toSessionAccount(
  account: AuthenticatedAccount,
): SessionAccount {
  return {
    ...account,
    permissions: [...permissionsOf(account.role)],
  };
}
