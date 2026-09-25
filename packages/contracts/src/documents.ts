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
