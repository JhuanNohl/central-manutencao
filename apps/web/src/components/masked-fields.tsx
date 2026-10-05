import {
  maskDocument,
  maskPhone,
  type CustomerKind,
  type DocumentKind,
} from '@central/contracts';
import { useState } from 'react';
import type { FieldErrors } from '../lib/forms';
import { Field } from './ui';

interface MaskedFieldProps {
  label: string;
  name: string;
  errors?: FieldErrors;
  errorPath?: string;
  hint?: string;
}

const DOCUMENT_KIND: Record<CustomerKind, DocumentKind> = {
  pessoa_fisica: 'cpf',
  pessoa_juridica: 'cnpj',
};

const DOCUMENT_PLACEHOLDER: Record<DocumentKind, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
};

/** Telefone brasileiro com a máscara `+55 (DD) 9 XXXX-XXXX` enquanto se digita. */
export function PhoneField(props: MaskedFieldProps) {
  const [value, setValue] = useState('');
  return (
    <Field
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+55 (11) 9 1234-5678"
      value={value}
      onChange={(typed) => setValue(maskPhone(typed))}
    />
  );
}

/**
 * CPF ou CNPJ com a pontuação aplicada enquanto se digita. Ao trocar o tipo
 * de cliente, o que já foi digitado é refeito na máscara nova.
 */
export function DocumentField(
  props: MaskedFieldProps & { kind: CustomerKind },
) {
  const { kind, ...field } = props;
  const documentKind = DOCUMENT_KIND[kind];
  const [typed, setTyped] = useState('');
  return (
    <Field
      {...field}
      // O CNPJ alfanumérico aceita letras: só o CPF abre o teclado numérico.
      inputMode={documentKind === 'cpf' ? 'numeric' : 'text'}
      placeholder={DOCUMENT_PLACEHOLDER[documentKind]}
      value={maskDocument(typed, documentKind)}
      onChange={setTyped}
    />
  );
}
