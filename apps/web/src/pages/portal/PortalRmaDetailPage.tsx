import type { PortalRmaDetail } from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { get } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { Badge } from '../../components/Badge';
import { Loading, QueryError } from '../../components/feedback';
import { PageHeader } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { CancellationNotice } from '../rmas/CancellationNotice';
import { ItemMedia } from '../rmas/ItemMedia';
import { ItemSla } from '../rmas/ItemSla';
import { RmaConversation } from '../rmas/RmaConversation';
import { RmaDocuments } from '../rmas/RmaDocuments';
import { RmaMovements } from '../rmas/RmaMovements';
import { STAGE_STYLES, WARRANTY_STYLES, rmaLabel } from '../rmas/rma-styles';
import { StageSummary } from '../rmas/StageSummary';
import { ValidationVideosCard } from '../rmas/ValidationVideosCard';
import { ConfirmShipmentAction } from './ConfirmShipmentAction';
import { PORTAL_RMAS_PATH } from './MyRmasPage';

/** Detalhe do atendimento no portal: etapa e prazo de cada equipamento. */
export function PortalRmaDetailPage() {
  // O parâmetro entra no caminho da API: codificado, não leva a outra rota.
  const number = encodeURIComponent(useParams().number ?? '');
  const { data: account } = useSession();
  const query = useQuery({
    queryKey: [PORTAL_RMAS_PATH, number],
    queryFn: () => get<PortalRmaDetail>(`${PORTAL_RMAS_PATH}/${number}`),
  });

  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} />;
  const rma = query.data;
  const fileUrl = (fileId: string) =>
    `/api${PORTAL_RMAS_PATH}/${rma.number}/files/${fileId}`;

  return (
    <div className="stack">
      <PageHeader
        title={`Atendimento ${rmaLabel(rma.number)}`}
        description={rma.subject}
        actions={
          <>
            {!rma.cancellation && hasPermission(account, 'rma.own.ship') && (
              <ConfirmShipmentAction rma={rma} />
            )}
            <Link to="/atendimentos" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              Voltar
            </Link>
          </>
        }
      />
      {rma.cancellation && (
        <CancellationNotice cancellation={rma.cancellation} />
      )}
      <div className="grid-3">
        <section className="card">
          <h2>Atendimento</h2>
          <div className="card-section">
            <StageSummary stages={rma.stages} itemCount={rma.itemCount} />
          </div>
          <dl className="details">
            <dt>Aberto em</dt>
            <dd>{formatDateTime(rma.createdAt)}</dd>
            <dt>Última atualização</dt>
            <dd>{formatDateTime(rma.updatedAt)}</dd>
            <dt>Solicitante</dt>
            <dd>{rma.requester?.name ?? '—'}</dd>
            <dt>Responsável</dt>
            <dd>{rma.assignee?.name ?? 'A definir'}</dd>
          </dl>
        </section>
        <RmaDocuments
          documents={rma.documents}
          invoices={rma.invoices}
          fileUrl={fileUrl}
        />
        <RmaMovements
          shipments={rma.shipments}
          receipts={rma.receipts}
          items={rma.items}
        />
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>
            <Wrench size={20} aria-hidden className="inline-icon" />
            Equipamentos ({rma.itemCount})
          </h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th className="col-wide">Equipamento</th>
                <th className="col-wide">Falha informada</th>
                <th>Etapa</th>
                <th>Prazo</th>
                <th>Garantia</th>
                <th>Laudo</th>
              </tr>
            </thead>
            <tbody>
              {rma.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.position}</td>
                  <td>
                    <span className="strong">{item.model}</span>
                    <span className="sub">S/N {item.serialNumber}</span>
                    <ItemMedia
                      photos={item.photos}
                      video={item.video}
                      model={item.model}
                      fileUrl={fileUrl}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ValidationVideosCard
        number={rma.number}
        items={rma.items}
        fileUrl={fileUrl}
        canAttach={false}
        description="Antes da devolução, a equipe grava cada equipamento funcionando depois do reparo."
        emptyMessage="O vídeo aparece aqui quando o equipamento estiver pronto para voltar."
      />

      <RmaConversation
        path={`${PORTAL_RMAS_PATH}/${rma.number}/messages`}
        title="Conversa com a equipe"
        canSend={hasPermission(account, 'rma.own.message')}
        hint="Use para combinar detalhes do atendimento. A equipe responsável recebe um aviso por e-mail."
        emptyMessage="Nenhuma mensagem ainda. Escreva se precisar combinar algum detalhe com a equipe."
      />
    </div>
  );
}
