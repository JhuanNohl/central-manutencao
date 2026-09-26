const LOGO_ON_LIGHT = '/brand/logo-cinza.png';
const LOGO_ON_DARK = '/brand/logo-branco.png';
const NEUTRAL_MARK = '/favicon.svg';
const ALT = 'ZKTeco';

/**
 * Logo da marca. `onDark` é para superfícies sempre escuras (barra superior);
 * `auto` acompanha o tema do sistema: cinza no claro, branco no escuro.
 * Sem os arquivos da marca (repositório público), mostra o símbolo neutro.
 */
export function BrandLogo(props: {
  surface: 'auto' | 'onDark';
  className?: string;
}) {
  if (!__BRAND_ASSETS__) {
    return (
      <img
        src={NEUTRAL_MARK}
        alt=""
        className={`brand-mark ${props.className ?? ''}`}
      />
    );
  }
  if (props.surface === 'onDark') {
    return <img src={LOGO_ON_DARK} alt={ALT} className={props.className} />;
  }
  return (
    <picture>
      <source srcSet={LOGO_ON_DARK} media="(prefers-color-scheme: dark)" />
      <img src={LOGO_ON_LIGHT} alt={ALT} className={props.className} />
    </picture>
  );
}
