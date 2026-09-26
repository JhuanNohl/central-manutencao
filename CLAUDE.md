# Diretrizes de desenvolvimento — Central de Manutenção

Estas regras valem para todo código novo e para qualquer código tocado. O código deve ler como o que já existe: mesmo idioma dos comentários (português), mesmos padrões e mesma densidade de comentários.

## Código limpo

- **Nomes que explicam a intenção.** Funções são verbos (`ensureEmailAvailable`, `toPage`), tipos e valores são substantivos. Nada de abreviações obscuras nem nomes genéricos (`data`, `handle`, `util`).
- **Funções pequenas, com um nível de abstração.** Se um bloco precisa de comentário para dizer *o que* faz, ele vira uma função com esse nome. Comentários explicam o *porquê* (regra de negócio, segurança, concorrência), nunca repetem o código.
- **Sem números mágicos.** Prazos, limites e chaves ficam em constantes nomeadas (`INVITATION_TTL_MS`, `PAGE_SIZE`) ou na configuração validada (`config/env.ts`).
- **Ternários encadeados e `switch` que se repetem viram tabelas** (`Record<Chave, …>`), como `ACTION_COPY` e `STATUS` nas telas.
- **Retorno antecipado** em vez de `if` aninhado. Erros de regra são lançados com `ApiException`, com código estável e mensagem para o usuário.
- **Nada de código morto, `any` ou `console.log`** fora dos scripts de linha de comando.

## SOLID aplicado aqui

- **S — responsabilidade única.** Um serviço por assunto: `AuthService` (entrar, sair, autocadastro), `PasswordsService`, `EmailVerificationService`, `InvitationsService`. Controllers só traduzem HTTP (validar entrada, chamar o serviço, responder). Regra de negócio não fica no controller nem no componente React. Um arquivo que passa de cerca de 300 linhas ou mistura assuntos deve ser dividido.
- **O — aberto para extensão.** Novos modelos de e-mail, papéis ou permissões entram acrescentando uma entrada nas tabelas (`renderNotification`, `ROLE_PERMISSIONS`), sem mudar quem as consome.
- **L — substituição.** Implementações de uma porta respeitam o mesmo contrato. O `MailTransport` falso dos testes e o SMTP real, por exemplo, se comportam igual para quem chama.
- **I — interfaces enxutas.** Dependa só do que usa. Funções recebem o `Executor` (conexão ou transação), não o serviço inteiro. Os tipos de visão (`AccountView`, `InvitationView`) expõem só o necessário ao frontend.
- **D — inversão de dependência.** Recursos externos (SMTP, relógio, armazenamento de arquivos) entram por uma interface com token de injeção (`MAIL_TRANSPORT`), para poderem ser trocados e testados. Evite dependência entre serviços irmãos quando uma função de regra basta (ex.: `ensureEmailAvailable` em `account-rules.ts`, em vez de injetar `AuthService` nos convites).

## DRY, com equilíbrio

- Conhecimento de negócio tem **um lugar só**:
  - validação e mensagens em `packages/contracts`;
  - matriz de permissões em `authorization.ts`;
  - gravação de cliente e contato em `customers/customer-records.ts`;
  - links de e-mail em `EmailLinks`;
  - cookie de sessão em `SessionCookies`.
- Utilitários existentes devem ser reutilizados antes de criar outro:
  - **API:** `pageWindow`/`toPage` (paginação), `containsPattern` (busca), `reference` (referência de LEFT JOIN), `validate()` (entrada), `AuditService.record`, `NotificationsService.enqueue`;
  - **Web:** `usePagedList` + `PagedResults` (listagens), `useSchemaForm` (formulários), `FilterTabs` e `SearchInput` (filtros), `Badge` com `StatusStyle` (situações), `Alert`/`FormAlert`/`QueryError` (mensagens), `CustomerKindField`, `BrandLogo` e os campos de `components/ui.tsx`.

## Design system (web)

- **Tokens de cor, espaçamento e raio** ficam em `apps/web/src/styles.css`, com variantes clara e escura (`prefers-color-scheme`). Componentes usam só os tokens, nunca cores soltas.
- **Verde da marca:** `--brand` (#7DC142) é cor de **fundo** (botão principal, página atual, indicador ativo), sempre com texto `--on-brand`. Texto e ícone verdes sobre fundo claro usam `--brand-strong`, que atinge o contraste AA.
- **Estrutura:** barra superior sempre escura (logo branco); menu lateral com item ativo marcado por borda verde; superfícies planas com borda (`card`, `panel`, `tile`), sem sombra, cantos de 2px.
- **Situações:** use `Badge` com uma tabela `Record<Situação, StatusStyle>` por tela, com tom `success`, `warning`, `danger` ou `neutral` e ícone do `lucide-react`. Crie uma entrada só para uma situação que o sistema realmente tem, e nunca use a cor como único indicador.
- **Filtro de situação** é `FilterTabs`; filtros secundários são `select` ou `SearchInput` no `panel-header`.
- **Logo:** `BrandLogo surface="onDark"` em fundos sempre escuros e `surface="auto"` nos demais, que alterna entre as versões cinza e branca. Os arquivos da marca ZKTeco ficam **só localmente**, em `apps/web/public/brand/` (ignorado pelo git). Sem eles, `brand.config.ts` faz o build usar o símbolo neutro (`public/favicon.svg`). Nunca versionar logos, favicon ou outros ativos da marca neste repositório.
- **Ícones:** somente `lucide-react`, decorativos com `aria-hidden`. Botões só de ícone levam `aria-label`.
- **Regra de três:** duplicação acidental (parecida hoje, com motivos diferentes para mudar) pode ficar. Extraia quando o mesmo conhecimento aparecer pela terceira vez, ou já na segunda se for regra de negócio ou de segurança.
- **KISS e YAGNI:** não crie camadas, genéricos ou abstrações "para o futuro". Uma abstração precisa de pelo menos dois usos reais ou de um motivo de teste. Genéricos que exigem `as unknown as` são sinal de abstração errada.

## Regras de arquitetura do projeto

- **Transações:** operação de negócio e seus efeitos (auditoria, intenção de aviso) gravam na **mesma transação**. Trabalho caro que não precisa do banco (hash de senha, chamadas externas) acontece **antes** de abrir a transação.
- **Concorrência:** unicidade e uso único são garantidos no banco (índices únicos, `UPDATE … WHERE … RETURNING`). Verificações prévias existem só para dar mensagem clara.
- **Autorização:** permissões com `@RequirePermissions()`; escopo do cliente verificado no serviço, com resposta 404 quando o registro é de outro cliente.
- **Banco:** esquema em `apps/api/src/database/schema`; toda mudança gera migration com `npm run db:generate` (SQL manual com `--custom`). Nunca editar uma migration já publicada.
- **Datas:** `timestamptz` em UTC, exibidas no fuso operacional.

## Testes

- Toda regra nova tem teste. Lógica pura ganha teste unitário ao lado (`*.spec.ts`). Fluxos de API ganham teste de integração em `apps/api/test` contra o PostgreSQL real, citando o critério de aceite (CAxx) quando houver.
- Refatoração não muda comportamento: os testes existentes precisam passar sem alteração de expectativa.
- Antes de concluir qualquer entrega: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` e `npm run build`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português, com escopo do pacote quando fizer sentido (`api`, `web`, `contracts`):

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidade nova para o usuário ou para a API |
| `fix` | Correção de defeito |
| `refactor` | Mudança de estrutura sem mudar comportamento |
| `perf` | Melhoria de desempenho |
| `test` | Testes novos ou ajustados |
| `style` | Formatação e estilo de código, sem efeito no comportamento |
| `build` | Dependências, bundlers, Docker, configuração de build |
| `chore` | Manutenção que não entra nos anteriores (scripts, configuração de ferramentas) |
| `docs` | Documentação |

- Um assunto por commit.
- Na linha de assunto, verbo no presente ("adiciona", "extrai", "corrige").
- Autoria: `Jhuan Nohl <206630617+JhuanNohl@users.noreply.github.com>`.

## Publicação

Este repositório é **público** (portfólio pessoal). Não versionar documentos internos da empresa (o `Escopo-*.md` fica só local), dados reais de clientes nem segredos. Quando entrarem regras ou conteúdo sensível da empresa, o projeto migra para o repositório privado da empresa.
