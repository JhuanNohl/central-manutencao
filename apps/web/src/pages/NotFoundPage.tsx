import { Link } from 'react-router';
import { PageHeader } from '../components/ui';

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Página não encontrada" />
      <Link to="/" className="btn btn-secondary">
        Voltar ao início
      </Link>
    </div>
  );
}
