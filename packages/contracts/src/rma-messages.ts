import { z } from 'zod';

/** Lado de quem escreveu: gravado no envio, não muda com o papel da conta. */
export const RMA_MESSAGE_SIDES = ['cliente', 'equipe'] as const;
export type RmaMessageSide = (typeof RMA_MESSAGE_SIDES)[number];

export const RMA_MESSAGE_SIDE_LABELS: Record<RmaMessageSide, string> = {
  cliente: 'Cliente',
  equipe: 'Equipe de manutenção',
};

export const RMA_MESSAGE_MAX_LENGTH = 2000;

export const sendRmaMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Escreva a mensagem')
    .max(
      RMA_MESSAGE_MAX_LENGTH,
      `A mensagem deve ter no máximo ${RMA_MESSAGE_MAX_LENGTH} caracteres`,
    ),
});
export type SendRmaMessageRequest = z.infer<typeof sendRmaMessageSchema>;

/** Mensagem da conversa do chamado entre o cliente e a equipe. */
export interface RmaMessageView {
  id: string;
  body: string;
  sentAt: string;
  side: RmaMessageSide;
  /** No portal, nulo para a equipe: o cliente não vê as contas internas (RN11). */
  authorName: string | null;
  /** Escrita pela conta que está consultando. */
  mine: boolean;
}
