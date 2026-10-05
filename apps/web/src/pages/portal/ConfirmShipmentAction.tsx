import {
  SHIPMENT_METHOD_RULES,
  SHIPMENT_METHODS,
  SHIPPABLE_STAGES,
  confirmShipmentSchema,
  type ConfirmShipmentRequest,
  type PortalRmaDetail,
  type ShipmentView,
  SHIPMENT_TEXT_LIMITS,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { useState } from 'react';
import { ApiError, errorMessage, post } from '../../api/client';
import { Field, SelectField } from '../../components/ui';
import {
  issuesToErrors,
  text,
  zodErrors,
  type FieldErrors,
} from '../../lib/forms';
import { ItemsSelectionDialog } from '../rmas/ItemsSelectionDialog';
import { PORTAL_RMAS_PATH } from './MyRmasPage';

/** O cliente informa o envio dos equipamentos; o prazo ainda não começa (RN04). */
export function ConfirmShipmentAction({ rma }: { rma: PortalRmaDetail }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const shippable = rma.items.filter((item) =>
    SHIPPABLE_STAGES.includes(item.stage),
  );
  const ship = useMutation({
    mutationFn: (body: ConfirmShipmentRequest) =>
      post<ShipmentView>(`${PORTAL_RMAS_PATH}/${rma.number}/shipments`, body),
    onSuccess: () => setOpen(false),
    onError: (error) =>
      setErrors(error instanceof ApiError ? issuesToErrors(error.issues) : {}),
    onSettled: () => client.invalidateQueries({ queryKey: [PORTAL_RMAS_PATH] }),
  });

  function confirm(itemIds: string[], data: FormData) {
    const parsed = confirmShipmentSchema.safeParse({
      itemIds,
      method: data.get('method'),
      carrier: text(data, 'carrier'),
      trackingCode: text(data, 'trackingCode'),
    });
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }
    setErrors({});
    ship.mutate(parsed.data);
  }

  if (shippable.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          ship.reset();
          setErrors({});
          setOpen(true);
        }}
      >
        <Truck size={18} aria-hidden />
        Informar envio
      </button>
      <ItemsSelectionDialog
        open={open}
        title="Informar envio à fábrica"
        description="Selecione os equipamentos que você despachou. O prazo de cada um começa quando ele entra em diagnóstico."
        items={shippable}
        confirmLabel="Confirmar envio"
        pending={ship.isPending}
        error={errorMessage(ship.error)}
        onConfirm={confirm}
        onClose={() => setOpen(false)}
      >
        <SelectField
          label="Modalidade"
          name="method"
          options={SHIPMENT_METHODS.map((method) => ({
            value: method,
            label: SHIPMENT_METHOD_RULES[method].label,
          }))}
          errors={errors}
        />
        <Field
          label="Transportadora (obrigatória para transportadora)"
          name="carrier"
          errors={errors}
          maxLength={SHIPMENT_TEXT_LIMITS.carrier}
        />
        <Field
          label="Código de rastreio (opcional)"
          name="trackingCode"
          errors={errors}
          maxLength={SHIPMENT_TEXT_LIMITS.trackingCode}
        />
      </ItemsSelectionDialog>
    </>
  );
}
