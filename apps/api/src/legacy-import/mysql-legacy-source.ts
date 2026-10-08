import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type {
  LegacyFileContent,
  LegacyOrganization,
  LegacySource,
  LegacyStaff,
  LegacyTicket,
  LegacyTicketDetails,
  LegacyUser,
} from './legacy-source.js';
import { LegacyRows, text } from './mysql-legacy-rows.js';

/** Situações do osTicket que encerram o ticket. */
const CLOSED_STATES = ['closed', 'archived'];
/** Arquivo guardado no próprio banco (`bk = 'D'`), em pedaços. */
const DATABASE_BACKEND = 'D';
/** Campos dos formulários do osTicket que a importação usa. */
const FORM_FIELDS = [
  'cpf_cnpj',
  'phone',
  'notes',
  'website',
  'address',
  'observacoes',
];

type FormValues = Record<string, string>;

/**
 * Leitura do banco do osTicket (MariaDB/MySQL), só com SELECT. Datas chegam
 * como texto e são convertidas com o fuso do legado (`utcOffset`, ex.:
 * "+00:00" ou "-03:00").
 */
export class MysqlLegacySource implements LegacySource {
  private readonly pool: Pool;
  private readonly read: LegacyRows;
  private formValues?: Promise<Map<string, FormValues>>;

  constructor(url: string, utcOffset: string) {
    this.read = new LegacyRows(utcOffset);
    this.pool = mysql.createPool({
      uri: url,
      dateStrings: true,
      charset: 'utf8mb4',
      connectionLimit: 2,
    });
  }

  async staff(): Promise<LegacyStaff[]> {
    const rows = await this.rows(
      `select staff_id, firstname, lastname, username, email, passwd,
              isadmin, isactive, created, lastlogin
         from ost_staff order by staff_id`,
    );
    return rows.map((row) => ({
      id: Number(row.staff_id),
      name:
        [row.firstname, row.lastname].filter(Boolean).join(' ').trim() ||
        String(row.username),
      email: text(row.email),
      passwordHash: text(row.passwd),
      isAdmin: Number(row.isadmin) === 1,
      isActive: Number(row.isactive) === 1,
      createdAt: this.read.requiredDate(row.created),
      lastLoginAt: this.read.date(row.lastlogin),
    }));
  }

  async users(): Promise<LegacyUser[]> {
    const [rows, organizations, forms] = await Promise.all([
      this.rows(
        `select u.id, u.name, u.org_id, u.created, e.address as email, a.passwd
           from ost_user u
           left join ost_user_email e on e.id = u.default_email_id
           left join ost_user_account a on a.user_id = u.id
          order by u.id, a.id`,
      ),
      this.organizations(),
      this.forms(),
    ]);
    const users = new Map<number, LegacyUser>();
    for (const row of rows) {
      const id = Number(row.id);
      if (users.has(id)) continue;
      const form = forms.get(`U:${id}`) ?? {};
      users.set(id, {
        id,
        name: String(row.name),
        email: text(row.email),
        document: form.cpf_cnpj ?? null,
        phone: form.phone ?? null,
        notes: form.notes ?? null,
        organization: organizations.get(Number(row.org_id)) ?? null,
        passwordHash: text(row.passwd),
        createdAt: this.read.requiredDate(row.created),
      });
    }
    return [...users.values()];
  }

  async tickets(): Promise<LegacyTicket[]> {
    const [rows, forms] = await Promise.all([
      this.rows(
        `select t.ticket_id, t.number, t.user_id, t.staff_id, t.closed,
                t.created, t.updated, t.lastupdate, s.state,
                c.subject, c.priority
           from ost_ticket t
           left join ost_ticket_status s on s.id = t.status_id
           left join ost_ticket__cdata c on c.ticket_id = t.ticket_id
          order by t.ticket_id`,
      ),
      this.forms(),
    ]);
    return rows.map((row) => {
      const id = Number(row.ticket_id);
      const updatedAt = this.read.requiredDate(row.updated);
      return {
        id,
        number: text(row.number) ?? String(id),
        userId: Number(row.user_id),
        staffId: Number(row.staff_id),
        subject: text(row.subject),
        priority: text(row.priority),
        observations: forms.get(`T:${id}`)?.observacoes ?? null,
        closed: CLOSED_STATES.includes(String(row.state)),
        closedAt: this.read.date(row.closed),
        createdAt: this.read.requiredDate(row.created),
        updatedAt: this.read.date(row.lastupdate) ?? updatedAt,
      };
    });
  }

  async ticketDetails(ticketId: number): Promise<LegacyTicketDetails> {
    const [equipment, events, photos, files, shipments, entries] =
      await Promise.all([
        this.rows(
          `select id, seq, modelo, numero_serie, resumo, detalhamento, descricao,
                  status, garantia, laudo, nota_interna, created, updated
             from ost_zk_equipment where ticket_id = ?`,
          [ticketId],
        ),
        this.rows(
          `select id, equipment_id, from_status, to_status, note, staff_id, created
             from ost_zk_equipment_event where ticket_id = ?`,
          [ticketId],
        ),
        this.rows(
          `select id, equipment_id, file_id, slot
             from ost_zk_equipment_file where ticket_id = ?`,
          [ticketId],
        ),
        this.rows(
          `select id, file_id, kind, errors, nf_numero, nf_razao_social, created
             from ost_zk_ticket_file where ticket_id = ?`,
          [ticketId],
        ),
        this.rows(
          `select transportadora, rastreio, confirmado, updated
             from ost_zk_ticket_envio where ticket_id = ?`,
          [ticketId],
        ),
        this.rows(
          `select e.id, e.type, e.staff_id, e.user_id, e.poster, e.body,
                  e.format, e.created
             from ost_thread_entry e
             join ost_thread th on th.id = e.thread_id
            where th.object_type = 'T' and th.object_id = ?`,
          [ticketId],
        ),
      ]);
    return {
      equipment: equipment.map((row) => this.read.equipment(row)),
      events: events.map((row) => this.read.event(row)),
      photos: photos.map((row) => this.read.photo(row)),
      files: files.map((row) => this.read.ticketFile(row)),
      shipment: shipments[0] ? this.read.shipment(shipments[0]) : null,
      entries: entries.map((row) => this.read.entry(row)),
    };
  }

  async invoiceFileIds(userId: number): Promise<number[]> {
    const rows = await this.rows(
      `select f.file_id
         from ost_zk_ticket_file f
         join ost_ticket t on t.ticket_id = f.ticket_id
        where t.user_id = ? and f.kind = 'nf'
        order by f.created desc, f.id desc`,
      [userId],
    );
    return rows.map((row) => Number(row.file_id));
  }

  async fileContent(fileId: number): Promise<LegacyFileContent | null> {
    const [file] = await this.rows(
      'select name, bk from ost_file where id = ?',
      [fileId],
    );
    if (!file || file.bk !== DATABASE_BACKEND) return null;
    const chunks = await this.rows(
      'select filedata from ost_file_chunk where file_id = ? order by chunk_id',
      [fileId],
    );
    return {
      name: String(file.name),
      content: Buffer.concat(chunks.map((chunk) => chunk.filedata as Buffer)),
    };
  }

  close(): Promise<void> {
    return this.pool.end();
  }

  private async rows(
    query: string,
    params: unknown[] = [],
  ): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  /** Valores dos formulários de usuários, organizações e tickets, lidos uma vez. */
  private forms(): Promise<Map<string, FormValues>> {
    this.formValues ??= this.rows(
      `select fe.object_type, fe.object_id, f.name, v.value
         from ost_form_entry fe
         join ost_form_entry_values v on v.entry_id = fe.id
         join ost_form_field f on f.id = v.field_id
        where fe.object_type in ('U', 'O', 'T') and f.name in (?)
        order by fe.id`,
      [FORM_FIELDS],
    ).then((rows) => {
      const values = new Map<string, FormValues>();
      for (const row of rows) {
        const value = text(row.value)?.trim();
        if (!value) continue;
        const key = `${String(row.object_type)}:${Number(row.object_id)}`;
        values.set(key, { ...values.get(key), [String(row.name)]: value });
      }
      return values;
    });
    return this.formValues;
  }

  private async organizations(): Promise<Map<number, LegacyOrganization>> {
    const [rows, forms] = await Promise.all([
      this.rows('select id, name from ost_organization'),
      this.forms(),
    ]);
    return new Map(
      rows.map((row) => {
        const id = Number(row.id);
        const form = forms.get(`O:${id}`) ?? {};
        return [
          id,
          {
            name: String(row.name),
            website: form.website ?? null,
            phone: form.phone ?? null,
            address: form.address ?? null,
          },
        ];
      }),
    );
  }
}
