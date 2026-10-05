import type { OpenRmaResponse } from '@central/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { SESSION_KEY, useSession } from '../../auth/session';
import { useWarrantyTerms } from '../../components/terms/warranty-terms';
import { PageHeader } from '../../components/ui';
import { RmaOpeningForm } from '../rmas/opening/RmaOpeningForm';
import { PORTAL_RMAS_PATH } from './MyRmasPage';

/**
 * Abertura pelo cliente, para o próprio cadastro. O termo de garantia só é
 * pedido quando a conta ainda não aceitou a versão vigente.
 */
export function NewRmaPage() {
  const { data: account } = useSession();
  const terms = useWarrantyTerms();
  const client = useQueryClient();
  const navigate = useNavigate();
  const requireTerms = account?.acceptedTermsVersion !== terms.data?.version;

  return (
    <div className="stack">
      <PageHeader
        title="Novo atendimento"
        description={account?.customer?.name}
        actions={
          <Link to="/atendimentos" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            Voltar
          </Link>
        }
      />
      <RmaOpeningForm
        requireTerms={requireTerms}
        submit={(body) => post<OpenRmaResponse>(PORTAL_RMAS_PATH, body)}
        onOpened={(number) => {
          void client.invalidateQueries({ queryKey: [PORTAL_RMAS_PATH] });
          // O aceite feito nesta abertura passa a valer para a conta.
          void client.invalidateQueries({ queryKey: SESSION_KEY });
          void navigate(`/atendimentos/${number}`, { replace: true });
        }}
      />
    </div>
  );
}
