import { CAPTCHA_HEADER, type CaptchaConfig } from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from '../api/client';

const CONFIG_PATH = '/captcha/config';
const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      theme: 'auto';
      language: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoading: Promise<void> | undefined;

/** O script da Cloudflare é carregado uma vez, só nas telas que usam o widget. */
function loadTurnstile(): Promise<void> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = undefined;
      reject(new Error('Turnstile indisponível'));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

function CaptchaWidget(props: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { siteKey, onToken } = props;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    loadTurnstile().then(
      () => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          theme: 'auto',
          language: 'pt-br',
          callback: onToken,
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      },
      () => setFailed(true),
    );
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken]);

  return (
    <div className="captcha">
      <div ref={container} />
      {failed && (
        <span className="error">
          Não foi possível carregar a verificação de segurança. Recarregue a
          página.
        </span>
      )}
    </div>
  );
}

/**
 * Verificação anti-robô (Cloudflare Turnstile) das telas públicas. Sem chave
 * configurada na API, não aparece. O token vale uma vez: cada envio leva o
 * token atual e o widget recomeça.
 */
export function useCaptcha() {
  const config = useQuery({
    queryKey: [CONFIG_PATH],
    queryFn: () => get<CaptchaConfig>(CONFIG_PATH),
    staleTime: Infinity,
  });
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const siteKey = config.data?.siteKey ?? null;

  const consumeHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = token
      ? { [CAPTCHA_HEADER]: token }
      : {};
    setToken(null);
    setRound((current) => current + 1);
    return headers;
  }, [token]);

  return {
    widget: siteKey ? (
      <CaptchaWidget key={round} siteKey={siteKey} onToken={setToken} />
    ) : null,
    consumeHeaders,
  };
}
