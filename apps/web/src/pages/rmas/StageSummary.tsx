import type { RmaStageCount } from '@central/contracts';
import { Badge } from '../../components/Badge';
import { STAGE_STYLES } from './rma-styles';

/**
 * Etapas dos itens de um RMA. O chamado não tem status único (escopo A5):
 * cada etapa aparece com a quantidade de equipamentos nela.
 */
export function StageSummary(props: {
  stages: RmaStageCount[];
  itemCount: number;
}) {
  return (
    <div className="badges">
      {props.stages.map(({ stage, count }) => {
        const style = STAGE_STYLES[stage];
        const label =
          props.itemCount > 1 ? `${style.label} · ${count}` : style.label;
        return <Badge key={stage} status={{ ...style, label }} />;
      })}
    </div>
  );
}
