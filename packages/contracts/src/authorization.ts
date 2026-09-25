/**
 * Matriz de papéis e permissões (proposta para a pendência P02).
 *
 * O backend é a única fonte de decisão de acesso; o frontend usa esta
 * matriz apenas para mostrar ou esconder ações. Além da permissão, o
 * cliente só alcança dados do próprio cadastro (escopo verificado no backend).
 */
export const ROLES = [
  'cliente',
  'agente_consulta',
  'agente',
  'administrador',
] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES = [
  'agente_consulta',
  'agente',
  'administrador',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  cliente: 'Cliente',
  agente_consulta: 'Agente (somente consulta)',
  agente: 'Agente de manutenção',
  administrador: 'Administrador',
};

export const PERMISSIONS = [
  // Portal do cliente — sempre limitado ao próprio cadastro.
  'rma.own.read',
  'rma.own.create',
  // Equipe
  'rma.read',
  'rma.write',
  'rma.receive',
  'rma.dispatch',
  'customers.read',
  'customers.write',
  'customers.invite_contact',
  // Administração
  'accounts.read',
  'accounts.manage',
  'notifications.manage',
  'settings.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF_READ: Permission[] = ['rma.read', 'customers.read'];

const AGENT: Permission[] = [
  ...STAFF_READ,
  'rma.write',
  'rma.receive',
  'rma.dispatch',
  'customers.write',
  'customers.invite_contact',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  cliente: ['rma.own.read', 'rma.own.create'],
  agente_consulta: STAFF_READ,
  agente: AGENT,
  administrador: [
    ...AGENT,
    'accounts.read',
    'accounts.manage',
    'notifications.manage',
    'settings.manage',
  ],
};

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaffRole(role: Role): role is StaffRole {
  return (STAFF_ROLES as readonly Role[]).includes(role);
}
