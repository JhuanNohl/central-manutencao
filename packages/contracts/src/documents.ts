/**
 * Validação de CPF e CNPJ por dígitos verificadores.
 *
 * O CNPJ aceita o formato alfanumérico (vigente a partir de julho de 2026):
 * 12 caracteres [0-9A-Z] seguidos de 2 dígitos verificadores numéricos.
 * O valor de cada caractere é o seu código ASCII menos 48.
 */

export function normalizeDocument(value: string): string {
  return value.replace(/[.\-/\s]/g, '').toUpperCase();
}

export type DocumentKind = 'cpf' | 'cnpj';

const DOCUMENT_LENGTH: Record<DocumentKind, number> = { cpf: 11, cnpj: 14 };
const CNPJ_BASE_LENGTH = 12;

/** Tamanho de cada grupo e o separador que vem antes dele. */
const DOCUMENT_GROUPS: Record<DocumentKind, [number, string][]> = {
  cpf: [
    [3, ''],
    [3, '.'],
    [3, '.'],
    [2, '-'],
  ],
  cnpj: [
    [2, ''],
    [3, '.'],
    [3, '.'],
    [4, '/'],
    [2, '-'],
  ],
};

/** Caracteres aceitos, na ordem digitada, até o tamanho do documento. */
function documentCharacters(value: string, kind: DocumentKind): string {
  const characters = normalizeDocument(value).replace(/[^0-9A-Z]/g, '');
  if (kind === 'cpf') {
    return characters.replace(/\D/g, '').slice(0, DOCUMENT_LENGTH.cpf);
  }
  // CNPJ: 12 caracteres alfanuméricos e 2 dígitos verificadores numéricos.
  const base = characters.slice(0, CNPJ_BASE_LENGTH);
  const checkDigits = characters
    .slice(CNPJ_BASE_LENGTH)
    .replace(/\D/g, '')
    .slice(0, DOCUMENT_LENGTH.cnpj - CNPJ_BASE_LENGTH);
  return base + checkDigits;
}

/**
 * Máscara progressiva (`xxx.xxx.xxx-xx` ou `xx.xxx.xxx/xxxx-xx`): o separador
 * só aparece quando já existe o caractere seguinte, para o apagar não travar.
 */
export function maskDocument(value: string, kind: DocumentKind): string {
  const characters = documentCharacters(value, kind);
  let masked = '';
  let position = 0;
  for (const [size, separator] of DOCUMENT_GROUPS[kind]) {
    const group = characters.slice(position, position + size);
    if (!group) break;
    masked += separator + group;
    position += size;
  }
  return masked;
}

/** CPF (11) ou CNPJ (14, inclusive alfanumérico) com a pontuação usual. */
export function formatDocument(document: string): string {
  if (document.length === DOCUMENT_LENGTH.cpf) {
    return maskDocument(document, 'cpf');
  }
  if (document.length === DOCUMENT_LENGTH.cnpj) {
    return maskDocument(document, 'cnpj');
  }
  return document;
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDocument(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) {
    return false;
  }

  const digit = (length: number) => {
    let sum = 0;
    let weight = 2;
    for (let i = length - 1; i >= 0; i--) {
      sum += (cnpj.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}
