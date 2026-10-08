import type { InvoiceAddress } from '@central/contracts';

/** Texto comparável: maiúsculas, sem acentos e sem pontuação. */
function comparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const digits = (value: string) => value.replace(/\D/g, '');

/** Tipos de logradouro e as abreviações que as notas usam para eles. */
const STREET_TYPES = new Set([
  'R',
  'RUA',
  'AV',
  'AVENIDA',
  'AL',
  'ALAMEDA',
  'TV',
  'TRAVESSA',
  'ROD',
  'RODOVIA',
  'EST',
  'ESTRADA',
  'PC',
  'PRACA',
]);

/** Nome da via sem o tipo: "Rua das Palmeiras" e "R. das Palmeiras" → "DAS PALMEIRAS". */
function streetName(street: string): string {
  const words = comparable(street).split(' ');
  return STREET_TYPES.has(words[0])
    ? words.slice(1).join(' ')
    : words.join(' ');
}

export function formatAddress(address: InvoiceAddress): string {
  return `${address.street}, ${address.number}, ${address.district}, ${address.city}/${address.state}`;
}

/**
 * Partes do endereço da nota que não conferem com o da fábrica. A escrita
 * pode variar (Rua, R. ou R; acentos; caixa), e o logradouro pode trazer um
 * complemento antes do nome da via (ex.: "GALPÃO 01 - R. DAS PALMEIRAS").
 */
export function addressDivergences(
  actual: InvoiceAddress,
  expected: InvoiceAddress,
): string[] {
  const divergences: string[] = [];
  if (
    !` ${comparable(actual.street)} `.includes(
      ` ${streetName(expected.street)} `,
    )
  ) {
    divergences.push(`logradouro "${actual.street}"`);
  }
  if (digits(actual.number) !== digits(expected.number)) {
    divergences.push(`número "${actual.number}"`);
  }
  if (comparable(actual.district) !== comparable(expected.district)) {
    divergences.push(`bairro "${actual.district}"`);
  }
  if (comparable(actual.city) !== comparable(expected.city)) {
    divergences.push(`município "${actual.city}"`);
  }
  if (comparable(actual.state) !== comparable(expected.state)) {
    divergences.push(`UF "${actual.state}"`);
  }
  return divergences;
}
