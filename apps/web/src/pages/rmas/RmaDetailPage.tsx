import type { RmaDetail, RmaItemView } from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { get } from '../../api/client';
import { Badge } from '../../components/Badge';
import { Alert, Loading, QueryError } from '../../components/feedback';
import { SearchInput } from '../../components/filters';
import { PageHeader } from '../../components/ui';
import { formatDateTime, formatDocument } from '../../lib/format';
import {
  PRIORITY_STYLES,
  STAGE_STYLES,
  WARRANTY_STYLES,
  rmaLabel,
} from './rma-styles';
import { StageSummary } from './StageSummary';

function matches(item: RmaItemView, term: string): boolean {
  const needle = term.trim().toLowerCase();
  return (
    !needle ||
    item.model.toLowerCase().includes(needle) ||
    item.serialNumber.toLowerCase().includes(needle)
  );
}

export function RmaDetailPage() {
  const { number = '' } = useParams();
  const query = useQuery({
    queryKey: ['/rmas', number],
    queryFn: () => get<RmaDetail>(`/rmas/${number}`),
  });

  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} />;
  const rma = query.data;

  return (
    <div className="stack">
      <PageHeader
        title={`Chamado ${rmaLabel(rma.number)}`}
        description={rma.subject}
        actions={
          <Link to="/chamados" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            Voltar
          </Link>
        }
      />
      {rma.assignee ? (
        <Alert tone="success">
          Chamado atribuído a <strong>{rma.assignee.name}</strong>.
        </Alert>
      ) : (
        <Alert tone="warning">Chamado sem responsável.</Alert>
      )}

      <div className="grid-3">
        <ServiceCard rma={rma} />
        <CustomerCard rma={rma} />
        <InvoicesCard rma={rma} />
      </div>

      <ItemsPanel rma={rma} />
    </div>
  );
}

function ServiceCard({ rma }: { rma: RmaDetail }) {
  return (
    <section className="card">
      <h2>Atendimento</h2>
      <dl className="details">
        <dt>Situação</dt>
        <dd>
          <StageSummary stages={rma.stages} itemCount={rma.itemCount} />
        </dd>
        <dt>Prioridade</dt>
        <dd>
          <Badge status={PRIORITY_STYLES[rma.priority]} />
        </dd>
        <dt>Aberto em</dt>
        <dd>{formatDateTime(rma.createdAt)}</dd>
        <dt>Aberto por</dt>
        <dd>{rma.openedBy?.name ?? '—'}</dd>
        <dt>Última atualização</dt>
        <dd>{formatDateTime(rma.updatedAt)}</dd>
        <dt>Responsável</dt>
        <dd>{rma.assignee?.name ?? '—'}</dd>
        <dt>Prazo (SLA)</dt>
        <dd className="muted">
          Por equipamento, desde o recebimento. Vencimento após a P01.
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

function InvoicesCard({ rma }: { rma: RmaDetail }) {
  return (
    <section className="card">
      <h2>Nota fiscal</h2>
      {rma.invoices.length === 0 ? (
        <p className="muted">
          Nenhuma nota vinculada. O envio e a validação do XML chegam na E1.
        </p>
      ) : (
        <div className="stack">
          {rma.invoices.map((invoice) => (
            <dl className="details" key={invoice.number}>
              <dt>Número</dt>
              <dd>{invoice.number}</dd>
              <dt>Emitente</dt>
              <dd>{invoice.issuerName}</dd>
              <dt>CNPJ/CPF</dt>
              <dd>{formatDocument(invoice.issuerDocument)}</dd>
            </dl>
          ))}
        </div>
      )}
    </section>
  );
}

function ItemsPanel({ rma }: { rma: RmaDetail }) {
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
        Mudanças de etapa, garantia e laudo, com histórico e aviso ao cliente,
        entram na condução técnica (E2).
      </p>
    </section>
  );
}
