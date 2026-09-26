import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * A marca real (logos e favicon da ZKTeco) fica só na máquina de quem tem
 * autorização para usá-la, em `public/brand/` (fora do git). Sem esses
 * arquivos, o build usa a marca neutra versionada em `public/`.
 */
const BRAND_FILES = ['logo-cinza.png', 'logo-branco.png', 'favicon.png'];
const brandDir = fileURLToPath(new URL('./public/brand/', import.meta.url));

export const hasBrandAssets = BRAND_FILES.every((file) =>
  existsSync(brandDir + file),
);

/** Injeta o favicon correspondente à marca disponível. */
export function brandFavicon(): Plugin {
  const href = hasBrandAssets ? '/brand/favicon.png' : '/favicon.svg';
  const type = hasBrandAssets ? 'image/png' : 'image/svg+xml';
  return {
    name: 'central-brand-favicon',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'icon', type, href }, injectTo: 'head' },
      {
        tag: 'link',
        attrs: { rel: 'apple-touch-icon', href },
        injectTo: 'head',
      },
    ],
  };
}
