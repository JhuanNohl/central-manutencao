import {
  NEXT_STAGES,
  RMA_ITEM_STAGE_LABELS,
  requiresValidationVideo,
  stageChangePermission,
  teamNextStages,
  type ItemStageChangeView,
  type RmaDetail,
  type RmaItemStage,
  type SessionAccount,
  type StaffReceiptView,
} from '@central/contracts';
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { Alert } from '../../components/feedback';
import { SelectField } from '../../components/ui';
import { ItemsSelectionDialog } from './ItemsSelectionDialog';
import { useRmaOperation } from './rma-operations';
import { STAGE_STYLES } from './rma-styles';
import { RMAS_PATH } from './RmasPage';

type StageItem = RmaDetail['items'][number];

/**
 * Próximos passos que esta conta pode dar com o item. A devolução só aparece
 * com o vídeo de comprovação anexado; a API confere tudo de novo.
 */
function nextStagesOf(
  item: StageItem,
  account: SessionAccount | null | undefined,
): RmaItemStage[] {
  return teamNextStages(item.stage).filter(
    (stage) =>
      hasPermission(account, stageChangePermission(stage)) &&
      (!requiresValidationVideo(stage) || item.validationVideo !== null),
  );
}

/** Por que o item não avança agora, por escrito na lista. */
function blockedReason(item: StageItem): string {
  const next = NEXT_STAGES[item.stage];
  if (next.length === 0) return 'Etapa final.';
  if (next.includes('enviado')) {
    return 'Aguardando o cliente informar o envio no portal.';
  }
  if (next.some(requiresValidationVideo) && !item.validationVideo) {
    return 'Anexe o vídeo de comprovação para liberar a devolução.';
  }
  return 'Sem permissão para o próximo passo.';
}

/** Etapas que servem a todos os itens escolhidos, na ordem do processo. */
function commonStages(options: RmaItemStage[][]): RmaItemStage[] {
  if (options.length === 0) return [];
  return options.reduce((common, stages) =>
    common.filter((stage) => stages.includes(stage)),
  );
}

/**
 * Avanço de um ou mais equipamentos. Primeiro a seleção; depois, só as etapas
 * que vêm logo depois da atual de todos os escolhidos. Itens em etapas
 * diferentes, sem próximo passo em comum, avançam separadamente.
 */
export function ChangeStageAction({ rma }: { rma: RmaDetail }) {
  const { data: account } = useSession();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chosen, setChosen] = useState<RmaItemStage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const advance = useRmaOperation(
    ({
      itemIds,
      stage,
    }: {
      itemIds: string[];
      stage: RmaItemStage;
    }): Promise<StaffReceiptView | ItemStageChangeView> =>
      // O recebimento tem operação própria: registra quem recebeu e quando.
      stage === 'recebido'
        ? post<StaffReceiptView>(`${RMAS_PATH}/${rma.number}/receipts`, {
            itemIds,
          })
        : post<ItemStageChangeView>(
            `${RMAS_PATH}/${rma.number}/stage-changes`,
            { itemIds, stage },
          ),
    () => setOpen(false),
  );

  const optionsById = new Map(
    rma.items.map((item) => [item.id, nextStagesOf(item, account)]),
  );
  if (![...optionsById.values()].some((options) => options.length > 0)) {
    return null;
  }

  const selected = rma.items.filter((item) => selectedIds.includes(item.id));
  const stages = commonStages(
    selected.map((item) => optionsById.get(item.id) ?? []),
  );
  const stage =
    chosen && stages.includes(chosen) ? chosen : (stages[0] ?? null);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          advance.reset();
          setChosen(null);
          setProblem(null);
          setOpen(true);
        }}
      >
        <ListChecks size={18} aria-hidden />
        Avançar etapa
      </button>
      <ItemsSelectionDialog
        open={open}
        title="Avançar etapa"
        description="Escolha os equipamentos: aparecem só as etapas seguintes à atual deles. O avanço não pode ser desfeito, e o solicitante recebe um aviso por e-mail."
        items={rma.items.map((item) => {
          const options = optionsById.get(item.id) ?? [];
          return {
            ...item,
            detail: RMA_ITEM_STAGE_LABELS[item.stage],
            disabledReason:
              options.length === 0 ? blockedReason(item) : undefined,
          };
        })}
        onSelectionChange={(ids) => {
          setSelectedIds(ids);
          setProblem(null);
        }}
        confirmLabel="Salvar etapa"
        pending={advance.isPending}
        error={problem ?? errorMessage(advance.error)}
        onConfirm={(itemIds) => {
          if (!stage) {
            setProblem('Escolha equipamentos com um próximo passo em comum.');
            return;
          }
          advance.mutate({ itemIds, stage });
        }}
        onClose={() => setOpen(false)}
      >
        {selected.length > 0 && stage && (
          <SelectField
            label="Nova etapa"
            name="stage"
            value={stage}
            onChange={(value) => setChosen(value as RmaItemStage)}
            options={stages.map((option) => ({
              value: option,
              label: STAGE_STYLES[option].label,
            }))}
          />
        )}
        {selected.length > 1 && !stage && (
          <Alert tone="warning">
            Os equipamentos escolhidos estão em etapas diferentes, sem um
            próximo passo em comum. Avance cada um separadamente.
          </Alert>
        )}
      </ItemsSelectionDialog>
    </>
  );
}
