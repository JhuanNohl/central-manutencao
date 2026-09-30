import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_ROLES,
  canChangeStage,
  stageChangePermission,
  stagesLeadingTo,
  STAGE_TRANSITIONS,
} from './rma-management.js';
import { RMA_ITEM_STAGES } from './rmas.js';

describe('mudança de etapa pela equipe', () => {
  it('não substitui o envio nem o recebimento, que têm operação própria', () => {
    expect(STAGE_TRANSITIONS.aguardando_envio).toEqual([]);
    expect(STAGE_TRANSITIONS.em_transporte).toEqual([]);
    for (const from of RMA_ITEM_STAGES) {
      expect(canChangeStage(from, 'recebido')).toBe(false);
      expect(canChangeStage(from, 'em_transporte')).toBe(false);
    }
  });

  it('a condução técnica é livre entre as etapas, sem repetir a atual', () => {
    expect(canChangeStage('recebido', 'em_diagnostico')).toBe(true);
    expect(canChangeStage('em_testes', 'aguardando_peca')).toBe(true);
    expect(canChangeStage('em_testes', 'em_testes')).toBe(false);
  });

  it('a devolução só parte de "pronto para devolução" e "recebido pelo cliente" é final', () => {
    expect(stagesLeadingTo('em_devolucao')).toEqual(['pronto_para_devolucao']);
    expect(stagesLeadingTo('entregue')).toEqual(['em_devolucao']);
    expect(STAGE_TRANSITIONS.entregue).toEqual([]);
    expect(canChangeStage('em_devolucao', 'em_manutencao')).toBe(false);
  });

  it('o despacho exige permissão própria', () => {
    expect(stageChangePermission('em_manutencao')).toBe('rma.write');
    expect(stageChangePermission('em_devolucao')).toBe('rma.dispatch');
    expect(stageChangePermission('entregue')).toBe('rma.dispatch');
  });

  it('só quem opera chamados pode ser responsável', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['agente', 'administrador']);
  });
});
