# Central de Manutenção

Aplicação própria para o cliente solicitar manutenção e acompanhar cada equipamento até recebê-lo de volta, e para a equipe registrar o trabalho, controlar prazos e organizar recebimentos e devoluções parciais. O documento de escopo (Escopo 1.0) é mantido fora deste repositório; os identificadores citados no código e em `docs/` (D, RF, CA, P) referem-se a ele.

**Situação:** em produção desde 08/10/2026, no lugar do sistema anterior (osTicket), com os dados dele importados. A documentação segue as etapas da construção ([docs/README.md](docs/README.md)):

| Etapa | Conteúdo |
|---|---|
| [0 — Fundação](docs/0-fundacao/0.1-fundacao.md) | Monorepo, identidade e acesso, clientes, permissões, histórico e avisos (E0) |
| 1 — Abertura do chamado | [Visão do agente](docs/1-abertura-do-chamado/1.1-visao-do-agente.md), [abertura, envio e recebimento](docs/1-abertura-do-chamado/1.2-abertura-envio-e-recebimento.md) e [chamados de até 200 equipamentos](docs/1-abertura-do-chamado/1.3-chamados-grandes.md) |
| 2 — Operação do chamado | [Perfis e conversa](docs/2-operacao-do-chamado/2.1-perfis-e-conversa.md), [fotos, vídeos e envio pelo celular](docs/2-operacao-do-chamado/2.2-fotos-videos-e-celular.md) e [fluxo de etapas](docs/2-operacao-do-chamado/2.3-fluxo-de-etapas.md) |
| 3 — Comunicação e cadastro | [Avisos por e-mail](docs/3-comunicacao-e-cadastro/3.1-avisos-por-email.md) e [cadastro, senha e termo de garantia](docs/3-comunicacao-e-cadastro/3.2-cadastro-senha-e-termo.md) |
| 4 — Segurança | [Revisão de segurança](docs/4-seguranca/4.1-revisao-de-seguranca.md) |
| 5 — Homologação e migração | [Homologação em contêineres](docs/5-homologacao-e-migracao/5.1-homologacao-em-conteineres.md), [migração do sistema anterior](docs/5-homologacao-e-migracao/5.2-migracao-do-sistema-anterior.md) e [deploy e troca no servidor](docs/5-homologacao-e-migracao/5.3-deploy-e-troca-no-servidor.md) |

Ficam para depois a edição da garantia, do laudo e da nota interna com histórico e aviso ao cliente (P09, entrega E2) e a pausa do prazo nas etapas de espera (P01).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `apps/api` | API NestJS 12 + Drizzle ORM + PostgreSQL (monólito modular) |
| `apps/web` | SPA React 19 + Vite: portal do cliente e painel da equipe |
| `packages/contracts` | Esquemas Zod, tipos e matriz de permissões compartilhados |
| `docs/` | Decisões e entregas, por etapa (0 a 5) |
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
| `npm run homolog:up` | Sobe a homologação interna em contêineres, com as regras de produção ([docs/5-homologacao-e-migracao/5.1-homologacao-em-conteineres.md](docs/5-homologacao-e-migracao/5.1-homologacao-em-conteineres.md)) |
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
