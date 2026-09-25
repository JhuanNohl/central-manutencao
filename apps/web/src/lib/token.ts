import { useEffect, useState } from 'react';

/**
 * Token dos links enviados por e-mail. Ele vem no fragmento (`#token=`), que
 * não é enviado ao servidor nem a terceiros via Referer; depois de lido, sai
 * da barra de endereço e do histórico.
 */
export function useEmailLinkToken(): string | null {
  const [token] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get('token'),
  );
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
  }, []);
  return token;
}
