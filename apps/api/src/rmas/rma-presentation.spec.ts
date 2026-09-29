import { distinctModels, rmaSubject, stageCounts } from './rma-presentation.js';

describe('rmaSubject', () => {
  it('um equipamento mostra modelo e nº de série', () => {
    expect(rmaSubject([{ model: 'VR10', serialNumber: 'SIM-001' }])).toBe(
      'Manutenção — VR10 (S/N SIM-001)',
    );
  });

  it('vários equipamentos agrupam modelos repetidos, na ordem em que aparecem', () => {
    expect(
      rmaSubject([
        { model: 'SpeedFace V5L', serialNumber: 'A' },
        { model: 'Inbio 260', serialNumber: 'B' },
        { model: 'SpeedFace V5L', serialNumber: 'C' },
      ]),
    ).toBe('Manutenção — 3 equipamentos: 2× SpeedFace V5L, Inbio 260');
  });
});

describe('stageCounts', () => {
  it('conta por etapa na ordem do fluxo e omite etapas vazias', () => {
    expect(stageCounts(['em_manutencao', 'recebido', 'em_manutencao'])).toEqual(
      [
        { stage: 'recebido', count: 1 },
        { stage: 'em_manutencao', count: 2 },
      ],
    );
  });
});

describe('distinctModels', () => {
  it('lista cada modelo uma vez, na ordem dos itens', () => {
    expect(
      distinctModels([
        { model: 'SpeedFace V5L' },
        { model: 'Inbio 260' },
        { model: 'SpeedFace V5L' },
      ]),
    ).toEqual(['SpeedFace V5L', 'Inbio 260']);
  });
});
