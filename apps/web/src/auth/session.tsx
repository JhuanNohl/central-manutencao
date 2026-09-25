import type {
  MeResponse,
  Permission,
  SessionAccount,
} from '@central/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get } from '../api/client';

export const SESSION_KEY = ['session'] as const;

/** Conta autenticada, ou `null` sem sessão. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<SessionAccount | null> => {
      try {
        return (await get<MeResponse>('/auth/me')).account;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

/** Grava a conta devolvida por login, cadastro ou aceite de convite. */
export function useSetSession() {
  const client = useQueryClient();
  return (account: SessionAccount | null) => {
    if (account === null) client.clear();
    client.setQueryData(SESSION_KEY, account);
  };
}

export function hasPermission(
  account: SessionAccount | null | undefined,
  permission: Permission,
): boolean {
  return account?.permissions.includes(permission) ?? false;
}
