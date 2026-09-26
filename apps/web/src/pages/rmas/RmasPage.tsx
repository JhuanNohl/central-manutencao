import type { RmaItemStage, RmaPriority, RmaSummary } from '@central/contracts';
import { RMA_PRIORITIES, RMA_PRIORITY_LABELS } from '@central/contracts';
import { Link } from 'react-router';
import { Badge } from '../../components/Badge';
import { FilterTabs, SearchInput } from '../../components/filters';
import { PagedResults } from '../../components/PagedResults';
import { PageHeader } from '../../components/ui';
import { formatDateTime, formatDocument } from '../../lib/format';
import { usePagedList } from '../../lib/paged-list';
import { PRIORITY_STYLES, STAGE_STYLES, rmaLabel } from './rma-styles';
import { StageSummary } from './StageSummary';

const PATH = '/rmas';

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
};

export function RmasPage() {
  const list = usePagedList<RmaSummary, Filters>(PATH, {
    search: '',
    stage: '',
    priority: '',
    assignee: '',
  });

  return (
    <div>
      <PageHeader
        title="Chamados"
        description="Solicitações de manutenção e a situação de cada equipamento."
      />
      <section className="panel">
        <div className="panel-header">
          <FilterTabs
            label="Etapa dos equipamentos"
            value={list.filters.stage}
            options={STAGE_TABS}
            onChange={(stage) => list.setFilter({ stage })}
          />
          <div className="panel-tools">
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
          </div>
        </div>

        <PagedResults list={list} emptyMessage="Nenhum chamado encontrado.">
          {(rmas) => (
            <table>
              <thead>
                <tr>
                  <th>Chamado</th>
                  <th>Situação</th>
                  <th>Atualizado em</th>
                  <th className="col-wide">Assunto</th>
                  <th className="col-wide">Cliente</th>
                  <th>Prioridade</th>
                  <th>Responsável</th>
                  <th>Nota fiscal</th>
                </tr>
              </thead>
              <tbody>
                {rmas.map((rma) => (
                  <tr key={rma.number}>
                    <td className="nowrap">
                      <Link to={`/chamados/${rma.number}`} className="strong">
                        {rmaLabel(rma.number)}
                      </Link>
                    </td>
                    <td>
                      <StageSummary
                        stages={rma.stages}
                        itemCount={rma.itemCount}
                      />
                    </td>
                    <td className="nowrap">{formatDateTime(rma.updatedAt)}</td>
                    <td>
                      <Link to={`/chamados/${rma.number}`}>{rma.subject}</Link>
                    </td>
                    <td>
                      {rma.customer.name}
                      <span className="sub nowrap">
                        {formatDocument(rma.customer.document)}
                      </span>
                      {rma.requester && (
                        <span className="sub">{rma.requester.name}</span>
                      )}
                    </td>
                    <td>
                      <Badge status={PRIORITY_STYLES[rma.priority]} />
                    </td>
                    <td className="nowrap">{rma.assignee?.name ?? '—'}</td>
                    <td>
                      {rma.invoice ? (
                        <>
                          {rma.invoice.number}
                          <span className="sub">{rma.invoice.issuerName}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PagedResults>
      </section>
    </div>
  );
}
