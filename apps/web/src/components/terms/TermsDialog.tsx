import type { TermBlock, WarrantyTerms } from '@central/contracts';
import { ArrowDown, CircleCheck } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

/** Folga para arredondamentos de zoom: alguns pixels antes do fim já contam. */
const SCROLL_END_TOLERANCE_PX = 8;

function reachedEnd(element: HTMLElement): boolean {
  return (
    element.scrollTop + element.clientHeight >=
    element.scrollHeight - SCROLL_END_TOLERANCE_PX
  );
}

function Block({ block }: { block: TermBlock }) {
  if (block.kind === 'subtitle') return <h4>{block.text}</h4>;
  if (block.kind === 'paragraph') return <p>{block.text}</p>;
  return (
    <ul>
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Texto integral do termo de garantia. O aceite só é liberado depois que a
 * leitura chega ao fim do texto. Montado apenas enquanto está aberto, cada
 * abertura começa do início.
 */
export function TermsDialog(props: {
  terms: WarrantyTerms;
  onAccept: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [readToEnd, setReadToEnd] = useState(false);
  const { terms } = props;

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    // Texto que cabe sem rolar já está lido até o fim.
    if (body.current && reachedEnd(body.current)) setReadToEnd(true);
  }, []);

  return (
    <dialog
      ref={dialog}
      className="card dialog terms-dialog"
      onClose={props.onClose}
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>Termo de garantia</h2>
      <p className="muted">
        {terms.issuer} · Versão {terms.version}
      </p>
      <div
        ref={body}
        className="terms-body"
        tabIndex={0}
        aria-label="Texto integral do termo"
        onScroll={(event) => {
          if (reachedEnd(event.currentTarget)) setReadToEnd(true);
        }}
      >
        <h3>{terms.title}</h3>
        {terms.intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className="terms-highlight">
          <h4>{terms.highlight.title}</h4>
          {terms.highlight.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {terms.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
        {terms.closing && <p className="muted">{terms.closing}</p>}
      </div>
      <p
        className={readToEnd ? 'terms-status read' : 'terms-status'}
        aria-live="polite"
      >
        {readToEnd ? (
          <CircleCheck size={18} aria-hidden />
        ) : (
          <ArrowDown size={18} aria-hidden />
        )}
        {readToEnd
          ? 'Você leu até o final. Clique para confirmar.'
          : 'Role até o final do termo para habilitar o aceite.'}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!readToEnd}
          onClick={props.onAccept}
        >
          Li e concordo com o termo
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={props.onClose}
        >
          Fechar
        </button>
      </div>
    </dialog>
  );
}
