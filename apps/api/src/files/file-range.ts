export interface ByteRange {
  start: number;
  /** Último byte incluído, como no cabeçalho `Content-Range`. */
  end: number;
}

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Intervalo pedido pelo navegador (`Range: bytes=início-fim`), usado pelo
 * reprodutor de vídeo para tocar e avançar sem baixar o arquivo inteiro.
 * Pedido ausente, com vários intervalos ou fora do arquivo é ignorado: a
 * resposta volta a ser o arquivo completo, como a RFC 9110 permite.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | null {
  const match = header?.trim().match(SINGLE_RANGE);
  if (!match || size === 0) return null;
  const [, first, last] = match;
  if (first === '' && last === '') return null;

  // "bytes=-500": os últimos 500 bytes.
  if (first === '') {
    const length = Math.min(Number(last), size);
    return length > 0 ? { start: size - length, end: size - 1 } : null;
  }
  const start = Number(first);
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  return start <= end ? { start, end } : null;
}
