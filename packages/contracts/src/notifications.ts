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
  'redefinicao_senha',
  'confirmacao_email',
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
