/** Entidades HTML comuns nas mensagens do osTicket. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
      const hex = code[1] === 'x' || code[1] === 'X';
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    },
  );
}

/** Tags que terminam uma linha ou um parágrafo. */
const LINE_BREAK = /<br\s*\/?>/gi;
const BLOCK_END = /<\/(p|div|li|tr|h[1-6]|blockquote)>/gi;
const LIST_ITEM = /<li[^>]*>/gi;
const INVISIBLE_BLOCK = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const ANY_TAG = /<[^>]+>/g;

/**
 * Texto da mensagem do legado: o HTML vira texto simples, com as quebras de
 * linha preservadas e sem nenhuma tag (o portal mostra o texto como está).
 */
export function plainTextOf(body: string, format: string): string {
  const text =
    format === 'html'
      ? decodeEntities(
          body
            .replace(INVISIBLE_BLOCK, '')
            .replace(LINE_BREAK, '\n')
            .replace(BLOCK_END, '\n')
            .replace(LIST_ITEM, '- ')
            .replace(ANY_TAG, ''),
        )
      : body;
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Divide um texto longo em partes de até `max` caracteres, de preferência
 * numa quebra de linha ou num espaço, para nada da conversa se perder.
 */
export function splitText(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const end = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
