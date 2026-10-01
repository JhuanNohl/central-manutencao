import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { parseByteRange } from './file-range.js';
import type { FileRow, FilesService } from './files.service.js';

/** Arquivos do chamado não mudam depois de vinculados. */
const CACHE_CONTROL = 'private, max-age=3600';

/** Imagens e vídeos abrem no navegador; XML e PDF vão como anexo. */
function dispositionOf(file: FileRow): string {
  const inline =
    file.contentType.startsWith('image/') ||
    file.contentType.startsWith('video/');
  const kind = inline ? 'inline' : 'attachment';
  return `${kind}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`;
}

/**
 * Download de um arquivo do chamado, lido do armazenamento aos poucos. Com
 * `Range`, responde só o trecho pedido (206), como o reprodutor de vídeo
 * espera. O tipo é o reconhecido no envio, e o `nosniff` do helmet impede o
 * navegador de reinterpretá-lo.
 */
export async function sendFile(
  response: Response,
  files: FilesService,
  file: FileRow,
  rangeHeader: string | undefined,
): Promise<void> {
  const range = parseByteRange(rangeHeader, file.sizeBytes);
  response.set({
    'Accept-Ranges': 'bytes',
    'Cache-Control': CACHE_CONTROL,
    'Content-Type': file.contentType,
    'Content-Disposition': dispositionOf(file),
    'Content-Length': String(
      range ? range.end - range.start + 1 : file.sizeBytes,
    ),
  });
  if (range) {
    response.status(206);
    response.set(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${file.sizeBytes}`,
    );
  }
  try {
    await pipeline(files.open(file, range), response);
  } catch (error) {
    // O reprodutor cancela o trecho ao avançar o vídeo: não é uma falha.
    if (response.destroyed) return;
    throw error;
  }
}
