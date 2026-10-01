import {
  mediaOf,
  ownerMayUpload,
  remainingOf,
  sessionStatus,
} from './upload-session-rules.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const session = {
  kind: 'abertura' as const,
  photoLimit: 3,
  videoLimit: 1,
  expiresAt: new Date('2026-10-01T12:15:00Z'),
  closedAt: null,
};

describe('regras do envio pelo celular', () => {
  it('a sessão expira pelo prazo e encerra ao ser fechada', () => {
    expect(sessionStatus(session, NOW)).toBe('aberta');
    expect(sessionStatus(session, new Date('2026-10-01T12:15:00Z'))).toBe(
      'expirada',
    );
    expect(sessionStatus({ ...session, closedAt: NOW }, NOW)).toBe('encerrada');
  });

  it('desconta o que já chegou de cada mídia', () => {
    const sent = [
      { purpose: 'foto_item' as const },
      { purpose: 'video_item' as const },
    ];
    expect(remainingOf(session, sent)).toEqual({ foto: 2, video: 0 });
    expect(mediaOf('validacao', { purpose: 'video_validacao' })).toBe('video');
  });

  it('a conta precisa seguir ativa e com a permissão do envio', () => {
    expect(
      ownerMayUpload('abertura', { role: 'cliente', status: 'ativa' }),
    ).toBe(true);
    expect(
      ownerMayUpload('validacao', { role: 'cliente', status: 'ativa' }),
    ).toBe(false);
    expect(
      ownerMayUpload('validacao', { role: 'agente', status: 'desativada' }),
    ).toBe(false);
    expect(ownerMayUpload('abertura', undefined)).toBe(false);
  });
});
