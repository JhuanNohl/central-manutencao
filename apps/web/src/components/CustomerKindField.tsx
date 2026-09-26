import type { CustomerKind } from '@central/contracts';

const OPTIONS: { value: CustomerKind; label: string }[] = [
  { value: 'pessoa_juridica', label: 'Empresa (CNPJ)' },
  { value: 'pessoa_fisica', label: 'Pessoa física (CPF)' },
];

/** Escolha entre pessoa jurídica e física, que define os campos seguintes. */
export function CustomerKindField(props: {
  value: CustomerKind;
  onChange: (kind: CustomerKind) => void;
}) {
  return (
    <div className="radio-group" role="radiogroup" aria-label="Tipo de cliente">
      {OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name="kind"
            checked={props.value === option.value}
            onChange={() => props.onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** Rótulos que dependem do tipo de cliente. */
export function customerKindLabels(kind: CustomerKind) {
  const company = kind === 'pessoa_juridica';
  return {
    company,
    name: company ? 'Razão social' : 'Nome completo',
    document: company ? 'CNPJ' : 'CPF',
  };
}
