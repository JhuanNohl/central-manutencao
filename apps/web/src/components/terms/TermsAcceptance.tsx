import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Alert, QueryError } from '../feedback';
import { TermsDialog } from './TermsDialog';
import { useWarrantyTerms } from './warranty-terms';

/**
 * Aceite do termo de garantia, no autocadastro e na abertura quando a conta
 * ainda não aceitou a versão vigente: resumo das principais condições, a
 * informação destacada sobre cobranças e o texto integral, que precisa ser
 * lido até o fim antes da primeira marcação.
 */
export function TermsAcceptance(props: {
  /** Versão aceita; `null` enquanto não houver aceite. */
  acceptedVersion: string | null;
  error?: string;
  onChange: (version: string | null) => void;
}) {
  const terms = useWarrantyTerms();
  const [reading, setReading] = useState(false);
  const [readVersion, setReadVersion] = useState<string | null>(null);

  if (terms.isPending) {
    return <p className="muted">Carregando o termo de garantia…</p>;
  }
  if (terms.isError) return <QueryError error={terms.error} />;

  const current = terms.data;
  const accepted = props.acceptedVersion === current.version;

  function toggle() {
    if (accepted) {
      props.onChange(null);
      return;
    }
    // Sem a leitura completa da versão vigente, a marcação abre o termo.
    if (readVersion === current.version) props.onChange(current.version);
    else setReading(true);
  }

  function accept() {
    setReadVersion(current.version);
    props.onChange(current.version);
    setReading(false);
  }

  return (
    <fieldset className="terms-acceptance">
      <legend>Termo de garantia</legend>
      <p>Confira as principais condições de garantia e assistência técnica:</p>
      <ul className="terms-summary">
        {current.summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Alert tone="warning">
        <strong>{current.highlight.title}</strong>
        {current.highlight.paragraphs.map((paragraph) => (
          <small key={paragraph}>{paragraph}</small>
        ))}
      </Alert>
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setReading(true)}
        >
          <FileText size={18} aria-hidden />
          Ler o termo completo
        </button>
      </div>
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            name="termsAccepted"
            checked={accepted}
            onChange={toggle}
            aria-invalid={props.error ? true : undefined}
          />
          <span>
            Li e concordo com o termo de garantia (versão {current.version}).
          </span>
        </label>
        {props.error ? (
          <span className="error">{props.error}</span>
        ) : (
          !accepted && (
            <span className="hint">Para marcar, leia o termo até o final.</span>
          )
        )}
      </div>
      {reading && (
        <TermsDialog
          terms={current}
          onAccept={accept}
          onClose={() => setReading(false)}
        />
      )}
    </fieldset>
  );
}
