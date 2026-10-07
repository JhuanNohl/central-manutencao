import { describe, expect, it } from 'vitest';
import { cancellationNote } from './rma-cancellation.js';

describe('nota interna do cancelamento', () => {
  it('com equipamentos na fábrica, registra o processo de devolução', () => {
    const note = cancellationNote('Cliente desistiu', [
      'SpeedFace V5L (S/N A1)',
      'ProBio (S/N B2)',
    ]);
    expect(note.split('\n')).toEqual([
      'Em processo de devolução: chamado cancelado com equipamentos na fábrica.',
      'Motivo: Cliente desistiu',
      'A devolver ao cliente:',
      '- SpeedFace V5L (S/N A1)',
      '- ProBio (S/N B2)',
    ]);
  });

  it('sem equipamentos na fábrica, registra que não há devolução', () => {
    expect(cancellationNote('Aberto em duplicidade', [])).toContain(
      'não há devolução',
    );
  });
});
