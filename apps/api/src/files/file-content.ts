import { extname } from 'node:path';
import {
  FILE_NAME_MAX_LENGTH,
  FILE_POLICIES,
  type FileContentType,
  type FilePurpose,
} from '@central/contracts';
import { XMLValidator } from 'fast-xml-parser';

export type FileCheck =
  { ok: true; contentType: FileContentType } | { ok: false; message: string };

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const ascii = (content: Buffer, start: number, end: number) =>
  content.subarray(start, end).toString('latin1');

/** Assinaturas binárias: o tipo vem do conteúdo, nunca do nome ou do navegador. */
const SIGNATURES: Record<
  Exclude<FileContentType, 'application/xml'>,
  (content: Buffer) => boolean
> = {
  'image/jpeg': (c) => c[0] === 0xff && c[1] === 0xd8 && c[2] === 0xff,
  'image/png': (c) => c.subarray(0, 8).equals(PNG_SIGNATURE),
  'image/webp': (c) => ascii(c, 0, 4) === 'RIFF' && ascii(c, 8, 12) === 'WEBP',
  'application/pdf': (c) => ascii(c, 0, 5) === '%PDF-',
};

const MEGABYTE = 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Texto do XML, se for seguro processá-lo: UTF-8 válido, bem formado e sem
 * DTD. Declarações de entidade são recusadas de saída (XXE e expansão).
 */
export function readSafeXml(content: Buffer): string | null {
  let text: string;
  try {
    text = utf8.decode(content).replace(/^﻿/, '');
  } catch {
    return null;
  }
  if (!text.trimStart().startsWith('<')) return null;
  if (/<!(DOCTYPE|ENTITY)/i.test(text)) return null;
  return XMLValidator.validate(text) === true ? text : null;
}

function matchesType(type: FileContentType, content: Buffer): boolean {
  return type === 'application/xml'
    ? readSafeXml(content) !== null
    : SIGNATURES[type](content);
}

/** Confere extensão, tamanho e conteúdo real para a finalidade declarada. */
export function checkFileContent(
  purpose: FilePurpose,
  fileName: string,
  content: Buffer,
): FileCheck {
  const policy = FILE_POLICIES[purpose];
  const accepted = policy.extensions.join(', ');
  if (!policy.extensions.includes(extname(fileName).toLowerCase())) {
    return { ok: false, message: `Envie um arquivo ${accepted}.` };
  }
  if (content.length === 0) {
    return { ok: false, message: 'O arquivo está vazio.' };
  }
  if (content.length > policy.maxBytes) {
    const limit = policy.maxBytes / MEGABYTE;
    return { ok: false, message: `O arquivo passa de ${limit} MB.` };
  }
  const contentType = policy.contentTypes.find((type) =>
    matchesType(type, content),
  );
  if (!contentType) {
    return purpose === 'nota_xml'
      ? { ok: false, message: 'O arquivo não é um XML válido.' }
      : {
          ok: false,
          message: `O conteúdo do arquivo não corresponde a ${accepted}.`,
        };
  }
  return { ok: true, contentType };
}

/** Nome exibido e usado no download: sem caminho nem caracteres de controle. */
export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return clean.slice(0, FILE_NAME_MAX_LENGTH) || 'arquivo';
}
