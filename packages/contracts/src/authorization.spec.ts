import { describe, expect, it } from 'vitest';
import {
  hasPermission,
  isStaffRole,
  ROLE_PERMISSIONS,
  ROLES,
} from './authorization.js';

describe('matriz de permissões', () => {
  it('cliente recebe apenas permissões do próprio cadastro', () => {
    for (const permission of ROLE_PERMISSIONS.cliente) {
      expect(permission.startsWith('rma.own.')).toBe(true);
    }
  });

  it('agente somente consulta não altera', () => {
    expect(hasPermission('agente_consulta', 'rma.read')).toBe(true);
    expect(hasPermission('agente_consulta', 'rma.write')).toBe(false);
    expect(hasPermission('agente_consulta', 'customers.write')).toBe(false);
  });

  it('somente administrador gerencia contas', () => {
    const managers = ROLES.filter((role) =>
      hasPermission(role, 'accounts.manage'),
    );
    expect(managers).toEqual(['administrador']);
  });

  it('identifica papéis da equipe', () => {
    expect(isStaffRole('cliente')).toBe(false);
    expect(isStaffRole('agente')).toBe(true);
  });
});
