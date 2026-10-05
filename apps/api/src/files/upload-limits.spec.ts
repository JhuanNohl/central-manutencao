import type { Env } from '../config/env.js';
import { UploadSlots } from './upload-limits.js';

describe('UploadSlots', () => {
  const slots = () => new UploadSlots({ UPLOAD_MAX_CONCURRENT: 2 } as Env);

  it('recusa o envio além do teto e libera a vaga ao terminar', () => {
    const uploads = slots();
    const first = uploads.acquire();
    uploads.acquire();
    expect(() => uploads.acquire()).toThrow('Muitos envios');

    first();
    first(); // liberar duas vezes não abre vaga a mais
    expect(() => uploads.acquire()).not.toThrow();
    expect(() => uploads.acquire()).toThrow('Muitos envios');
  });
});
