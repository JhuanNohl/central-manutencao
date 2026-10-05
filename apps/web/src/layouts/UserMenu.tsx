import { ROLE_LABELS, type SessionAccount } from '@central/contracts';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post } from '../api/client';
import { useSetSession } from '../auth/session';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)!] : parts;
  return letters.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** Encerra a sessão e volta à tela de acesso, mesmo se a API falhar. */
export function useLogout() {
  const setSession = useSetSession();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => post('/auth/logout'),
    onSettled: () => {
      setSession(null);
      void navigate('/entrar', { replace: true });
    },
  });
}

/** Atalho discreto para sair, ao lado do avatar. */
export function LogoutButton() {
  const logout = useLogout();
  return (
    <button
      type="button"
      className="topbar-icon-button logout-button"
      aria-label="Sair"
      title="Sair"
      disabled={logout.isPending}
      onClick={() => logout.mutate()}
    >
      <LogOut size={20} aria-hidden />
    </button>
  );
}

/** Avatar com o menu da conta: dados, "Minha conta" e sair. */
export function UserMenu({ account }: { account: SessionAccount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const outside =
        event instanceof MouseEvent &&
        !ref.current?.contains(event.target as Node);
      const escape = event instanceof KeyboardEvent && event.key === 'Escape';
      if (outside || escape) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Conta de ${account.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar" aria-hidden>
          {initials(account.name)}
        </span>
        <ChevronDown size={18} aria-hidden />
      </button>
      {open && (
        <div className="user-menu-panel" id={panelId}>
          <div className="who">
            <strong>{account.name}</strong>
            <small>{account.email}</small>
            <small>{account.customer?.name ?? ROLE_LABELS[account.role]}</small>
          </div>
          <Link
            to="/conta"
            className="menu-item"
            onClick={() => setOpen(false)}
          >
            <UserRound size={18} aria-hidden />
            Minha conta
          </Link>
          <button
            type="button"
            className="menu-item"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={18} aria-hidden />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
