import type { OpenRmaResponse } from '@central/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/ui';
import { EmailVerificationNotice } from '../AccountPage';
import { RmaOpeningForm } from '../rmas/opening/RmaOpeningForm';
import { PORTAL_RMAS_PATH } from './MyRmasPage';

/** Abertura pelo cliente, para o próprio cadastro. Exige e-mail confirmado (P02). */
export function NewRmaPage() {
  const { data: account } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();

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
      {account?.emailVerified ? (
        <RmaOpeningForm
          submit={(body) => post<OpenRmaResponse>(PORTAL_RMAS_PATH, body)}
          onOpened={(number) => {
            void client.invalidateQueries({ queryKey: [PORTAL_RMAS_PATH] });
            void navigate(`/atendimentos/${number}`, { replace: true });
          }}
        />
      ) : (
        <>
          <p className="muted">
            Para abrir atendimentos, confirme primeiro o seu e-mail. Assim os
            avisos de cada etapa chegam a você.
          </p>
          <EmailVerificationNotice />
        </>
      )}
    </div>
  );
}
