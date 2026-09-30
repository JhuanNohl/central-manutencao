import {
  RMA_ITEM_STAGES,
  canChangeStage,
  stageChangePermission,
  type ItemStageChangeView,
  type RmaDetail,
  type RmaItemStage,
} from '@central/contracts';
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { SelectField } from '../../components/ui';
import { ItemsSelectionDialog } from './ItemsSelectionDialog';
import { useRmaOperation } from './rma-operations';
import { STAGE_STYLES } from './rma-styles';
import { RMAS_PATH } from './RmasPage';

/**
 * Mudança de etapa de um ou mais equipamentos. A etapa escolhida define quais
 * itens podem ir para ela (`STAGE_TRANSITIONS`); os demais nem aparecem.
 */
export function ChangeStageAction({ rma }: { rma: RmaDetail }) {
  const { data: account } = useSession();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<RmaItemStage | null>(null);
  const change = useRmaOperation(
    (input: { itemIds: string[]; stage: RmaItemStage }) =>
      post<ItemStageChangeView>(
        `${RMAS_PATH}/${rma.number}/stage-changes`,
        input,
      ),
    () => setOpen(false),
  );

  const targets = RMA_ITEM_STAGES.filter(
    (stage) =>
      hasPermission(account, stageChangePermission(stage)) &&
      rma.items.some((item) => canChangeStage(item.stage, stage)),
  );
  const stage = chosen && targets.includes(chosen) ? chosen : targets[0];
  if (!stage) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          change.reset();
          setChosen(null);
          setOpen(true);
        }}
      >
        <ListChecks size={18} aria-hidden />
        Alterar etapa
      </button>
      <ItemsSelectionDialog
        open={open}
        title="Alterar etapa"
        description="Escolha a nova etapa e os equipamentos que vão para ela. O solicitante recebe um aviso por e-mail."
        leading={
          <SelectField
            label="Nova etapa"
            name="stage"
            value={stage}
            onChange={(value) => setChosen(value as RmaItemStage)}
            options={targets.map((target) => ({
              value: target,
              label: STAGE_STYLES[target].label,
            }))}
          />
        }
        items={rma.items.filter((item) => canChangeStage(item.stage, stage))}
        confirmLabel="Salvar etapa"
        pending={change.isPending}
        error={errorMessage(change.error)}
        onConfirm={(itemIds) => change.mutate({ itemIds, stage })}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
