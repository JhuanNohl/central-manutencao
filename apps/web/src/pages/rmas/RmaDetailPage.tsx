import {
  type RmaDetail,
  type RmaItemView,
  FILE_POLICIES,
  itemsToReturn,
  maxSizeLabel,
} from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { get } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { Badge } from '../../components/Badge';
import { Loading, QueryError } from '../../components/feedback';
import { SearchInput } from '../../components/filters';
import { PageHeader } from '../../components/ui';
import { formatDateTime, formatDocument } from '../../lib/format';
import { CancelRmaAction } from './CancelRmaAction';
import { ChangeStageAction } from './ChangeStageAction';
import { ItemMedia } from './ItemMedia';
import { ItemSla } from './ItemSla';
import { ReceiveItemsAction } from './ReceiveItemsAction';
import {
  AssigneeSelect,
  AssignmentNotice,
  PrioritySelect,
} from './RmaAssignment';
import { CancellationNotice } from './CancellationNotice';
import { RmaConversation } from './RmaConversation';
import { RmaDocuments } from './RmaDocuments';
import { RmaMovements } from './RmaMovements';
import { ValidationVideosCard } from './ValidationVideosCard';
import {
  PRIORITY_STYLES,
  STAGE_STYLES,
  WARRANTY_STYLES,
  rmaLabel,
} from './rma-styles';
import { StageSummary } from './StageSummary';
import { RmaInternalNotes } from './RmaInternalNotes';
import { SendDocumentsAction } from './SendDocumentsAction';
import { RmaDescription } from './RmaDescription';

function matches(item: RmaItemView, term: string): boolean {
  const needle = term.trim().toLowerCase();
  return (
    !needle ||
    item.model.toLowerCase().includes(needle) ||
    item.serialNumber.toLowerCase().includes(needle)
  );
}

export function RmaDetailPage() {
  // O parâmetro entra no caminho da API: codificado, não leva a outra rota.
  const number = encodeURIComponent(useParams().number ?? '');
  const { data: account } = useSession();
  const query = useQuery({
    queryKey: ['/rmas', number],
    queryFn: () => get<RmaDetail>(`/rmas/${number}`),
  });

  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} />;
  const rma = query.data;
  const fileUrl = (fileId: string) => `/api/rmas/${rma.number}/files/${fileId}`;
  const open = rma.closedAt === null;
  const canOperate = open && hasPermission(account, 'rma.write');

  return (
    <div className="stack">
      <PageHeader
        title={`Chamado ${rmaLabel(rma.number)}`}
        description={<RmaDescription rma={rma} />}
        actions={
          <>
            {open && hasPermission(account, 'rma.receive') && (
              <ReceiveItemsAction rma={rma} />
            )}
            {canOperate && <ChangeStageAction rma={rma} />}
            {canOperate && <CancelRmaAction rma={rma} />}
            <Link to="/chamados" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              Voltar
            </Link>
          </>
        }
      />
      {rma.cancellation ? (
        <CancellationNotice
          cancellation={rma.cancellation}
          returning={itemsToReturn(rma.items).length > 0}
        />
      ) : (
        <AssignmentNotice rma={rma} />
      )}

      <div className="grid-3">
        <ServiceCard rma={rma} editable={canOperate} />
        <CustomerCard rma={rma} />
        <RmaDocuments
          documents={rma.documents}
          invoices={rma.invoices}
          fileUrl={fileUrl}
          pending={rma.documentationPending}
          action={
            canOperate &&
            rma.documentationPending && (
              <SendDocumentsAction
                path={`/rmas/${rma.number}/documents`}
                pending={rma.documentationPending}
                onSent={() => void query.refetch()}
              />
            )
          }
        />
      </div>

      <ItemsPanel rma={rma} fileUrl={fileUrl} />
      <ValidationVideosCard
        number={rma.number}
        items={rma.items}
        fileUrl={fileUrl}
        canAttach={canOperate}
        description={`Na etapa Comprovação, anexe o vídeo do equipamento funcionando (MP4, MOV ou WebM de até ${maxSizeLabel(FILE_POLICIES.video_validacao)}). Ele é exigido para a devolução e fica visível ao cliente.`}
        emptyMessage="Nenhum equipamento na etapa Comprovação."
      />
      <div className="grid-2">
        <RmaConversation
          path={`/rmas/${rma.number}/messages`}
          title="Conversa com o cliente"
          canSend={hasPermission(account, 'rma.write')}
          highlighted={rma.cancellation !== null}
          hint="O solicitante recebe um aviso por e-mail e lê a mensagem no portal. Não use para notas internas."
          emptyMessage="Nenhuma mensagem trocada com o cliente."
        />
        <RmaMovements
          shipments={rma.shipments}
          receipts={rma.receipts}
          items={rma.items}
        />
      </div>
      <RmaInternalNotes
        number={rma.number}
        canAdd={hasPermission(account, 'rma.write')}
      />
    </div>
  );
}

function ServiceCard({ rma, editable }: { rma: RmaDetail; editable: boolean }) {
  return (
    <section className="card">
      <h2>Atendimento</h2>
      <div className="card-section">
        <StageSummary stages={rma.stages} itemCount={rma.itemCount} />
      </div>
      <dl className="details">
        <dt>Prioridade</dt>
        <dd>
          {editable ? (
            <PrioritySelect rma={rma} />
          ) : (
            <Badge status={PRIORITY_STYLES[rma.priority]} />
          )}
        </dd>
        <dt>Aberto em</dt>
        <dd>{formatDateTime(rma.createdAt)}</dd>
        <dt>Aberto por</dt>
        <dd>{rma.openedBy?.name ?? '—'}</dd>
        <dt>Última atualização</dt>
        <dd>{formatDateTime(rma.updatedAt)}</dd>
        <dt>Responsável</dt>
        <dd>
          {editable ? (
            <AssigneeSelect rma={rma} />
          ) : (
            (rma.assignee?.name ?? '—')
          )}
        </dd>
      </dl>
    </section>
  );
}

function CustomerCard({ rma }: { rma: RmaDetail }) {
  return (
    <section className="card">
      <h2>Cliente</h2>
      <dl className="details">
        <dt>Razão social</dt>
        <dd>
          <Link to={`/clientes/${rma.customer.id}`}>{rma.customer.name}</Link>
        </dd>
        <dt>CNPJ/CPF</dt>
        <dd>{formatDocument(rma.customer.document)}</dd>
        <dt>Solicitante</dt>
        <dd>{rma.requester?.name ?? '—'}</dd>
        <dt>E-mail</dt>
        <dd>{rma.requester?.email ?? '—'}</dd>
        <dt>Telefone</dt>
        <dd>{rma.requester?.phone ?? '—'}</dd>
      </dl>
    </section>
  );
}

function ItemsPanel(props: {
  rma: RmaDetail;
  fileUrl: (fileId: string) => string;
}) {
  const { rma } = props;
  const [search, setSearch] = useState('');
  const items = rma.items.filter((item) => matches(item, search));

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>
          <Wrench size={20} aria-hidden className="inline-icon" />
          Equipamentos ({rma.itemCount})
        </h2>
        <div className="panel-tools">
          <SearchInput
            label="Buscar por modelo ou nº de série"
            value={search}
            onChange={setSearch}
          />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th className="col-wide">Equipamento</th>
              <th className="col-wide">Problema relatado</th>
              <th>Etapa</th>
              <th>Prazo</th>
              <th>Garantia</th>
              <th>Laudo (visível ao cliente)</th>
              <th>
                <span className="with-icon">
                  <Lock size={14} aria-hidden />
                  Nota interna
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.position}</td>
                <td>
                  <span className="strong">{item.model}</span>
                  <span className="sub">S/N {item.serialNumber}</span>
                  <ItemMedia
                    photos={item.photos}
                    video={item.video}
                    model={item.model}
                    fileUrl={props.fileUrl}
                  />
                </td>
                <td>
                  {item.reportedFailure}
                  {item.notes && <span className="sub">{item.notes}</span>}
                </td>
                <td>
                  <Badge status={STAGE_STYLES[item.stage]} />
                  {item.receivedAt && (
                    <span className="sub">
                      Recebido em {formatDateTime(item.receivedAt)}
                    </span>
                  )}
                </td>
                <td>
                  <ItemSla sla={item.sla} />
                </td>
                <td>
                  <Badge status={WARRANTY_STYLES[item.warranty]} />
                </td>
                <td>
                  {item.technicalReport ?? <span className="muted">—</span>}
                </td>
                <td>{item.internalNote ?? <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <div className="empty">Nenhum equipamento corresponde à busca.</div>
        )}
      </div>
      <p className="panel-footnote">
        Garantia, laudo e nota interna, com histórico e aviso ao cliente, entram
        na condução técnica (E2).
      </p>
    </section>
  );
}
