import {
  openingContentSchema,
  type OpeningContent,
  type OpenOwnRmaRequest,
  type OpenRmaResponse,
} from '@central/contracts';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ApiError, errorMessage } from '../../../api/client';
import { FormAlert } from '../../../components/feedback';
import { TermsAcceptance } from '../../../components/terms/TermsAcceptance';
import { SubmitButton } from '../../../components/ui';
import {
  issuesToErrors,
  zodErrors,
  type FieldErrors,
} from '../../../lib/forms';
import { AddItemsControl } from './AddItemsControl';
import { DocumentsFields } from './DocumentsFields';
import { allSlots, toOpeningInput } from './draft';
import { useInvoiceValidation } from './invoice-validation';
import { ItemFields } from './ItemFields';
import { OpeningReview } from './OpeningReview';
import { useOpeningDraft } from './use-opening-draft';

/** Conteúdo do formulário e, no portal, a versão do termo aceita. */
export type OpeningSubmission = OpeningContent &
  Partial<Pick<OpenOwnRmaRequest, 'termsVersion'>>;

const TERMS_REQUIRED = 'Leia e aceite o termo de garantia';

/**
 * Abertura de RMA com vários equipamentos, fotos e documentação (RF03–RF05).
 * Os dados ficam no rascunho em qualquer erro; a confirmação vem depois de
 * uma revisão. Usado pelo portal e pela equipe (que escolhe o cliente fora).
 */
export function RmaOpeningForm(props: {
  /** Cliente escolhido pela equipe; no portal, vale o próprio cadastro. */
  customerId?: string;
  /** Impede a revisão enquanto falta algo fora do formulário. */
  blockedReason?: string | null;
  /** Cliente e solicitante exibidos na revisão (equipe). */
  customerSummary?: ReactNode;
  /**
   * Portal, quando a conta ainda não aceitou a versão vigente do termo. A
   * equipe nunca aceita pelo cliente.
   */
  requireTerms?: boolean;
  submit: (input: OpeningSubmission) => Promise<OpenRmaResponse>;
  onOpened: (number: number) => void;
}) {
  const [ready, setReady] = useState<OpeningSubmission | null>(null);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  // Os erros são indexados pela posição: deixam de valer ao mudar a lista.
  const clearErrors = useCallback(() => setErrors({}), []);
  const { draft, actions } = useOpeningDraft(clearErrors);

  const xml = draft.invoiceXml;
  const xmlFileId = xml?.status === 'enviado' ? xml.fileId : undefined;
  const invoiceCheck = useInvoiceValidation(
    xmlFileId,
    props.customerId,
    !props.blockedReason,
  );

  const open = useMutation({
    mutationFn: props.submit,
    onSuccess: (result) => props.onOpened(result.number),
    onError: (error) => {
      const issues =
        error instanceof ApiError ? issuesToErrors(error.issues) : {};
      // Termo atualizado depois da leitura: o aceite precisa ser refeito.
      if (issues.termsVersion) setTermsVersion(null);
      setErrors(issues);
      setFormError(errorMessage(error));
      showStage(null);
    },
  });

  function showStage(next: OpeningSubmission | null) {
    setReady(next);
    top.current?.scrollIntoView({ block: 'start' });
  }

  /** O que ainda impede a revisão, fora das regras do contrato. */
  function reviewBlocker(): string | null {
    if (props.blockedReason) return props.blockedReason;
    const slots = allSlots(draft);
    if (slots.some((slot) => slot.status === 'enviando')) {
      return 'Aguarde o fim do envio dos arquivos.';
    }
    if (slots.some((slot) => slot.status === 'erro')) {
      return 'Remova os arquivos que não foram enviados e escolha-os novamente.';
    }
    if (xmlFileId && invoiceCheck.isFetching) {
      return 'Aguarde a validação do XML.';
    }
    if (invoiceCheck.data?.issues.some((issue) => issue.blocking)) {
      return 'O XML tem divergências. Troque o arquivo ou remova-o e anexe a declaração de conteúdo.';
    }
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready) {
      open.mutate(ready);
      return;
    }
    const problem = reviewBlocker();
    const parsed = openingContentSchema.safeParse(toOpeningInput(draft));
    const missingTerms = props.requireTerms && !termsVersion;
    setErrors({
      ...(parsed.success ? {} : zodErrors(parsed.error)),
      ...(missingTerms && { termsVersion: TERMS_REQUIRED }),
    });
    if (problem || !parsed.success || missingTerms) {
      setFormError(problem ?? 'Confira os campos destacados.');
      top.current?.scrollIntoView({ block: 'start' });
      return;
    }
    setFormError(null);
    showStage({
      ...parsed.data,
      ...(props.requireTerms && termsVersion ? { termsVersion } : {}),
    });
  }

  return (
    <div ref={top} className="stack">
      <FormAlert message={formError} />
      <form onSubmit={onSubmit} noValidate>
        {ready ? (
          <>
            <OpeningReview draft={draft} customer={props.customerSummary} />
            {ready.termsVersion && (
              <p className="muted">
                Termo de garantia aceito (versão {ready.termsVersion}).
              </p>
            )}
          </>
        ) : (
          <>
            {draft.items.map((item, index) => (
              <ItemFields
                key={item.key}
                item={item}
                index={index}
                total={draft.items.length}
                errors={errors}
                actions={actions}
              />
            ))}
            {errors.items && <span className="error">{errors.items}</span>}
            <AddItemsControl
              current={draft.items.length}
              onAdd={actions.addItems}
            />
            <DocumentsFields
              invoiceXml={draft.invoiceXml}
              declaration={draft.declaration}
              invoiceCheck={invoiceCheck}
              errors={errors}
              onSelect={actions.selectDocument}
              onRemove={actions.removeDocument}
            />
            {props.requireTerms && (
              <TermsAcceptance
                acceptedVersion={termsVersion}
                error={errors.termsVersion}
                onChange={setTermsVersion}
              />
            )}
          </>
        )}
        <div className="actions">
          <SubmitButton pending={open.isPending}>
            {ready ? 'Confirmar abertura' : 'Revisar solicitação'}
          </SubmitButton>
          {ready && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => showStage(null)}
              disabled={open.isPending}
            >
              <ArrowLeft size={18} aria-hidden />
              Voltar e editar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
