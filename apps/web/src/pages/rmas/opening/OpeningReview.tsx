import type { ReactNode } from 'react';
import type { OpeningDraft } from './draft';

/** Resumo do que será registrado, antes da confirmação (5.2). */
export function OpeningReview(props: {
  draft: OpeningDraft;
  /** Cliente e solicitante, na abertura pela equipe. */
  customer?: ReactNode;
}) {
  const { draft } = props;
  const documents = [
    draft.invoiceXml && `XML da nota: ${draft.invoiceXml.name}`,
    draft.declaration && `Declaração: ${draft.declaration.name}`,
  ].filter(Boolean);
  return (
    <section className="card">
      <h2>Revisão</h2>
      <div className="stack">
        {props.customer}
        <div>
          <h3 className="review-title">
            {draft.items.length === 1
              ? '1 equipamento'
              : `${draft.items.length} equipamentos`}
          </h3>
          <ol className="review-list">
            {draft.items.map((item) => (
              <li key={item.key}>
                <span className="strong">
                  {item.model} · S/N {item.serialNumber}
                </span>
                <span className="sub">{item.reportedFailure}</span>
                {item.notes && <span className="sub">{item.notes}</span>}
                <span className="sub">
                  {item.photos.length === 1
                    ? '1 foto'
                    : `${item.photos.length} fotos`}
                  {item.video && ' · 1 vídeo'}
                  {item.warrantyRequested &&
                    ' · análise de garantia solicitada'}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="review-title">Documentação</h3>
          <ul className="review-list">
            {documents.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <p className="hint">
          {props.customer
            ? // Pela equipe, o equipamento já está na fábrica (fluxo de 01/10/2026).
              'Os equipamentos já entram em diagnóstico, com o recebimento registrado agora e o prazo de cada um começando junto.'
            : 'Depois de abrir, informe o envio dos equipamentos no detalhe do atendimento. O prazo de cada um começa quando ele entra em diagnóstico.'}
        </p>
      </div>
    </section>
  );
}
