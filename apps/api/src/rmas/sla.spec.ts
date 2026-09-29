import { SLA_DUE_SOON_HOURS, type RmaItemStage } from '@central/contracts';
import { itemSla, rmaSla } from './sla.js';

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

describe('rmaSla', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const receivedHoursAgo = (
    hours: number,
    stage: RmaItemStage = 'em_manutencao',
  ) => ({
    stage,
    sla: itemSla(new Date(now.getTime() - hours * 3_600_000), 720, now),
  });
  const notReceived = {
    stage: 'aguardando_envio' as const,
    sla: itemSla(null, null, now),
  };

  it('é nulo enquanto nenhum item foi recebido (RN04)', () => {
    expect(rmaSla([notReceived], now)).toBeNull();
  });

  it('segue o item que vence primeiro, ignorando os não recebidos', () => {
    const sla = rmaSla(
      [notReceived, receivedHoursAgo(10), receivedHoursAgo(700)],
      now,
    );
    expect(sla).toEqual({
      status: 'vence_em_breve',
      dueAt: '2026-10-11T08:00:00.000Z',
    });
  });

  it('ignora itens já despachados, cujo prazo terminou (RN08)', () => {
    const sla = rmaSla(
      [
        receivedHoursAgo(730, 'em_devolucao'),
        receivedHoursAgo(740, 'entregue'),
      ],
      now,
    );
    expect(sla).toBeNull();
  });

  it(`vence em breve a partir de ${SLA_DUE_SOON_HOURS} horas do vencimento`, () => {
    const status = (elapsed: number) =>
      rmaSla([receivedHoursAgo(elapsed)], now)?.status;
    expect(status(720 - SLA_DUE_SOON_HOURS - 1)).toBe('no_prazo');
    expect(status(720 - SLA_DUE_SOON_HOURS)).toBe('vence_em_breve');
    expect(status(720)).toBe('vence_em_breve');
    expect(status(721)).toBe('atrasado');
  });
});
