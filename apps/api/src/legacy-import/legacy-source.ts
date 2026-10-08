/**
 * O que a importação lê do sistema anterior (osTicket com as tabelas
 * `ost_zk_*`), já no formato de que ela precisa. A leitura do MariaDB fica em
 * `MysqlLegacySource`; os testes usam uma fonte em memória com o mesmo
 * contrato. Datas chegam como `Date` (UTC), já convertidas do fuso do legado.
 */

export interface LegacyStaff {
  id: number;
  name: string;
  email: string | null;
  passwordHash: string | null;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** Usuário (cliente) com os campos do formulário do usuário e da organização. */
export interface LegacyUser {
  id: number;
  name: string;
  email: string | null;
  /** CPF ou CNPJ como foi digitado (campo `cpf_cnpj`). */
  document: string | null;
  phone: string | null;
  /** Notas internas do formulário do usuário. */
  notes: string | null;
  organization: LegacyOrganization | null;
  /** Hash da conta do portal (`ost_user_account`), quando existe. */
  passwordHash: string | null;
  createdAt: Date;
}

export interface LegacyOrganization {
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
}

export interface LegacyTicket {
  id: number;
  number: string;
  userId: number;
  /** 0 quando ninguém foi atribuído. */
  staffId: number;
  subject: string | null;
  /** Prioridade como o osTicket guarda (id ou nome). */
  priority: string | null;
  /** Campo "Observações" do formulário do ticket. */
  observations: string | null;
  /** Estado da situação do ticket (`closed` quando resolvido). */
  closed: boolean;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegacyEquipment {
  id: number;
  sequence: number;
  model: string;
  serialNumber: string;
  summary: string;
  details: string | null;
  description: string;
  status: string;
  warranty: string;
  technicalReport: string | null;
  internalNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegacyEquipmentEvent {
  id: number;
  equipmentId: number;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  staffId: number;
  createdAt: Date;
}

export interface LegacyEquipmentPhoto {
  id: number;
  equipmentId: number;
  fileId: number;
  slot: number;
}

export interface LegacyTicketFile {
  id: number;
  fileId: number;
  /** `nf` (nota fiscal) ou `dc` (declaração de conteúdo). */
  kind: string;
  errors: string | null;
  invoiceNumber: string | null;
  invoiceIssuerName: string | null;
  createdAt: Date;
}

export interface LegacyShipment {
  carrier: string;
  trackingCode: string;
  confirmedAt: Date | null;
  updatedAt: Date;
}

/** Entrada da conversa: `M` (cliente), `R` (resposta) ou `N` (nota interna). */
export interface LegacyThreadEntry {
  id: number;
  type: string;
  staffId: number;
  userId: number;
  poster: string;
  body: string;
  format: string;
  createdAt: Date;
}

/** Tudo de um ticket, lido de uma vez antes de gravar. */
export interface LegacyTicketDetails {
  equipment: LegacyEquipment[];
  events: LegacyEquipmentEvent[];
  photos: LegacyEquipmentPhoto[];
  files: LegacyTicketFile[];
  shipment: LegacyShipment | null;
  entries: LegacyThreadEntry[];
}

export interface LegacyFileContent {
  name: string;
  content: Buffer;
}

export interface LegacySource {
  staff(): Promise<LegacyStaff[]>;
  users(): Promise<LegacyUser[]>;
  tickets(): Promise<LegacyTicket[]>;
  ticketDetails(ticketId: number): Promise<LegacyTicketDetails>;
  /**
   * Arquivos de nota (`nf`) dos tickets do usuário, do mais recente ao mais
   * antigo: o emitente da nota de remessa é o próprio cliente.
   */
  invoiceFileIds(userId: number): Promise<number[]>;
  /** Conteúdo do arquivo (`ost_file` e seus pedaços); nulo se não estiver no banco. */
  fileContent(fileId: number): Promise<LegacyFileContent | null>;
  close(): Promise<void>;
}
