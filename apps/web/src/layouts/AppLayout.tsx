import { ROLE_LABELS, type Permission } from '@central/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { post } from '../api/client';
import { hasPermission, useSession, useSetSession } from '../auth/session';

const NAV: { to: string; label: string; permission?: Permission }[] = [
  { to: '/', label: 'Início' },
  { to: '/clientes', label: 'Clientes', permission: 'customers.read' },
  { to: '/admin/contas', label: 'Contas', permission: 'accounts.read' },
  { to: '/admin/convites', label: 'Convites', permission: 'accounts.manage' },
  { to: '/admin/avisos', label: 'Avisos', permission: 'notifications.manage' },
];

export function AppLayout() {
  const { data: account } = useSession();
  const setSession = useSetSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [openFor, setOpenFor] = useState<string | null>(null);
  // O menu móvel fecha sozinho ao trocar de página.
  const open = openFor === location.pathname;

  const logout = useMutation({
    mutationFn: () => post('/auth/logout'),
    onSettled: () => {
      setSession(null);
      void navigate('/entrar', { replace: true });
    },
  });

  if (!account) return null;

  return (
    <>
      <header className={`topbar${open ? ' open' : ''}`}>
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <img src="/icon.svg" alt="" />
            Central de Manutenção
          </Link>
          <button
            type="button"
            className="btn btn-secondary btn-sm menu-toggle"
            aria-expanded={open}
            onClick={() => setOpenFor(open ? null : location.pathname)}
          >
            Menu
          </button>
          <nav className="nav" aria-label="Principal">
            {NAV.filter(
              (item) =>
                !item.permission || hasPermission(account, item.permission),
            ).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="user-menu">
            <Link to="/conta" className="who">
              {account.name}
              <small>
                {account.customer
                  ? account.customer.name
                  : ROLE_LABELS[account.role]}
              </small>
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </>
  );
}
