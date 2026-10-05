/** Movimentações avisadas à caixa do setor (modelo `equipe_rma`). */
export const TEAM_RMA_EVENTS = [
  'aberto',
  'envio',
  'recebimento',
  'etapa',
  'cancelado',
] as const;
export type TeamRmaEvent = (typeof TEAM_RMA_EVENTS)[number];

export const TEAM_EVENT_COPY: Record<
  TeamRmaEvent,
  { subject: string; intro: (customer: string) => string }
> = {
  aberto: {
    subject: 'Novo chamado',
    intro: (customer) => `${customer} abriu um chamado pelo portal:`,
  },
  envio: {
    subject: 'Envio informado',
    intro: (customer) => `${customer} informou o envio dos equipamentos:`,
  },
  recebimento: {
    subject: 'Equipamentos recebidos',
    intro: () => 'Recebimento registrado na fábrica:',
  },
  etapa: {
    subject: 'Etapa alterada',
    intro: () => 'A etapa dos equipamentos abaixo mudou:',
  },
  cancelado: {
    subject: 'Chamado cancelado',
    intro: (customer) => `O chamado de ${customer} foi cancelado.`,
  },
};
