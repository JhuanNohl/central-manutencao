import { itemSla } from './sla.js';

describe('itemSla', () => {
  const received = new Date('2026-10-01T17:00:00Z');

  it('não inicia sem recebimento físico (RN04)', () => {
    expect(itemSla(null, null, new Date())).toEqual({
      status: 'nao_iniciado',
      startedAt: null,
      dueAt: null,
      hours: null,
    });
  });

  it('vence 720 horas depois, no mesmo horário (P01)', () => {
    const sla = itemSla(received, 720, new Date('2026-10-10T00:00:00Z'));
    expect(sla).toEqual({
      status: 'no_prazo',
      startedAt: '2026-10-01T17:00:00.000Z',
      dueAt: '2026-10-31T17:00:00.000Z',
      hours: 720,
    });
  });

  it('fica atrasado só depois do instante de vencimento', () => {
    expect(
      itemSla(received, 720, new Date('2026-10-31T17:00:00Z')).status,
    ).toBe('no_prazo');
    expect(
      itemSla(received, 720, new Date('2026-10-31T17:00:01Z')).status,
    ).toBe('atrasado');
  });

  it('usa o prazo aplicado no item, não a configuração atual (CA15)', () => {
    expect(itemSla(received, 240, received).dueAt).toBe(
      '2026-10-11T17:00:00.000Z',
    );
  });
});
