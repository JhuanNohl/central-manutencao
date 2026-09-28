import { describe, expect, it } from 'vitest';
import {
  confirmShipmentSchema,
  registerReceiptSchema,
} from './rma-logistics.js';

const ITEM = '11111111-1111-4111-8111-111111111111';

describe('envio e recebimento', () => {
  it('transportadora exige o nome; rastreio é opcional', () => {
    const missing = confirmShipmentSchema.safeParse({
      itemIds: [ITEM],
      method: 'transportadora',
      carrier: '  ',
    });
    expect(missing.error?.issues.map((i) => i.path.join('.'))).toEqual([
      'carrier',
    ]);

    const ownDelivery = confirmShipmentSchema.safeParse({
      itemIds: [ITEM],
      method: 'entrega_propria',
      trackingCode: '',
    });
    expect(ownDelivery.success).toBe(true);
    expect(ownDelivery.data?.trackingCode).toBeUndefined();
  });

  it('recusa seleção vazia ou com item repetido', () => {
    expect(registerReceiptSchema.safeParse({ itemIds: [] }).success).toBe(
      false,
    );
    expect(
      registerReceiptSchema.safeParse({ itemIds: [ITEM, ITEM] }).success,
    ).toBe(false);
  });
});
