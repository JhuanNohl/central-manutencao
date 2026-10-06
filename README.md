# Central de Manutenção

Aplicação própria para o cliente solicitar manutenção e acompanhar cada equipamento até recebê-lo de volta, e para a equipe registrar o trabalho, controlar prazos e organizar recebimentos e devoluções parciais. O documento de escopo (Escopo 1.0) é mantido fora deste repositório; os identificadores citados no código e em `docs/` (D, RF, CA, P) referem-se a ele.

**Situação:** entrega **E0 — Fundação** concluída ([docs/E0-fundacao.md](docs/E0-fundacao.md)). **E1** em andamento:

- visão de chamados do agente ([docs/E1-visao-do-agente.md](docs/E1-visao-do-agente.md));
- abertura com fotos e XML, envio pelo cliente e recebimento parcial com início do prazo ([docs/E1-abertura-envio-recebimento.md](docs/E1-abertura-envio-recebimento.md));
- perfis, operação do chamado pelo agente e conversa entre cliente e equipe ([docs/E1-perfis-e-conversa.md](docs/E1-perfis-e-conversa.md));
- avisos por e-mail para cliente, setor e agente, e acesso ao portal com senha provisória ([docs/E1-avisos-por-email.md](docs/E1-avisos-por-email.md));
- cadastro de cliente pela equipe, senha forte, máscaras e aceite do termo de garantia ([docs/E1-cadastro-senha-e-termo.md](docs/E1-cadastro-senha-e-termo.md));
- homologação em contêineres ([docs/homologacao-docker.md](docs/homologacao-docker.md)) e revisão de segurança ([docs/seguranca.md](docs/seguranca.md));
- preparação para a migração do sistema anterior ([docs/migracao-sistema-anterior.md](docs/migracao-sistema-anterior.md)).

A condução técnica (etapas, garantia, laudo e pausas) e as devoluções ainda não foram implementadas, então o ciclo completo de manutenção não está pronto para produção.

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
- Arquivos enviados (fotos, XML e declarações) ficam em `apps/api/storage/files`, pasta ignorada pelo git. Em produção, essa pasta entra no backup junto do banco.

### Envio pelo celular em desenvolvimento

O QR Code de "Enviar pelo celular" leva ao `APP_ORIGIN`, e `localhost` não abre no celular. Para testar com um aparelho na mesma rede:

1. Em `apps/api/.env`, use o IP do computador na rede local: `APP_ORIGIN=http://192.168.0.10:5173`.
2. Rode `npm run dev:lan`, que deixa o frontend visível na rede.
3. Abra o sistema no computador por esse mesmo endereço (não por `localhost`), porque a verificação de origem só aceita o `APP_ORIGIN`.

Se o celular não abrir a página, libere o Node no firewall do Windows (rede privada) e confira se a rede não isola os aparelhos entre si, o que é comum em redes corporativas e de visitantes. Ao terminar, volte o `APP_ORIGIN` para `http://localhost:5173`.

### Marca (opcional, só local)

O repositório traz um símbolo neutro. Para exibir a marca real, coloque os três arquivos abaixo em `apps/web/public/brand/` e reinicie o `npm run dev`. A pasta é ignorada pelo git e nunca vai para o repositório.

| Arquivo | Uso |
|---|---|
| `logo-cinza.png` | Logo para fundos claros |
| `logo-branco.png` | Logo para fundos escuros (barra superior e modo escuro) |
| `favicon.png` | Ícone da aba (192×192) |

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Contratos (watch), API (watch) e web juntos |
| `npm run dev:lan` | O mesmo, com o frontend visível na rede local (envio pelo celular) |
| `npm test` | Testes unitários (contratos e API) |
| `npm run test:e2e` | Testes de integração da API contra o banco `central_test` |
| `npm run typecheck` | Verificação de tipos em todos os pacotes |
| `npm run lint` | Oxlint na API |
| `npm run build` | Build de produção dos três pacotes |
| `npm run db:generate` | Gera migration a partir de mudanças em `apps/api/src/database/schema` |
| `npm run db:migrate` | Aplica as migrations |
| `npm run db:seed -w @central/api -- --reset` | Apaga os dados e recria os sintéticos (nunca em produção) |
| `npm run mail:test -w @central/api -- destino@exemplo.com` | Envia um e-mail de teste com a configuração SMTP atual |
| `npm run homolog:up` | Sobe a homologação interna em contêineres, com as regras de produção ([docs/homologacao-docker.md](docs/homologacao-docker.md)) |
| `npm run admin:create -w @central/api -- --email … --name …` | Cria o primeiro administrador de um ambiente novo |

## Convenções

As diretrizes completas de código (Clean Code, SOLID, DRY, commits) estão em [CLAUDE.md](CLAUDE.md). Resumo:

- **Contratos primeiro:** toda entrada da API é validada no servidor com o esquema de `packages/contracts`. O frontend usa o mesmo esquema para orientar o preenchimento.
- **Erros:** envelope `{ error: { code, message, issues?, requestId } }`. O `requestId` também aparece no cabeçalho `X-Request-Id` e nos logs.
- **Autorização:** toda rota exige sessão, salvo `@Public()`. As permissões são declaradas com `@RequirePermissions()`. O escopo do cliente (só o próprio cadastro) é verificado no serviço e responde 404, sem confirmar que o registro existe.
- **Auditoria:** ações relevantes chamam `AuditService.record(tx, …)` na mesma transação. O banco recusa `UPDATE` e `DELETE` em `audit_events`.
- **Avisos:** `NotificationsService.enqueue(tx, …)` grava a intenção na mesma transação da operação (outbox). O processador envia com retentativa, e falha de SMTP não desfaz a operação.
- **Datas:** instantes em `timestamptz` (UTC), exibidos no fuso `America/Sao_Paulo`.
- **Migrations:** geradas pelo Drizzle Kit e versionadas em `apps/api/drizzle/`. SQL manual (triggers, restrições especiais) vai em migrations `--custom`.
