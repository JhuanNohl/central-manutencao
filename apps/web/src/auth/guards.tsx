import type { Permission } from '@central/contracts';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Alert, Loading, QueryError } from '../components/feedback';
import { FirstAccessPage } from '../pages/auth/FirstAccessPage';
import { hasPermission, useSession } from './session';

/**
 * Exige sessão; sem ela, envia ao login e volta depois para a página pedida.
 * Com senha provisória, só a troca de senha aparece (a API também recusa o resto).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <Loading />;
  if (session.isError) return <QueryError error={session.error} />;
  if (!session.data) {
    return (
      <Navigate
        to="/entrar"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  if (session.data.passwordChangeRequired) return <FirstAccessPage />;
  return children;
}

/** Esconde a página de quem não tem a permissão (o backend também recusa). */
export function RequirePermission(props: {
  permission: Permission;
  children: ReactNode;
}) {
  const { data: account } = useSession();
  if (!hasPermission(account, props.permission)) {
    return (
      <Alert tone="warning">
        Você não tem permissão para acessar esta página.
      </Alert>
    );
  }
  return props.children;
}

/** Páginas de acesso (login, cadastro) redirecionam quem já está autenticado. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.isPending) return <Loading />;
  if (session.data) return <Navigate to="/" replace />;
  return children;
}
