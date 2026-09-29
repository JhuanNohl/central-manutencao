import type { RmaItemStage, RmaPriority, RmaSummary } from '@central/contracts';
import { RMA_PRIORITIES, RMA_PRIORITY_LABELS } from '@central/contracts';
import { Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { hasPermission, useSession } from '../../auth/session';
import { FilterTabs, SearchInput } from '../../components/filters';
import { PagedResults } from '../../components/PagedResults';
import { PageHeader } from '../../components/ui';
import { usePagedList } from '../../lib/paged-list';
import { RmaCard } from './RmaCard';
import { STAGE_STYLES } from './rma-styles';

export const RMAS_PATH = '/rmas';

/** Parâmetro da página que abre a fila já filtrada em "Requer atenção". */
const ATTENTION_PARAM = 'atencao';
export const ATTENTION_QUEUE_PATH = `/chamados?${ATTENTION_PARAM}=1`;

/** Etapas mais consultadas na operação; as demais seguem acessíveis pela busca. */
const STAGE_TABS: { value: RmaItemStage | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  ...(
    [
      'recebido',
      'em_manutencao',
      'aguardando_peca',
      'pronto_para_devolucao',
    ] as const
  ).map((stage) => ({ value: stage, label: STAGE_STYLES[stage].label })),
];

type Filters = {
  search: string;
  stage: RmaItemStage | '';
  priority: RmaPriority | '';
  assignee: '' | 'meus' | 'sem_responsavel';
  attention: '' | 'true';
};

export function NewStaffRmaLink() {
  const { data: account } = useSession();
  if (!hasPermission(account, 'rma.write')) return null;
  return (
    <Link to="/chamados/novo" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      Novo chamado
    </Link>
  );
}

export function RmasPage() {
  const [params] = useSearchParams();
  const list = usePagedList<RmaSummary, Filters>(RMAS_PATH, {
    search: '',
    stage: '',
    priority: '',
    assignee: '',
    attention: params.has(ATTENTION_PARAM) ? 'true' : '',
  });

  return (
    <div className="rma-queue">
      <PageHeader title="Chamados" actions={<NewStaffRmaLink />} />
      <FilterTabs
        label="Etapa dos equipamentos"
        value={list.filters.stage}
        options={STAGE_TABS}
        onChange={(stage) => list.setFilter({ stage })}
      />
      <div className="toolbar">
        <SearchInput
          label="Buscar nº, cliente, série ou NF"
          value={list.filters.search}
          onChange={(search) => list.setFilter({ search })}
        />
        <select
          className="toolbar-select"
          aria-label="Responsável"
          value={list.filters.assignee}
          onChange={(e) =>
            list.setFilter({
              assignee: e.target.value as Filters['assignee'],
            })
          }
        >
          <option value="">Todos os responsáveis</option>
          <option value="meus">Meus chamados</option>
          <option value="sem_responsavel">Sem responsável</option>
        </select>
        <select
          className="toolbar-select"
          aria-label="Prioridade"
          value={list.filters.priority}
          onChange={(e) =>
            list.setFilter({ priority: e.target.value as RmaPriority | '' })
          }
        >
          <option value="">Todas as prioridades</option>
          {RMA_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {RMA_PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
        <label className="check toolbar-check">
          <input
            type="checkbox"
            checked={list.filters.attention === 'true'}
            onChange={(e) =>
              list.setFilter({ attention: e.target.checked ? 'true' : '' })
            }
          />
          Requer atenção
        </label>
      </div>

      <PagedResults
        list={list}
        emptyMessage="Nenhum chamado encontrado."
        bodyClassName="rma-cards"
      >
        {(rmas) => rmas.map((rma) => <RmaCard key={rma.number} rma={rma} />)}
      </PagedResults>
    </div>
  );
}
