import type { NotificationTemplate } from '@central/contracts';
import type { MailMessage } from './mail-transport.js';

type Rendered = Omit<MailMessage, 'to'>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') {
    throw new Error(`Campo "${key}" ausente no payload da notificação.`);
  }
  return value;
}

/** Lista de linhas do payload (ex.: equipamentos recebidos). */
function lines(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`Campo "${key}" ausente no payload da notificação.`);
  }
  return value;
}

function layout(
  subject: string,
  paragraphs: string[],
  action: { label: string; link: string },
  footer: string,
): Rendered {
  const text = [
    ...paragraphs,
    '',
    `${action.label}: ${action.link}`,
    '',
    footer,
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1c2321;line-height:1.5">
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
<p><a href="${escapeHtml(action.link)}" style="display:inline-block;padding:10px 18px;background:#0f7a4f;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="color:#5b6660;font-size:13px">${escapeHtml(footer)}</p>
</body></html>`;

  return { subject, text, html };
}

const REQUESTER_FOOTER =
  'Você recebe esta mensagem porque é o solicitante do atendimento.';

/**
 * Modelos de e-mail. O conteúdo nunca inclui notas internas, e os avisos de
 * mensagem não repetem o texto da conversa: ele é lido no sistema, com sessão.
 */
export function renderNotification(
  template: NotificationTemplate,
  payload: Record<string, unknown>,
): Rendered {
  switch (template) {
    case 'convite':
      return layout(
        'Convite para a Central de Manutenção',
        [
          'Olá,',
          payload.customerName
            ? `Você foi convidado(a) a acessar o portal da Central de Manutenção como contato de ${str(payload, 'customerName')}.`
            : 'Você foi convidado(a) a integrar a equipe da Central de Manutenção.',
          `O convite é pessoal e vale até ${str(payload, 'expiresAtLabel')}.`,
        ],
        { label: 'Aceitar convite', link: str(payload, 'link') },
        'Se você não esperava este convite, ignore esta mensagem.',
      );
    case 'redefinicao_senha':
      return layout(
        'Redefinição de senha — Central de Manutenção',
        [
          `Olá, ${str(payload, 'name')}.`,
          'Recebemos um pedido para redefinir a senha da sua conta.',
          `O link vale até ${str(payload, 'expiresAtLabel')} e pode ser usado uma única vez.`,
        ],
        { label: 'Redefinir senha', link: str(payload, 'link') },
        'Se você não fez este pedido, ignore esta mensagem; sua senha continua a mesma.',
      );
    case 'confirmacao_email':
      return layout(
        'Confirme seu e-mail — Central de Manutenção',
        [
          `Olá, ${str(payload, 'name')}.`,
          'Confirme seu endereço de e-mail para receber os avisos dos seus atendimentos.',
        ],
        { label: 'Confirmar e-mail', link: str(payload, 'link') },
        'Se você não criou esta conta, ignore esta mensagem.',
      );
    case 'rma_aberto':
      return layout(
        `Atendimento #${str(payload, 'number')} aberto — Central de Manutenção`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `Registramos o atendimento #${str(payload, 'number')} com ${str(payload, 'itemsLabel')}.`,
          'Quando enviar os equipamentos, informe o envio no portal. O prazo de cada equipamento começa quando ele chega à fábrica.',
        ],
        { label: 'Ver atendimento', link: str(payload, 'link') },
        REQUESTER_FOOTER,
      );
    case 'rma_aberto_na_fabrica':
      return layout(
        `Atendimento #${str(payload, 'number')} aberto — Central de Manutenção`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `Registramos o atendimento #${str(payload, 'number')} com ${str(payload, 'itemsLabel')}, que já estão na fábrica e seguem para diagnóstico.`,
          `O prazo de cada equipamento começou agora e vai até ${str(payload, 'dueAtLabel')}.`,
        ],
        { label: 'Acompanhar atendimento', link: str(payload, 'link') },
        REQUESTER_FOOTER,
      );
    case 'rma_itens_recebidos':
      return layout(
        `Equipamentos recebidos — atendimento #${str(payload, 'number')}`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `Recebemos na fábrica os equipamentos abaixo do atendimento #${str(payload, 'number')}:`,
          ...lines(payload, 'items'),
          'O prazo de cada um começa quando ele entra em diagnóstico; avisaremos a data.',
        ],
        { label: 'Acompanhar atendimento', link: str(payload, 'link') },
        REQUESTER_FOOTER,
      );
    case 'rma_etapa_alterada':
      return layout(
        `Atualização do atendimento #${str(payload, 'number')}`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `A etapa dos equipamentos abaixo do atendimento #${str(payload, 'number')} mudou:`,
          ...lines(payload, 'items'),
        ],
        { label: 'Acompanhar atendimento', link: str(payload, 'link') },
        REQUESTER_FOOTER,
      );
    case 'rma_cancelado':
      return layout(
        `Atendimento #${str(payload, 'number')} cancelado`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `O atendimento #${str(payload, 'number')} foi cancelado pela equipe de manutenção.`,
          `Motivo: ${str(payload, 'reason')}`,
          'Se ainda precisar do reparo, abra um novo atendimento pelo portal.',
        ],
        { label: 'Ver atendimento', link: str(payload, 'link') },
        REQUESTER_FOOTER,
      );
    case 'rma_mensagem_equipe':
      return layout(
        `Nova mensagem no atendimento #${str(payload, 'number')}`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `A equipe de manutenção enviou uma mensagem sobre o atendimento #${str(payload, 'number')}.`,
          'Leia e responda pela conversa do atendimento, no portal.',
        ],
        { label: 'Ver mensagem', link: str(payload, 'link') },
        REQUESTER_FOOTER,
      );
    case 'rma_mensagem_cliente':
      return layout(
        `Mensagem do cliente no chamado #${str(payload, 'number')}`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `${str(payload, 'customerName')} enviou uma mensagem no chamado #${str(payload, 'number')}.`,
        ],
        { label: 'Abrir chamado', link: str(payload, 'link') },
        'Você recebe esta mensagem porque é o responsável pelo chamado.',
      );
  }
}

/** Remove links com token depois do envio: o banco não deve guardá-los além do necessário. */
export function redactPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return 'link' in payload
    ? { ...payload, link: '[removido após envio]' }
    : payload;
}
