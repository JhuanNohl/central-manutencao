/** O que a importação conta, por assunto. */
export const IMPORT_SUBJECTS = [
  'equipe',
  'clientes',
  'contatos',
  'chamados',
  'equipamentos',
  'fotos',
  'documentos',
  'mensagens',
  'notas internas',
  'envios',
  'histórico',
] as const;
export type ImportSubject = (typeof IMPORT_SUBJECTS)[number];

/**
 * `ignorado`: não entrou por decisão ou regra (ex.: cadastro sem CPF/CNPJ);
 * `aviso`: entrou com alguma adaptação; `falha`: erro inesperado, o registro
 * todo foi desfeito e pode ser importado de novo depois da correção.
 */
export type ImportIssueLevel = 'ignorado' | 'aviso' | 'falha';

export interface ImportIssue {
  level: ImportIssueLevel;
  /** Origem no legado, ex.: "ost_user 12" ou "ticket 000123". */
  source: string;
  message: string;
}

/**
 * Resultado da importação. Cita só ids e números do legado, sem nomes nem
 * e-mails: o relatório pode ser lido e guardado sem expor dados de clientes.
 */
export class ImportReport {
  readonly imported = new Map<ImportSubject, number>();
  /** Registros que uma execução anterior já tinha trazido. */
  readonly alreadyImported = new Map<ImportSubject, number>();
  readonly issues: ImportIssue[] = [];

  constructor(readonly dryRun: boolean) {}

  count(subject: ImportSubject, amount = 1): void {
    this.imported.set(subject, (this.imported.get(subject) ?? 0) + amount);
  }

  countExisting(subject: ImportSubject): void {
    this.alreadyImported.set(
      subject,
      (this.alreadyImported.get(subject) ?? 0) + 1,
    );
  }

  skip(source: string, message: string): void {
    this.issues.push({ level: 'ignorado', source, message });
  }

  warn(source: string, message: string): void {
    this.issues.push({ level: 'aviso', source, message });
  }

  fail(source: string, message: string): void {
    this.issues.push({ level: 'falha', source, message });
  }

  get failed(): boolean {
    return this.issues.some((issue) => issue.level === 'falha');
  }

  /** Resumo para o terminal. */
  summary(): string {
    const lines = [
      this.dryRun
        ? 'Ensaio (--dry-run): nada foi gravado.'
        : 'Importação concluída.',
      '',
      ...IMPORT_SUBJECTS.map((subject) => {
        const existing = this.alreadyImported.get(subject);
        const suffix = existing ? ` (+${existing} já importados antes)` : '';
        return `  ${subject}: ${this.imported.get(subject) ?? 0}${suffix}`;
      }),
    ];
    if (this.issues.length > 0) {
      lines.push('', 'Ocorrências:');
      lines.push(
        ...this.issues.map(
          (issue) => `  [${issue.level}] ${issue.source}: ${issue.message}`,
        ),
      );
    }
    return lines.join('\n');
  }

  toJSON() {
    return {
      dryRun: this.dryRun,
      imported: Object.fromEntries(this.imported),
      alreadyImported: Object.fromEntries(this.alreadyImported),
      issues: this.issues,
    };
  }
}
