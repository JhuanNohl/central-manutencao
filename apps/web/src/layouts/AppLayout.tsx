import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { hasPermission, useSession } from '../auth/session';
import { BrandLogo } from '../components/BrandLogo';
import { NAV_ITEMS } from './navigation';
import { UserMenu } from './UserMenu';

export function AppLayout() {
  const { data: account } = useSession();
  const location = useLocation();
  // No celular, o menu lateral fecha sozinho ao trocar de página.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const menuOpen = openFor === location.pathname;
  const closeMenu = () => setOpenFor(null);

  if (!account) return null;
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(account, item.permission),
  );

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="topbar-icon-button menu-toggle"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="menu-lateral"
          onClick={() => setOpenFor(menuOpen ? null : location.pathname)}
        >
          {menuOpen ? (
            <X size={22} aria-hidden />
          ) : (
            <Menu size={22} aria-hidden />
          )}
        </button>
        <Link to="/" className="topbar-brand">
          <BrandLogo surface="onDark" />
          <span className="topbar-divider" aria-hidden />
          <span className="topbar-title">Central de Manutenção</span>
        </Link>
        <UserMenu account={account} />
      </header>

      <div className="shell">
        <nav
          id="menu-lateral"
          className={`sidebar${menuOpen ? ' open' : ''}`}
          aria-label="Principal"
        >
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={closeMenu}>
              <Icon size={22} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div
          className={`sidebar-backdrop${menuOpen ? ' open' : ''}`}
          onClick={closeMenu}
          aria-hidden
        />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  );
}
