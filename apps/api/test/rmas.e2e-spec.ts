import type { RmaDetail, RmaItemStage, RmaSummary } from '@central/contracts';
import { rmaInvoices, rmaItems, rmas } from '../src/database/schema/index.js';
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

describe('Chamados (visão da equipe)', () => {
  let ctx: TestContext;
  let agentId: string;
  let agent: TestAgent;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    agentId = await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
      name: 'Bruno Agente',
    });
    agent = await signIn(ctx, 'agente@central.local');
  });

  async function createRma(input: {
    customerId: string;
    contactId?: string;
    assigned?: boolean;
    priority?: 'normal' | 'alta' | 'urgente';
    items: {
      model: string;
      serial: string;
      stage: RmaItemStage;
      note?: string;
    }[];
    invoice?: string;
  }): Promise<number> {
    const [rma] = await ctx.db
      .insert(rmas)
      .values({
        customerId: input.customerId,
        requesterContactId: input.contactId ?? null,
        assigneeAccountId: input.assigned ? agentId : null,
        priority: input.priority ?? 'normal',
      })
      .returning({ id: rmas.id, number: rmas.number });
    await ctx.db.insert(rmaItems).values(
      input.items.map((item, index) => ({
        rmaId: rma.id,
        position: index + 1,
        model: item.model,
        serialNumber: item.serial,
        reportedFailure: 'Não liga',
        stage: item.stage,
        receivedAt: ['aguardando_envio', 'em_transporte'].includes(item.stage)
          ? null
          : new Date(),
        internalNote: item.note ?? null,
      })),
    );
    if (input.invoice) {
      await ctx.db.insert(rmaInvoices).values({
        rmaId: rma.id,
        number: input.invoice,
        issuerName: 'Emitente Fictício Ltda.',
        issuerDocument: cnpj('999999990001'),
      });
    }
    return rma.number;
  }

  async function seedTwoRmas() {
    const alfa = await createCustomer(ctx.db, {
      name: 'Alfa Fictícia',
      document: cnpj('101010100001'),
      contactEmail: 'contato@alfa.local',
    });
    const beta = await createCustomer(ctx.db, {
      name: 'Beta Fictícia',
      document: cnpj('202020200001'),
      contactEmail: 'contato@beta.local',
    });
    const first = await createRma({
      customerId: alfa.customerId,
      contactId: alfa.contactId,
      assigned: true,
      priority: 'urgente',
      invoice: '13087',
      items: [
        { model: 'SpeedFace V5L', serial: 'SIM-SF-1', stage: 'em_manutencao' },
        {
          model: 'SpeedFace V5L',
          serial: 'SIM-SF-2',
          stage: 'aguardando_peca',
          note: 'Peça pedida',
        },
        { model: 'Inbio 260', serial: 'SIM-IB-3', stage: 'recebido' },
      ],
    });
    const second = await createRma({
      customerId: beta.customerId,
      items: [{ model: 'VR10', serial: 'SIM-VR-9', stage: 'em_transporte' }],
    });
    return { first, second };
  }

  const listOf = async (query = '') =>
    (await agent.get(`/api/rmas${query}`).expect(200)).body as {
      items: RmaSummary[];
      total: number;
    };

  it('lista com assunto, cliente, responsável, NF e contagem por etapa', async () => {
    const { first } = await seedTwoRmas();
    const page = await listOf();
    expect(page.total).toBe(2);

    const summary = page.items.find((rma) => rma.number === first)!;
    expect(summary).toMatchObject({
      subject: 'Manutenção — 3 equipamentos: 2× SpeedFace V5L, Inbio 260',
      priority: 'urgente',
      customer: { name: 'Alfa Fictícia', document: cnpj('101010100001') },
      requester: { email: 'contato@alfa.local' },
      assignee: { name: 'Bruno Agente' },
      invoice: { number: '13087', issuerName: 'Emitente Fictício Ltda.' },
      itemCount: 3,
      stages: [
        { stage: 'recebido', count: 1 },
        { stage: 'aguardando_peca', count: 1 },
        { stage: 'em_manutencao', count: 1 },
      ],
    });
  });

  it('busca por nº de série, nº do chamado, CNPJ e nº da NF', async () => {
    const { first, second } = await seedTwoRmas();
    const numbers = async (search: string) =>
      (await listOf(`?search=${encodeURIComponent(search)}`)).items.map(
        (r) => r.number,
      );

    expect(await numbers('SIM-VR')).toEqual([second]);
    expect(await numbers(String(first))).toEqual([first]);
    expect(await numbers(cnpj('202020200001'))).toEqual([second]);
    expect(await numbers('13087')).toEqual([first]);
  });

  it('filtra por etapa de qualquer item, prioridade e responsável', async () => {
    const { first, second } = await seedTwoRmas();
    const numbers = async (query: string) =>
      (await listOf(query)).items.map((r) => r.number);

    expect(await numbers('?stage=aguardando_peca')).toEqual([first]);
    expect(await numbers('?stage=em_transporte')).toEqual([second]);
    expect(await numbers('?priority=urgente')).toEqual([first]);
    expect(await numbers('?assignee=meus')).toEqual([first]);
    expect(await numbers('?assignee=sem_responsavel')).toEqual([second]);
  });

  it('detalhe pelo número público traz itens, laudo, nota interna e NF', async () => {
    const { first } = await seedTwoRmas();
    const detail = (await agent.get(`/api/rmas/${first}`).expect(200))
      .body as RmaDetail;

    expect(detail.items.map((item) => item.serialNumber)).toEqual([
      'SIM-SF-1',
      'SIM-SF-2',
      'SIM-IB-3',
    ]);
    expect(detail.items[1]).toMatchObject({
      stage: 'aguardando_peca',
      internalNote: 'Peça pedida',
    });
    expect(detail.items[0].receivedAt).not.toBeNull();
    expect(detail.invoices).toHaveLength(1);
  });

  it('chamado inexistente responde 404', async () => {
    const res = await agent.get('/api/rmas/999999').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('cliente não acessa a visão da equipe', async () => {
    await createCustomer(ctx.db, {
      name: 'Cliente Portal',
      document: cnpj('303030300001'),
      contactEmail: 'portal@cliente.local',
      portal: true,
    });
    const customer = await signIn(ctx, 'portal@cliente.local');
    await customer.get('/api/rmas').expect(403);
  });

  it('agente somente consulta também vê os chamados', async () => {
    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    const viewer = await signIn(ctx, 'consulta@central.local');
    await viewer.get('/api/rmas').expect(200);
  });
});
