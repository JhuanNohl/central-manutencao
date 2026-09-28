import { renderNotification } from './templates.js';

describe('renderNotification', () => {
  it('avisa a abertura com o número e o link do atendimento', () => {
    const message = renderNotification('rma_aberto', {
      name: 'Ana',
      number: '100006',
      itemsLabel: '2 equipamentos',
      link: 'http://localhost:5173/atendimentos/100006',
    });
    expect(message.subject).toContain('#100006');
    expect(message.text).toContain('2 equipamentos');
    expect(message.text).toContain('/atendimentos/100006');
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

  it('recusa payload sem a lista de equipamentos', () => {
    expect(() =>
      renderNotification('rma_itens_recebidos', {
        name: 'Ana',
        number: '1',
        link: 'x',
      }),
    ).toThrow('items');
  });
});
