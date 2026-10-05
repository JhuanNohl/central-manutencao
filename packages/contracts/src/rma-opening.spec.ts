import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  MAX_ITEMS_PER_RMA,
  openOwnRmaSchema,
  openRmaForCustomerSchema,
} from './rma-opening.js';

const PHOTO_A = '11111111-1111-4111-8111-111111111111';
const PHOTO_B = '22222222-2222-4222-8222-222222222222';
const XML = '33333333-3333-4333-8333-333333333333';
const KEY = '44444444-4444-4444-8444-444444444444';
const TERMS = '1.0';

const item = (photoIds: string[]) => ({
  model: 'VR10',
  serialNumber: 'SIM-001',
  reportedFailure: 'Não liga',
  photoIds,
});

function pathsOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('abertura de RMA', () => {
  it('aceita equipamentos com fotos e um documento', () => {
    const result = openOwnRmaSchema.safeParse({
      openingKey: KEY,
      termsVersion: TERMS,
      items: [item([PHOTO_A]), item([PHOTO_B])],
      invoiceXmlFileId: XML,
    });
    expect(result.success).toBe(true);
    expect(result.data?.items[0].warrantyRequested).toBe(false);
  });

  it('o aceite do termo é opcional no contrato; a API exige quando falta', () => {
    const result = openOwnRmaSchema.safeParse({
      openingKey: KEY,
      items: [item([PHOTO_A])],
      invoiceXmlFileId: XML,
    });
    expect(result.success).toBe(true);
  });

  it('aceita de 1 até 200 equipamentos, cada um com a sua foto', () => {
    const items = (count: number) =>
      Array.from({ length: count }, () => item([randomUUID()]));
    const open = (count: number) =>
      openOwnRmaSchema.safeParse({
        openingKey: KEY,
        items: items(count),
        invoiceXmlFileId: XML,
      });

    expect(MAX_ITEMS_PER_RMA).toBe(200);
    expect(open(3).success).toBe(true);
    expect(open(200).success).toBe(true);
    expect(pathsOf(open(201))).toEqual(['items']);
  });

  it('exige XML ou declaração', () => {
    const result = openOwnRmaSchema.safeParse({
      openingKey: KEY,
      termsVersion: TERMS,
      items: [item([PHOTO_A])],
    });
    expect(pathsOf(result)).toContain('documents');
  });

  it('identifica o equipamento sem foto ou com fotos demais', () => {
    const result = openOwnRmaSchema.safeParse({
      openingKey: KEY,
      termsVersion: TERMS,
      items: [
        item([PHOTO_A]),
        item([]),
        item(
          Array.from(
            { length: 6 },
            (_, i) => `5555555${i}-5555-4555-8555-555555555555`,
          ),
        ),
      ],
      invoiceXmlFileId: XML,
    });
    expect(pathsOf(result)).toEqual(['items.1.photoIds', 'items.2.photoIds']);
  });

  it('não deixa a mesma foto em dois equipamentos', () => {
    const result = openOwnRmaSchema.safeParse({
      openingKey: KEY,
      termsVersion: TERMS,
      items: [item([PHOTO_A]), item([PHOTO_A])],
      declarationFileId: XML,
    });
    expect(pathsOf(result)).toEqual(['items.1.photoIds']);
  });

  it('a equipe informa cliente e solicitante, com as mesmas regras', () => {
    const result = openRmaForCustomerSchema.safeParse({
      openingKey: KEY,
      termsVersion: TERMS,
      items: [item([PHOTO_A])],
    });
    expect(pathsOf(result)).toEqual(
      expect.arrayContaining(['customerId', 'requesterContactId']),
    );
  });
});
