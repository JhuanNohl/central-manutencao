import type { NotificationTemplate } from '@central/contracts';
import type { MailMessage } from './mail-transport.js';
import {
  TEAM_EVENT_COPY,
  TEAM_RMA_EVENTS,
  type TeamRmaEvent,
} from './team-events.js';

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

/** Texto opcional do payload; ausente ou nulo vira `fallback`. */
function optional(
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = payload[key];
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/** Lista de linhas do payload (ex.: equipamentos recebidos). */
/**
 * Equipamentos listados no corpo do e-mail. Um chamado pode ter 200: a lista
 * para nos primeiros e indica quantos faltam, que ficam no atendimento.
 */
const MAX_LISTED_ITEMS = 30;

function lines(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`Campo "${key}" ausente no payload da notificação.`);
  }
  if (value.length <= MAX_LISTED_ITEMS) return value;
  const hidden = value.length - MAX_LISTED_ITEMS;
  return [
    ...value.slice(0, MAX_LISTED_ITEMS),
    `… e mais ${hidden} ${hidden === 1 ? 'equipamento' : 'equipamentos'}; a lista completa está no atendimento.`,
  ];
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

const TEAM_FOOTER =
  'Você recebe esta mensagem porque é a caixa do setor de manutenção.';

function teamEventOf(payload: Record<string, unknown>): TeamRmaEvent {
  const event = str(payload, 'event');
  if (!(TEAM_RMA_EVENTS as readonly string[]).includes(event)) {
    throw new Error(`Evento "${event}" desconhecido no aviso ao setor.`);
  }
  return event as TeamRmaEvent;
}

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
        'Seu acesso à equipe da Central de Manutenção',
        [
          'Olá,',
          `${str(payload, 'invitedByName')} criou seu acesso à Central de Manutenção com o perfil ${str(payload, 'roleLabel')}.`,
          'Para liberar o acesso, abra o link abaixo, informe seu nome e crie a sua senha.',
          `O link é pessoal e vale até ${str(payload, 'expiresAtLabel')}.`,
        ],
        { label: 'Criar minha senha', link: str(payload, 'link') },
        'Se você não esperava este acesso, ignore esta mensagem.',
      );
    case 'acesso_liberado':
      return layout(
        'Acesso liberado — Central de Manutenção',
        [
          `Olá, ${str(payload, 'name')}.`,
          `Seu acesso à Central de Manutenção está liberado, com o perfil ${str(payload, 'roleLabel')}.`,
          `Entre com o e-mail ${str(payload, 'email')} e a senha que você criou.`,
        ],
        { label: 'Entrar na Central', link: str(payload, 'link') },
        'Se você não reconhece este acesso, fale com o administrador do sistema.',
      );
    case 'boas_vindas':
      return layout(
        'Boas-vindas à Central de Manutenção',
        [
          `Olá, ${str(payload, 'name')}.`,
          'Sua conta na Central de Manutenção foi criada e já está ativa. Por ela você abre atendimentos, envia fotos e vídeos dos equipamentos e acompanha cada etapa até recebê-los de volta.',
          `Termo de garantia aceito: versão ${str(payload, 'termsVersion')}, em ${str(payload, 'termsAcceptedAtLabel')}.`,
        ],
        { label: 'Acessar o portal', link: str(payload, 'link') },
        'Se você não criou esta conta, ignore esta mensagem.',
      );
    case 'acesso_portal':
      return layout(
        'Seu acesso à Central de Manutenção',
        [
          `Olá, ${str(payload, 'name')}.`,
          `A equipe de manutenção da Central cadastrou ${str(payload, 'customerName')} e criou o seu acesso ao portal. O cadastro foi feito internamente: você não precisa se cadastrar.`,
          `E-mail de acesso: ${str(payload, 'email')}`,
          `Senha provisória: ${str(payload, 'temporaryPassword')}`,
          'No primeiro acesso, o sistema pede que você troque a senha provisória por uma senha sua.',
        ],
        { label: 'Acessar o portal', link: str(payload, 'link') },
        'Se você não esperava este acesso, ignore esta mensagem ou fale com a equipe de manutenção.',
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
      // Sem confirmação de e-mail desde 02/10/2026: a página do link não
      // existe mais. Um aviso antigo pendente falha em vez de sair quebrado.
      throw new Error('Modelo descontinuado: confirmacao_email.');
    case 'rma_aberto':
      return layout(
        `Atendimento #${str(payload, 'number')} aberto — Central de Manutenção`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `Registramos o atendimento #${str(payload, 'number')} com ${str(payload, 'itemsLabel')}.`,
          'Quando enviar os equipamentos, informe o envio no portal. O prazo de cada equipamento começa quando ele entra em diagnóstico.',
          `Termo de garantia aceito: versão ${str(payload, 'termsVersion')}, em ${str(payload, 'termsAcceptedAtLabel')}.`,
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
          `${str(payload, 'customerName')} enviou uma mensagem no chamado #${str(payload, 'number')}.`,
          `Responsável: ${optional(payload, 'assigneeName', 'sem responsável')}.`,
        ],
        { label: 'Abrir chamado', link: str(payload, 'link') },
        TEAM_FOOTER,
      );
    case 'rma_responsavel':
      return layout(
        `Responsável pelo atendimento #${str(payload, 'number')}`,
        [
          `Olá, ${str(payload, 'name')}.`,
          `${str(payload, 'assigneeName')} é agora o responsável pelo atendimento #${str(payload, 'number')} e acompanha os seus equipamentos até a devolução.`,
          'Fale com a equipe pela conversa do atendimento, no portal.',
        ],
        { label: 'Ver atendimento', link: str(payload, 'link') },
        REQUESTER_FOOTER,
      );
    case 'equipe_rma': {
      const copy = TEAM_EVENT_COPY[teamEventOf(payload)];
      const reason = optional(payload, 'reason', '');
      const shipping = optional(payload, 'shipping', '');
      return layout(
        `${copy.subject} — chamado #${str(payload, 'number')}`,
        [
          copy.intro(str(payload, 'customerName')),
          ...lines(payload, 'items'),
          ...(shipping ? [shipping] : []),
          ...(reason ? [`Motivo: ${reason}`] : []),
          `Responsável: ${optional(payload, 'assigneeName', 'sem responsável')}.`,
        ],
        { label: 'Abrir chamado', link: str(payload, 'link') },
        TEAM_FOOTER,
      );
    }
  }
}

/** Campos que o banco não guarda depois do envio: links com token e senhas. */
const SENSITIVE_PAYLOAD_FIELDS = ['link', 'temporaryPassword'];

/** Remove os campos sensíveis do payload depois do envio. */
export function redactPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const redacted = { ...payload };
  for (const field of SENSITIVE_PAYLOAD_FIELDS) {
    if (field in redacted) redacted[field] = '[removido após envio]';
  }
  return redacted;
}
