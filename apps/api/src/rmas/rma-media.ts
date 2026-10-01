import type { StoredFileView, ValidationVideoView } from '@central/contracts';
import { and, asc, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { reference } from '../common/mapping.js';
import type { Executor } from '../database/database.types.js';
import {
  accounts,
  files,
  rmaDocuments,
  rmaItemPhotos,
  rmaItems,
  rmaValidationVideos,
} from '../database/schema/index.js';
import { toFileView, type FileRow } from '../files/files.service.js';

/**
 * Fotos e vídeos dos equipamentos: as fotos e o vídeo da falha vêm da
 * abertura; o vídeo de validação, da equipe antes do despacho.
 */
export interface ItemMedia {
  photos: StoredFileView[];
  video: StoredFileView | null;
  validationVideo: ValidationVideoView | null;
}

type MediaItem = { id: string; videoFileId: string | null };

async function photosOf(db: Executor, itemIds: string[]) {
  const rows = await db
    .select({ itemId: rmaItemPhotos.itemId, file: files })
    .from(rmaItemPhotos)
    .innerJoin(files, eq(files.id, rmaItemPhotos.fileId))
    .where(inArray(rmaItemPhotos.itemId, itemIds))
    .orderBy(asc(rmaItemPhotos.position));
  const photos = new Map<string, StoredFileView[]>();
  for (const { itemId, file } of rows) {
    photos.set(itemId, [...(photos.get(itemId) ?? []), toFileView(file)]);
  }
  return photos;
}

async function filesById(db: Executor, fileIds: string[]) {
  if (fileIds.length === 0) return new Map<string, StoredFileView>();
  const rows = await db.select().from(files).where(inArray(files.id, fileIds));
  return new Map(rows.map((row) => [row.id, toFileView(row)]));
}

async function validationVideosOf(db: Executor, itemIds: string[]) {
  const rows = await db
    .select({ video: rmaValidationVideos, file: files, byName: accounts.name })
    .from(rmaValidationVideos)
    .innerJoin(files, eq(files.id, rmaValidationVideos.fileId))
    .leftJoin(
      accounts,
      eq(accounts.id, rmaValidationVideos.recordedByAccountId),
    )
    .where(inArray(rmaValidationVideos.itemId, itemIds));
  return new Map(
    rows.map(({ video, file, byName }) => [
      video.itemId,
      toValidationVideo(video, file, byName),
    ]),
  );
}

export function toValidationVideo(
  video: typeof rmaValidationVideos.$inferSelect,
  file: FileRow,
  byName: string | null,
): ValidationVideoView {
  return {
    file: toFileView(file),
    recordedAt: video.recordedAt.toISOString(),
    recordedBy: reference(video.recordedByAccountId, byName),
  };
}

/** Mídias de cada item, pelo id do item. */
export async function mediaOf(
  db: Executor,
  items: MediaItem[],
): Promise<Map<string, ItemMedia>> {
  if (items.length === 0) return new Map();
  const itemIds = items.map((item) => item.id);
  const [photos, videos, validations] = await Promise.all([
    photosOf(db, itemIds),
    filesById(
      db,
      items.flatMap((item) => (item.videoFileId ? [item.videoFileId] : [])),
    ),
    validationVideosOf(db, itemIds),
  ]);
  return new Map(
    items.map((item) => [
      item.id,
      {
        photos: photos.get(item.id) ?? [],
        video: item.videoFileId ? (videos.get(item.videoFileId) ?? null) : null,
        validationVideo: validations.get(item.id) ?? null,
      },
    ]),
  );
}

/** Arquivo vinculado ao RMA: foto ou vídeo de um item, ou documento. */
export async function findRmaFile(
  db: Executor,
  rmaId: string,
  fileId: string,
): Promise<FileRow | undefined> {
  const isItemPhoto = exists(
    db
      .select({ one: sql`1` })
      .from(rmaItemPhotos)
      .innerJoin(rmaItems, eq(rmaItems.id, rmaItemPhotos.itemId))
      .where(
        and(eq(rmaItemPhotos.fileId, files.id), eq(rmaItems.rmaId, rmaId)),
      ),
  );
  const isFailureVideo = exists(
    db
      .select({ one: sql`1` })
      .from(rmaItems)
      .where(
        and(eq(rmaItems.videoFileId, files.id), eq(rmaItems.rmaId, rmaId)),
      ),
  );
  const isValidationVideo = exists(
    db
      .select({ one: sql`1` })
      .from(rmaValidationVideos)
      .innerJoin(rmaItems, eq(rmaItems.id, rmaValidationVideos.itemId))
      .where(
        and(
          eq(rmaValidationVideos.fileId, files.id),
          eq(rmaItems.rmaId, rmaId),
        ),
      ),
  );
  const isDocument = exists(
    db
      .select({ one: sql`1` })
      .from(rmaDocuments)
      .where(
        and(eq(rmaDocuments.fileId, files.id), eq(rmaDocuments.rmaId, rmaId)),
      ),
  );
  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        or(isItemPhoto, isFailureVideo, isValidationVideo, isDocument),
      ),
    );
  return file;
}
