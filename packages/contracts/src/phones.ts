import { z } from 'zod';

/**
 * Telefone brasileiro no formato `+55 (DD) 9 XXXX-XXXX` (celular) ou
 * `+55 (DD) XXXX-XXXX` (fixo). A máscara é progressiva: só acrescenta um
 * separador quando já existe o dígito seguinte, para o apagar não travar.
 */
const COUNTRY_PREFIX = '+55';
const COUNTRY_CODE = '55';
const NATIONAL_LENGTH = { landline: 10, mobile: 11 } as const;
const MOBILE_PREFIX = '9';

/** DDD e número, sem o código do país. */
export function nationalPhoneDigits(value: string): string {
  const typed = value.trim().startsWith(COUNTRY_PREFIX)
    ? value.trim().slice(COUNTRY_PREFIX.length)
    : value;
  const digits = typed.replace(/\D/g, '');
  // Número colado com o código do país e sem o "+".
  return digits.length > NATIONAL_LENGTH.mobile &&
    digits.startsWith(COUNTRY_CODE)
    ? digits.slice(COUNTRY_CODE.length)
    : digits;
}

function subscriberNumber(number: string): string {
  if (number.startsWith(MOBILE_PREFIX)) {
    const block = number.slice(1, 5);
    const end = number.slice(5, 9);
    return `${MOBILE_PREFIX}${block && ` ${block}`}${end && `-${end}`}`;
  }
  const start = number.slice(0, 4);
  const end = number.slice(4, 8);
  return `${start}${end && `-${end}`}`;
}

export function maskPhone(value: string): string {
  const digits = nationalPhoneDigits(value).slice(0, NATIONAL_LENGTH.mobile);
  if (!digits) return '';
  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  if (!number) return `${COUNTRY_PREFIX} (${areaCode}`;
  return `${COUNTRY_PREFIX} (${areaCode}) ${subscriberNumber(number)}`;
}

export function isValidPhone(value: string): boolean {
  const digits = nationalPhoneDigits(value);
  if (!/^[1-9]{2}/.test(digits)) return false;
  const mobile = digits[2] === MOBILE_PREFIX;
  return (
    digits.length ===
    (mobile ? NATIONAL_LENGTH.mobile : NATIONAL_LENGTH.landline)
  );
}

/** Opcional; quando informado, é gravado sempre no formato da máscara. */
export const phoneSchema = z
  .string()
  .trim()
  .max(30, 'Telefone muito longo')
  .refine(
    (value) => value === '' || isValidPhone(value),
    'Informe o telefone com DDD, ex.: +55 (11) 9 1234-5678',
  )
  .transform(maskPhone);
