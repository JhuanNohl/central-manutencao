import type { ReactNode } from 'react';
import { BrandLogo } from '../components/BrandLogo';

// Os fundos são ativos da marca: sem eles (repositório público), a tela fica lisa.
const SHELL_CLASS = __BRAND_ASSETS__ ? 'auth-shell branded' : 'auth-shell';

export function AuthLayout(props: {
  title: string;
  lead?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={SHELL_CLASS}>
      <div className={`card auth-card${props.wide ? ' wide' : ''}`}>
        <BrandLogo surface="auto" className="auth-logo" />
        <hgroup className="auth-heading">
          <h1>Central de Manutenção</h1>
          <p>{props.title}</p>
          {props.lead && <p className="lead">{props.lead}</p>}
        </hgroup>
        {props.children}
      </div>
    </main>
  );
}
