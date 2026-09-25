# Central de Manutenção

Aplicação própria para o cliente solicitar manutenção e acompanhar cada equipamento até recebê-lo de volta, e para a equipe registrar o trabalho, controlar prazos e organizar recebimentos e devoluções parciais. O documento de escopo (Escopo 1.0) é mantido fora deste repositório; os identificadores citados no código e em `docs/` (D, RF, CA, P) referem-se a ele.

**Situação:** entrega **E0 — Fundação** concluída. Veja [docs/E0-fundacao.md](docs/E0-fundacao.md).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `apps/api` | API NestJS 12 + Drizzle ORM + PostgreSQL (monólito modular) |
| `apps/web` | SPA React 19 + Vite: portal do cliente e painel da equipe |
| `packages/contracts` | Esquemas Zod, tipos e matriz de permissões compartilhados |
| `docs/` | Decisões e pendências do escopo |
| `docker-compose.yml` | PostgreSQL 18 (porta **5433**) e Mailpit (SMTP 1025, interface 8025) |

## Primeiros passos

Requisitos: Node 24+, Docker.

```bash
npm install
```

```bash
cp .env.example apps/api/.env
```

```bash
npm run infra:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

- Aplicação: http://localhost:5173 (a API é servida pela mesma origem em `/api`)
- E-mails de desenvolvimento: http://localhost:8025
- Contas sintéticas: `admin@central.local`, `agente@central.local`, `consulta@central.local`, `cliente@exemplo.local`, `fabio@pessoa.local`. A senha de todas é `central-dev-2026` (apenas para desenvolvimento).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Contratos (watch), API (watch) e web juntos |
| `npm test` | Testes unitários (contratos e API) |
| `npm run test:e2e` | Testes de integração da API contra o banco `central_test` |
| `npm run typecheck` | Verificação de tipos em todos os pacotes |
| `npm run lint` | Oxlint na API |
| `npm run build` | Build de produção dos três pacotes |
| `npm run db:generate` | Gera migration a partir de mudanças em `apps/api/src/database/schema` |
| `npm run db:migrate` | Aplica as migrations |
| `npm run db:seed -w @central/api -- --reset` | Apaga os dados e recria os sintéticos (nunca em produção) |

## Convenções

- **Contratos primeiro:** toda entrada da API é validada no servidor com o esquema de `packages/contracts`. O frontend usa o mesmo esquema para orientar o preenchimento.
- **Erros:** envelope `{ error: { code, message, issues?, requestId } }`. O `requestId` também aparece no cabeçalho `X-Request-Id` e nos logs.
- **Autorização:** toda rota exige sessão, salvo `@Public()`. As permissões são declaradas com `@RequirePermissions()`. O escopo do cliente (só o próprio cadastro) é verificado no serviço e responde 404, sem confirmar que o registro existe.
- **Auditoria:** ações relevantes chamam `AuditService.record(tx, …)` na mesma transação. O banco recusa `UPDATE` e `DELETE` em `audit_events`.
- **Avisos:** `NotificationsService.enqueue(tx, …)` grava a intenção na mesma transação da operação (outbox). O processador envia com retentativa, e falha de SMTP não desfaz a operação.
- **Datas:** instantes em `timestamptz` (UTC), exibidos no fuso `America/Sao_Paulo`.
- **Migrations:** geradas pelo Drizzle Kit e versionadas em `apps/api/drizzle/`. SQL manual (triggers, restrições especiais) vai em migrations `--custom`.
