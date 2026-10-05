import { redactPayload, renderNotification } from './templates.js';

describe('renderNotification', () => {
  it('avisa a abertura com o número e o link do atendimento', () => {
    const message = renderNotification('rma_aberto', {
      name: 'Ana',
      number: '100006',
      itemsLabel: '2 equipamentos',
      link: 'http://localhost:5173/atendimentos/100006',
      termsVersion: '1.0',
      termsAcceptedAtLabel: '02/10/2026 10:00',
    });
    expect(message.subject).toContain('#100006');
    expect(message.text).toContain('2 equipamentos');
    expect(message.text).toContain('/atendimentos/100006');
    expect(message.text).toContain(
      'Termo de garantia aceito: versão 1.0, em 02/10/2026 10:00.',
    );
  });

  it('lista cada equipamento recebido e escapa o conteúdo no HTML', () => {
    const message = renderNotification('rma_itens_recebidos', {
      name: 'Ana',
      number: '100006',
      items: ['VR10 <S/N 1>, prazo até 28/10/2026 14:00'],
      link: 'http://localhost:5173/atendimentos/100006',
    });
    expect(message.text).toContain('VR10 <S/N 1>, prazo até 28/10/2026 14:00');
    expect(message.html).toContain('VR10 &lt;S/N 1&gt;');
  });

  it('informa o motivo do cancelamento ao solicitante', () => {
    const message = renderNotification('rma_cancelado', {
      name: 'Ana',
      number: '100006',
      reason: 'Aberto em duplicidade',
      link: 'http://localhost:5173/atendimentos/100006',
    });
    expect(message.subject).toContain('#100006');
    expect(message.text).toContain('Motivo: Aberto em duplicidade');
  });

  it('avisa a mensagem do cliente ao responsável, com o link do painel', () => {
    const message = renderNotification('rma_mensagem_cliente', {
      name: 'Bruno',
      number: '100006',
      customerName: 'Alfa Fictícia',
      link: 'http://localhost:5173/chamados/100006',
    });
    expect(message.text).toContain('Alfa Fictícia enviou uma mensagem');
    expect(message.text).toContain('/chamados/100006');
  });

  it('envia a senha provisória e a retira do banco depois do envio', () => {
    const payload = {
      name: 'Ana',
      customerName: 'Cliente Novo',
      email: 'ana@cliente.local',
      temporaryPassword: 'Ab3dEf7hJk9m',
      link: 'http://localhost:5173/entrar',
    };
    expect(renderNotification('acesso_portal', payload).text).toContain(
      'Senha provisória: Ab3dEf7hJk9m',
    );
    expect(JSON.stringify(redactPayload(payload))).not.toContain(
      'Ab3dEf7hJk9m',
    );
  });

  it('avisa o setor com o evento, os itens e o responsável', () => {
    const message = renderNotification('equipe_rma', {
      event: 'cancelado',
      number: '100006',
      customerName: 'Alfa Fictícia',
      assigneeName: null,
      items: [],
      reason: 'Cliente desistiu',
      link: 'http://localhost:5173/chamados/100006',
    });
    expect(message.subject).toBe('Chamado cancelado — chamado #100006');
    expect(message.text).toContain('Motivo: Cliente desistiu');
    expect(message.text).toContain('Responsável: sem responsável.');
    expect(() =>
      renderNotification('equipe_rma', {
        event: 'desconhecido',
        number: '1',
        customerName: 'X',
        items: [],
        link: 'x',
      }),
    ).toThrow('desconhecido');
  });

  it('recusa payload sem a lista de equipamentos', () => {
    expect(() =>
      renderNotification('rma_itens_recebidos', {
        name: 'Ana',
        number: '1',
        link: 'x',
      }),
    ).toThrow('items');
  });

  it('lista no e-mail só os 30 primeiros equipamentos de um chamado grande', () => {
    const items = Array.from(
      { length: 200 },
      (_, i) => `VR10 (S/N SIM-${i + 1})`,
    );
    const message = renderNotification('equipe_rma', {
      event: 'envio',
      number: '100200',
      customerName: 'Cliente Grande',
      assigneeName: null,
      items,
      shipping: 'Envio: Correios · rastreio BR1',
      link: 'http://localhost:5173/chamados/100200',
    });
    expect(message.text).toContain('VR10 (S/N SIM-30)');
    expect(message.text).not.toContain('VR10 (S/N SIM-31)');
    expect(message.text).toContain('… e mais 170 equipamentos');
    expect(message.text).toContain('Envio: Correios · rastreio BR1');
  });
});
