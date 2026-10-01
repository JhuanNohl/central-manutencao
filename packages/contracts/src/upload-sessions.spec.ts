import { describe, expect, it } from 'vitest';
import {
  createUploadSessionSchema,
  UPLOAD_SESSION_PURPOSES,
} from './upload-sessions.js';

const ITEM = '11111111-1111-4111-8111-111111111111';

describe('envio pelo celular', () => {
  it('a validação só aceita o vídeo de validação', () => {
    expect(UPLOAD_SESSION_PURPOSES.validacao).toEqual({
      foto: null,
      video: 'video_validacao',
    });
    expect(UPLOAD_SESSION_PURPOSES.abertura.foto).toBe('foto_item');
  });

  it('recusa sessão de abertura sem nada a enviar', () => {
    const empty = createUploadSessionSchema.safeParse({
      kind: 'abertura',
      label: 'Equipamento 1',
      photoLimit: 0,
      videoLimit: 0,
    });
    expect(empty.error?.issues[0].path).toEqual(['photoLimit']);
  });

  it('a sessão de validação aponta o chamado e o item', () => {
    const parsed = createUploadSessionSchema.safeParse({
      kind: 'validacao',
      rmaNumber: 100004,
      itemId: ITEM,
    });
    expect(parsed.success).toBe(true);
    expect(
      createUploadSessionSchema.safeParse({ kind: 'validacao', itemId: ITEM })
        .success,
    ).toBe(false);
  });
});
