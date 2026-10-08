import { describe, expect, it } from 'vitest';
import {
  contactPhoneOf,
  customerDocumentOf,
  customerNotesOf,
  itemDatesOf,
  openingMessageOf,
  priorityOf,
  reportedFailureOf,
  shipmentMethodOf,
  stageOf,
  warrantyOf,
} from './legacy-mapping.js';
import type { LegacyEquipment } from './legacy-source.js';

const equipment = (
  overrides: Partial<LegacyEquipment> = {},
): LegacyEquipment => ({
  id: 1,
  sequence: 1,
  model: 'SpeedFace V5L',
  serialNumber: 'A1',
  summary: 'Não liga',
  details: null,
  description: '',
  status: 'recebido',
  warranty: 'nao_solicitada',
  technicalReport: null,
  internalNote: null,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  updatedAt: new Date('2026-08-20T10:00:00Z'),
  ...overrides,
});

describe('de-para do sistema anterior', () => {
  it('converte as situações do equipamento em etapas', () => {
    expect(stageOf('aguardando_envio')).toBe('aguardando_envio');
    expect(stageOf('recebido')).toBe('recebido');
    expect(stageOf('aguardando_cliente')).toBe('aguardando_aprovacao');
    expect(stageOf('em_testes')).toBe('testes');
    expect(stageOf('concluido')).toBe('finalizado');
    expect(stageOf('desconhecida')).toBeNull();
  });

  it('prioridade baixa vira normal; desconhecida fica para o relatório', () => {
    expect(priorityOf('1')).toBe('normal');
    expect(priorityOf('Baixa')).toBe('normal');
    expect(priorityOf(null)).toBe('normal');
    expect(priorityOf('3')).toBe('alta');
    expect(priorityOf('Emergência')).toBe('urgente');
    expect(priorityOf('9')).toBeNull();
  });

  it('mantém a garantia com os mesmos valores', () => {
    expect(warrantyOf('em_analise')).toBe('em_analise');
    expect(warrantyOf('outra')).toBeNull();
  });

  it('identifica Correios, entrega própria e transportadora', () => {
    expect(shipmentMethodOf('CORREIOS')).toEqual({
      method: 'correios',
      carrier: null,
    });
    expect(shipmentMethodOf(' ')).toEqual({
      method: 'entrega_propria',
      carrier: null,
    });
    expect(shipmentMethodOf('jadlog')).toEqual({
      method: 'transportadora',
      carrier: 'jadlog',
    });
  });

  it('aceita CPF e CNPJ válidos, inclusive o CNPJ alfanumérico', () => {
    expect(customerDocumentOf('529.982.247-25')).toEqual({
      document: '52998224725',
      kind: 'pessoa_fisica',
    });
    expect(customerDocumentOf('12.abc.345/01de-35')).toEqual({
      document: '12ABC34501DE35',
      kind: 'pessoa_juridica',
    });
    expect(customerDocumentOf('111.111.111-11')).toBeNull();
    expect(customerDocumentOf(null)).toBeNull();
  });

  it('formata o telefone válido e guarda o resto como foi digitado', () => {
    expect(contactPhoneOf('11 91234-5678')).toBe('+55 (11) 9 1234-5678');
    expect(contactPhoneOf('ramal 22')).toBe('ramal 22');
    expect(contactPhoneOf('  ')).toBeNull();
  });

  it('junta as notas do usuário e os dados da organização', () => {
    expect(
      customerNotesOf('Cliente antigo', {
        name: 'Alfa',
        website: null,
        phone: '1140000000',
        address: null,
      }),
    ).toBe(
      'Cliente antigo\n\nOrganização no sistema anterior: Alfa\nTelefone: 1140000000',
    );
    expect(customerNotesOf(null, null)).toBeNull();
  });

  it('monta a falha relatada e a mensagem de abertura', () => {
    expect(reportedFailureOf(equipment({ details: 'Desde ontem' }))).toBe(
      'Não liga\n\nDesde ontem',
    );
    expect(reportedFailureOf(equipment({ summary: ' ' }))).toBe(
      'Não informado',
    );
    expect(openingMessageOf('Leitor', 'Urgente')).toBe(
      'Assunto: Leitor\n\nObservações: Urgente',
    );
    expect(openingMessageOf(null, ' ')).toBeNull();
  });

  describe('datas do equipamento', () => {
    const received = new Date('2026-08-05T12:00:00Z');
    const done = new Date('2026-08-15T12:00:00Z');
    const events = [
      {
        id: 1,
        equipmentId: 1,
        fromStatus: null,
        toStatus: 'recebido',
        note: null,
        staffId: 7,
        createdAt: received,
      },
      {
        id: 2,
        equipmentId: 1,
        fromStatus: 'recebido',
        toStatus: 'concluido',
        note: null,
        staffId: 7,
        createdAt: done,
      },
    ];

    it('antes do recebimento, sem datas', () => {
      expect(itemDatesOf('aguardando_envio', equipment(), events)).toEqual({
        receivedAt: null,
        slaStartedAt: null,
        slaFinishedAt: null,
      });
    });

    it('recebido: só a data do recebimento, pelo evento', () => {
      expect(itemDatesOf('recebido', equipment(), events)).toEqual({
        receivedAt: received,
        slaStartedAt: null,
        slaFinishedAt: null,
      });
    });

    it('finalizado: prazo do recebimento à conclusão', () => {
      expect(itemDatesOf('finalizado', equipment(), events)).toEqual({
        receivedAt: received,
        slaStartedAt: received,
        slaFinishedAt: done,
      });
    });

    it('sem eventos, usa a última atualização do equipamento', () => {
      const updated = new Date('2026-08-20T10:00:00Z');
      expect(itemDatesOf('testes', equipment(), [])).toEqual({
        receivedAt: updated,
        slaStartedAt: updated,
        slaFinishedAt: null,
      });
    });
  });
});
