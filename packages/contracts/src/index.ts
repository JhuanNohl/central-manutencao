import { z } from 'zod';

// Mensagens padrão de validação em português, iguais na API e no frontend.
z.config(z.locales.ptBR());
z.config({
  customError: (issue) =>
    issue.code === 'invalid_type' && issue.input === undefined
      ? 'Campo obrigatório'
      : undefined,
});

export * from './accounts.js';
export * from './auth.js';
export * from './authorization.js';
export * from './common.js';
export * from './customers.js';
export * from './documents.js';
export * from './errors.js';
export * from './files.js';
export * from './invitations.js';
export * from './invoice-validation.js';
export * from './notifications.js';
export * from './rma-logistics.js';
export * from './rma-management.js';
export * from './rma-messages.js';
export * from './rma-opening.js';
export * from './rmas.js';
export * from './upload-sessions.js';
