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
        <p className="auth-product">Central de Manutenção</p>
        <h1>{props.title}</h1>
        {props.lead && <p className="lead">{props.lead}</p>}
        {props.children}
      </div>
    </main>
  );
}
