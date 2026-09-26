import type { Permission } from '@central/contracts';
import {
  Bell,
  ClipboardList,
  House,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Sem permissão exigida, o item aparece para qualquer conta autenticada. */
  permission?: Permission;
}

/** Itens do menu lateral, na ordem de exibição. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Visão geral', icon: House },
  {
    to: '/chamados',
    label: 'Chamados',
    icon: ClipboardList,
    permission: 'rma.read',
  },
  {
    to: '/clientes',
    label: 'Clientes',
    icon: Users,
    permission: 'customers.read',
  },
  {
    to: '/admin/contas',
    label: 'Contas',
    icon: UserCog,
    permission: 'accounts.read',
  },
  {
    to: '/admin/convites',
    label: 'Convites',
    icon: UserPlus,
    permission: 'accounts.manage',
  },
  {
    to: '/admin/avisos',
    label: 'Avisos por e-mail',
    icon: Bell,
    permission: 'notifications.manage',
  },
];
