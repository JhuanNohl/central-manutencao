import { SLA_DUE_SOON_HOURS, type RmaItemStage } from '@central/contracts';
import { itemSla, rmaSla } from './sla.js';

const started = (
  slaStartedAt: Date | null,
  slaHours: number | null,
  slaFinishedAt: Date | null = null,
) => ({ slaStartedAt, slaHours, slaFinishedAt });

describe('itemSla', () => {
  const diagnosis = new Date('2026-10-01T17:00:00Z');

  it('não inicia antes do diagnóstico', () => {
    expect(itemSla(started(null, null), new Date())).toEqual({
      status: 'nao_iniciado',
      startedAt: null,
      dueAt: null,
      hours: null,
      finishedAt: null,
    });
  });

  it('vence 720 horas depois, no mesmo horário (P01)', () => {
    const sla = itemSla(
      started(diagnosis, 720),
      new Date('2026-10-10T00:00:00Z'),
    );
    expect(sla).toEqual({
      status: 'no_prazo',
      startedAt: '2026-10-01T17:00:00.000Z',
      dueAt: '2026-10-31T17:00:00.000Z',
      hours: 720,
      finishedAt: null,
    });
  });

  it('fica atrasado só depois do instante de vencimento', () => {
    expect(
      itemSla(started(diagnosis, 720), new Date('2026-10-31T17:00:00Z')).status,
    ).toBe('no_prazo');
    expect(
      itemSla(started(diagnosis, 720), new Date('2026-10-31T17:00:01Z')).status,
    ).toBe('atrasado');
  });

  it('termina no envio ao cliente: a situação fica a daquele dia', () => {
    const shipped = new Date('2026-10-20T12:00:00Z');
    const sla = itemSla(
      started(diagnosis, 720, shipped),
      new Date('2026-12-01T00:00:00Z'),
    );
    expect(sla.status).toBe('no_prazo');
    expect(sla.finishedAt).toBe('2026-10-20T12:00:00.000Z');
  });

  it('usa o prazo aplicado no item, não a configuração atual (CA15)', () => {
    expect(itemSla(started(diagnosis, 240), diagnosis).dueAt).toBe(
      '2026-10-11T17:00:00.000Z',
    );
  });
});

describe('rmaSla', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const startedHoursAgo = (
    hours: number,
    stage: RmaItemStage = 'em_manutencao',
  ) => ({
    stage,
    sla: itemSla(
      started(new Date(now.getTime() - hours * 3_600_000), 720),
      now,
    ),
  });
  const notStarted = {
    stage: 'recebido' as const,
    sla: itemSla(started(null, null), now),
  };

  it('é nulo enquanto nenhum item entrou em diagnóstico', () => {
    expect(rmaSla([notStarted], now)).toBeNull();
  });

  it('segue o item que vence primeiro, ignorando os sem prazo', () => {
    const sla = rmaSla(
      [notStarted, startedHoursAgo(10), startedHoursAgo(700)],
      now,
    );
    expect(sla).toEqual({
      status: 'vence_em_breve',
      dueAt: '2026-10-11T08:00:00.000Z',
    });
  });

  it('ignora itens já despachados, cujo prazo terminou (RN08)', () => {
    const sla = rmaSla(
      [startedHoursAgo(730, 'devolucao'), startedHoursAgo(740, 'finalizado')],
      now,
    );
    expect(sla).toBeNull();
  });

  it(`vence em breve a partir de ${SLA_DUE_SOON_HOURS} horas do vencimento`, () => {
    const status = (elapsed: number) =>
      rmaSla([startedHoursAgo(elapsed)], now)?.status;
    expect(status(720 - SLA_DUE_SOON_HOURS - 1)).toBe('no_prazo');
    expect(status(720 - SLA_DUE_SOON_HOURS)).toBe('vence_em_breve');
    expect(status(720)).toBe('vence_em_breve');
    expect(status(721)).toBe('atrasado');
  });
});
