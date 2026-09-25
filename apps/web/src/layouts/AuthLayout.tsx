import type { ReactNode } from 'react';

export function AuthLayout(props: {
  title: string;
  lead?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <div className={`card auth-card${props.wide ? ' wide' : ''}`}>
        <div className="brand">
          <img src="/icon.svg" alt="" />
          Central de Manutenção
        </div>
        <h1>{props.title}</h1>
        {props.lead && <p className="lead">{props.lead}</p>}
        {props.children}
      </div>
    </main>
  );
}
