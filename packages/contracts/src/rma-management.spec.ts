import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_ROLES,
  canChangeStage,
  isCancellable,
  requiresValidationVideo,
  stageChangePermission,
  stagesChangeableTo,
  teamNextStages,
} from './rma-management.js';
import {
  NEXT_STAGES,
  previousStages,
  RECEIVABLE_STAGES,
  RMA_ITEM_STAGES,
  SHIPPABLE_STAGES,
} from './rma-stages.js';

describe('fluxo das etapas', () => {
  it('cada etapa leva só à seguinte, sem voltar nem pular', () => {
    const order = RMA_ITEM_STAGES.indexOf.bind(RMA_ITEM_STAGES);
    for (const from of RMA_ITEM_STAGES) {
      for (const to of NEXT_STAGES[from]) {
        // A única volta é de "aguardando peça" para a manutenção.
        if (from === 'aguardando_peca') continue;
        expect(order(to)).toBeGreaterThan(order(from));
      }
    }
    expect(NEXT_STAGES.aguardando_envio).toEqual(['enviado']);
    expect(NEXT_STAGES.recebido).toEqual(['em_diagnostico']);
    expect(NEXT_STAGES.finalizado).toEqual([]);
  });

  it('só a manutenção tem dois caminhos: aguardar peça ou seguir para testes', () => {
    const branching = RMA_ITEM_STAGES.filter(
      (stage) => NEXT_STAGES[stage].length > 1,
    );
    expect(branching).toEqual(['em_manutencao']);
    expect(NEXT_STAGES.em_manutencao).toEqual(['aguardando_peca', 'testes']);
    expect(NEXT_STAGES.aguardando_peca).toEqual(['em_manutencao']);
  });

  it('o recebimento só parte do envio, e o envio só de "aguardando envio"', () => {
    expect(SHIPPABLE_STAGES).toEqual(['aguardando_envio']);
    expect(RECEIVABLE_STAGES).toEqual(['enviado']);
    expect(previousStages('em_diagnostico')).toEqual(['recebido']);
  });
});

describe('mudança de etapa pela equipe', () => {
  it('não faz o envio nem o recebimento, que têm operação própria', () => {
    for (const from of RMA_ITEM_STAGES) {
      expect(canChangeStage(from, 'enviado')).toBe(false);
      expect(canChangeStage(from, 'recebido')).toBe(false);
    }
  });

  it('avança um passo por vez e não volta', () => {
    expect(canChangeStage('recebido', 'em_diagnostico')).toBe(true);
    expect(canChangeStage('em_diagnostico', 'em_manutencao')).toBe(false);
    expect(canChangeStage('testes', 'em_manutencao')).toBe(false);
    expect(stagesChangeableTo('em_manutencao')).toEqual([
      'aguardando_aprovacao',
      'aguardando_peca',
    ]);
    expect(stagesChangeableTo('devolucao')).toEqual(['comprovacao']);
  });

  it('a equipe recebe o item enviado, mas não declara o envio', () => {
    expect(teamNextStages('enviado')).toEqual(['recebido']);
    expect(teamNextStages('aguardando_envio')).toEqual([]);
    expect(teamNextStages('em_manutencao')).toEqual([
      'aguardando_peca',
      'testes',
    ]);
    expect(teamNextStages('finalizado')).toEqual([]);
  });

  it('o despacho e o recebimento exigem permissão própria', () => {
    expect(stageChangePermission('recebido')).toBe('rma.receive');
    expect(stageChangePermission('em_manutencao')).toBe('rma.write');
    expect(stageChangePermission('devolucao')).toBe('rma.dispatch');
    expect(stageChangePermission('finalizado')).toBe('rma.dispatch');
  });

  it('só a devolução exige o vídeo de comprovação', () => {
    expect(requiresValidationVideo('devolucao')).toBe(true);
    expect(requiresValidationVideo('comprovacao')).toBe(false);
    expect(requiresValidationVideo('finalizado')).toBe(false);
  });

  it('cancela até o despacho do primeiro equipamento', () => {
    expect(isCancellable([{ stage: 'aguardando_aprovacao' }])).toBe(true);
    expect(
      isCancellable([{ stage: 'em_manutencao' }, { stage: 'devolucao' }]),
    ).toBe(false);
  });

  it('só quem opera chamados pode ser responsável', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['agente', 'administrador']);
  });
});
