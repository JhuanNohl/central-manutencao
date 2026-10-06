import { describe, expect, it } from 'vitest';
import {
  documentationPending,
  sendRmaDocumentsSchema,
} from './rma-documentation.js';

const FILE = '11111111-1111-4111-8111-111111111111';

describe('pendência de documentação', () => {
  it('chamado sem documento algum fica pendente', () => {
    expect(
      documentationPending({
        closed: false,
        documentCount: 0,
        divergentInvoice: false,
      }),
    ).toBe('sem_documentacao');
  });

  it('nota com divergências fica pendente, mesmo com declaração', () => {
    expect(
      documentationPending({
        closed: false,
        documentCount: 2,
        divergentInvoice: true,
      }),
    ).toBe('nf_com_divergencias');
  });

  it('documentação em ordem ou chamado encerrado não têm pendência', () => {
    expect(
      documentationPending({
        closed: false,
        documentCount: 1,
        divergentInvoice: false,
      }),
    ).toBeNull();
    expect(
      documentationPending({
        closed: true,
        documentCount: 0,
        divergentInvoice: false,
      }),
    ).toBeNull();
  });

  it('o envio exige o XML ou a declaração', () => {
    expect(sendRmaDocumentsSchema.safeParse({}).success).toBe(false);
    expect(
      sendRmaDocumentsSchema.safeParse({ declarationFileId: FILE }).success,
    ).toBe(true);
  });
});
