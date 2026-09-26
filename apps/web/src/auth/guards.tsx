import type { Permission } from '@central/contracts';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Alert, Loading, QueryError } from '../components/feedback';
import { hasPermission, useSession } from './session';

/** Exige sessão; sem ela, envia ao login e volta depois para a página pedida. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <Loading />;
  if (session.isError) return <QueryError error={session.error} />;
  if (!session.data) {
    return (
      <Navigate to="/entrar" replace state={{ from: location.pathname }} />
    );
  }
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
