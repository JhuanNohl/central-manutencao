import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const NOTIFICATION_STATUSES = [
  'pendente',
  'enviando',
  'enviada',
  'falhou',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_TEMPLATES = [
  'convite',
  'acesso_liberado',
  'boas_vindas',
  'acesso_portal',
  'redefinicao_senha',
  // Sem uso desde 02/10/2026 (a conta nasce ativa); mantido pelos avisos antigos.
  'confirmacao_email',
  'rma_aberto',
  'rma_aberto_na_fabrica',
  'rma_itens_recebidos',
  'rma_etapa_alterada',
  'rma_cancelado',
  'rma_responsavel',
  'rma_mensagem_equipe',
  'rma_mensagem_cliente',
  'equipe_rma',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
});
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;

export interface NotificationView {
  id: string;
  template: NotificationTemplate;
  recipient: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
  sentAt: string | null;
}
