import type { OpenRmaResponse } from '@central/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { formatDocument } from '../../lib/format';
import { CustomerPicker, type PickedCustomer } from './CustomerPicker';
import { RmaOpeningForm } from './opening/RmaOpeningForm';

/**
 * Abertura pela equipe em nome de um cliente identificado (RN01), com as
 * mesmas regras do portal. Não registra envio: equipamento já presente
 * recebe o recebimento explícito no detalhe do chamado.
 */
export function NewStaffRmaPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<PickedCustomer | null>(null);
  const contact = picked?.customer.contacts.find(
    (current) => current.id === picked.contactId,
  );

  return (
    <div className="stack">
      <PageHeader
        title="Novo chamado"
        actions={
          <Link to="/chamados" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            Voltar
          </Link>
        }
      />
      <CustomerPicker value={picked} onChange={setPicked} />
      <RmaOpeningForm
        customerId={picked?.customer.id}
        blockedReason={
          picked ? null : 'Selecione o cliente e o solicitante do chamado.'
        }
        customerSummary={
          picked && (
            <dl className="details">
              <dt>Cliente</dt>
              <dd>
                {picked.customer.name} ·{' '}
                {formatDocument(picked.customer.document)}
              </dd>
              <dt>Solicitante</dt>
              <dd>
                {contact?.name} · {contact?.email}
              </dd>
            </dl>
          )
        }
        submit={(body) =>
          post<OpenRmaResponse>('/rmas', {
            ...body,
            customerId: picked?.customer.id,
            requesterContactId: picked?.contactId,
          })
        }
        onOpened={(number) => {
          void client.invalidateQueries({ queryKey: ['/rmas'] });
          void navigate(`/chamados/${number}`, { replace: true });
        }}
      />
    </div>
  );
}
