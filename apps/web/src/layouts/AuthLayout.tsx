import type { ReactNode } from 'react';
import { BrandLogo } from '../components/BrandLogo';

export function AuthLayout(props: {
  title: string;
  lead?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="auth-shell">
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
