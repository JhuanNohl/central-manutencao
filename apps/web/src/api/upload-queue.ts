/**
 * Envios simultâneos por navegador. Um chamado com 200 equipamentos pode
 * somar centenas de fotos: elas entram numa fila em vez de saírem todas de
 * uma vez e esbarrarem no limite de envios da API.
 */
const MAX_PARALLEL_UPLOADS = 3;
/** Espera antes de tentar de novo quando a API pede calma (429). */
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

let active = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < MAX_PARALLEL_UPLOADS) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

/** Resposta 429 da API (sem importar o cliente, que usa esta fila). */
function isThrottled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 429
  );
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Executa o envio na fila; repete só quando a API responde 429. */
export async function queueUpload<T>(send: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await send();
      } catch (error) {
        const delay = RETRY_DELAYS_MS[attempt];
        const throttled = isThrottled(error);
        if (!throttled || delay === undefined) throw error;
        await wait(delay);
      }
    }
  } finally {
    release();
  }
}
