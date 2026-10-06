import { z } from 'zod';

/** Tamanho máximo de uma anotação interna (do chamado ou do cliente). */
export const INTERNAL_NOTE_MAX_LENGTH = 4000;

const noteBody = z
  .string()
  .trim()
  .max(
    INTERNAL_NOTE_MAX_LENGTH,
    `Use no máximo ${INTERNAL_NOTE_MAX_LENGTH} caracteres`,
  );

/** Nova anotação interna do chamado, só para a equipe (RN11). */
export const addRmaInternalNoteSchema = z.object({
  body: noteBody.min(1, 'Escreva a anotação'),
});
export type AddRmaInternalNoteRequest = z.infer<
  typeof addRmaInternalNoteSchema
>;

export interface RmaInternalNoteView {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

/** Observações internas do cliente; texto vazio apaga as observações. */
export const updateCustomerNotesSchema = z.object({ body: noteBody });
export type UpdateCustomerNotesRequest = z.infer<
  typeof updateCustomerNotesSchema
>;

export interface CustomerNotesView {
  body: string;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}
