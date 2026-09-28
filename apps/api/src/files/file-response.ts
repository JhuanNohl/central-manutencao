import { StreamableFile } from '@nestjs/common';
import type { FileRow } from './files.service.js';

/**
 * Resposta de download. Imagens abrem no navegador (miniaturas); XML e PDF
 * vão como anexo. O tipo é o reconhecido no envio, e o `nosniff` do helmet
 * impede o navegador de reinterpretá-lo.
 */
export function fileResponse(file: FileRow, content: Buffer): StreamableFile {
  const disposition = file.contentType.startsWith('image/')
    ? 'inline'
    : 'attachment';
  return new StreamableFile(content, {
    type: file.contentType,
    length: content.length,
    disposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  });
}
