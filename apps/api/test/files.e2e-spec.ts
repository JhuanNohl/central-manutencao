import { MAX_UPLOAD_BYTES, type StoredFileView } from '@central/contracts';
import { eq } from 'drizzle-orm';
import { files } from '../src/database/schema/index.js';
import { FilesService } from '../src/files/files.service.js';
import { JPEG, PDF } from './fixtures.js';
import {
  cnpj,
  createAccount,
  createCustomer,
  createTestApp,
  resetDatabase,
  signIn,
  type TestAgent,
  type TestContext,
} from './support.js';

describe('Envio de arquivos', () => {
  let ctx: TestContext;
  let client: TestAgent;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.storage.contents.clear();
    ctx.storage.failing = false;
    await createCustomer(ctx.db, {
      document: cnpj('111111110001'),
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    });
    client = await signIn(ctx, 'cliente@um.local');
  });

  const upload = (
    agent: TestAgent,
    purpose: string,
    name: string,
    content: Buffer,
  ) =>
    agent
      .post('/api/files')
      .field('purpose', purpose)
      .attach('file', content, name);

  it('guarda o arquivo como temporário do autor, com o tipo lido do conteúdo', async () => {
    const res = await upload(
      client,
      'foto_item',
      'frente ação.jpg',
      JPEG,
    ).expect(201);
    const view = res.body as StoredFileView;
    expect(view).toMatchObject({
      purpose: 'foto_item',
      name: 'frente ação.jpg',
      contentType: 'image/jpeg',
      sizeBytes: JPEG.length,
    });
    const [row] = await ctx.db
      .select()
      .from(files)
      .where(eq(files.id, view.id));
    expect(row.linkedAt).toBeNull();
    expect(ctx.storage.contents.get(row.storageKey)).toEqual(JPEG);
  });

  it('recusa foto falsa e XML malformado, indicando o campo (CA02)', async () => {
    const fake = await upload(client, 'foto_item', 'foto.jpg', PDF).expect(400);
    expect(fake.body.error.issues).toEqual([
      { path: 'file', message: expect.stringContaining('não corresponde') },
    ]);
    const xml = await upload(
      client,
      'nota_xml',
      'nf.xml',
      Buffer.from('<a><b></a>'),
    ).expect(400);
    expect(xml.body.error.issues[0].message).toBe(
      'O arquivo não é um XML válido.',
    );
    expect(ctx.storage.contents.size).toBe(0);
  });

  it('recusa arquivo acima do maior limite antes de gravar', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    const res = await upload(client, 'foto_item', 'grande.jpg', big).expect(
      413,
    );
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(ctx.storage.contents.size).toBe(0);
  });

  it('exige sessão e permissão de abertura (CA05)', async () => {
    await upload(ctx.http(), 'foto_item', 'a.jpg', JPEG).expect(401);
    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    const reader = await signIn(ctx, 'consulta@central.local');
    await upload(reader, 'foto_item', 'a.jpg', JPEG).expect(403);
  });

  it('armazenamento indisponível não deixa registro sem conteúdo (CA17)', async () => {
    ctx.storage.failing = true;
    await upload(client, 'foto_item', 'a.jpg', JPEG).expect(500);
    expect(await ctx.db.select().from(files)).toHaveLength(0);
  });

  it('limpeza remove só temporários vencidos, com o conteúdo', async () => {
    const old = (await upload(client, 'foto_item', 'velha.jpg', JPEG))
      .body as StoredFileView;
    const recent = (await upload(client, 'foto_item', 'nova.jpg', JPEG))
      .body as StoredFileView;
    const linked = (await upload(client, 'declaracao', 'dc.pdf', PDF))
      .body as StoredFileView;
    const longAgo = new Date(Date.now() - 48 * 3_600_000);
    await ctx.db
      .update(files)
      .set({ createdAt: longAgo })
      .where(eq(files.id, old.id));
    await ctx.db
      .update(files)
      .set({ createdAt: longAgo, linkedAt: new Date() })
      .where(eq(files.id, linked.id));

    expect(await ctx.app.get(FilesService).removeExpiredTemporary()).toBe(1);
    const remaining = await ctx.db.select({ id: files.id }).from(files);
    expect(remaining.map((r) => r.id).sort()).toEqual(
      [recent.id, linked.id].sort(),
    );
    expect(ctx.storage.contents.size).toBe(2);
  });
});
