# E0 — Fundação: o que foi entregue

Referência: Escopo 1.0, seção A13. Saída verificável esperada: *ambiente reproduzível e acesso controlado; decisões P01/P02/P03 encaminhadas.*

## Entregue

| Item do escopo | Onde | Evidência |
|---|---|---|
| Repositório novo | raiz (npm workspaces) | `apps/api`, `apps/web`, `packages/contracts` |
| Configuração Nest/PostgreSQL | `apps/api/src/config`, `database` | Variáveis validadas na inicialização; `docker-compose.yml` |
| Migrations | `apps/api/drizzle/` | `0000_fundacao_identidade`, `0001_auditoria_imutavel` |
| Identidade | `apps/api/src/identity` | Autocadastro, login, logout, sessão, redefinição de senha, confirmação de e-mail, troca de senha, convites, desativação (RF01) |
| Clientes e contatos (base) | `apps/api/src/customers` | Cadastro PF/PJ com CPF/CNPJ validado (inclusive CNPJ alfanumérico), contatos, convite de contato ao portal (RF02) |
| Autorização | `packages/contracts/src/authorization.ts`, `identity/auth.guard.ts` | Matriz de papéis (P02); guard global; escopo do cliente |
| Histórico | `apps/api/src/audit` | `audit_events` somente inserção (trigger no banco) |
| Intenção de notificação | `apps/api/src/notifications` | Outbox durável, retentativa com espera exponencial, falha identificável e reenvio manual (base de RF12) |
| Dados sintéticos | `apps/api/src/database/scripts/seed.ts` | 3 contas da equipe e 3 clientes fictícios |
| Contratos iniciais | `packages/contracts` | Esquemas e tipos usados pela API e pelo frontend |
| Frontend acompanhando o fluxo | `apps/web` | Telas de acesso, conta, clientes e administração (contas, convites, avisos) |

## Critérios de aceite já exercitados (testes de integração)

`npm run test:e2e` executa 36 cenários contra um PostgreSQL real, entre eles:

- **CA04:** um cliente não consulta o cadastro de outro (404, sem expor conteúdo).
- **CA05:** o agente somente consulta tem alterações recusadas no backend (403).
- **CA16 (parcial):** cadastros simultâneos com o mesmo e-mail geram uma conta, e aceites simultâneos do mesmo convite geram um aceite. Desativações simultâneas não removem o último administrador. Processadores concorrentes não enviam o mesmo aviso duas vezes.
- **CA17 (parcial):** o autocadastro com e-mail já existente não deixa cliente nem contato órfãos.
- **CA18:** a falha de SMTP preserva o convite. O aviso fica "falhou" com o erro registrado e pode ser reenviado.
- Segurança: token de sessão guardado só como hash, cookie `HttpOnly` + `SameSite=Lax`, recusa de origem cruzada (CSRF), mesma resposta para e-mail inexistente e senha errada, tokens de uso único, sessões encerradas ao redefinir a senha ou desativar a conta.

## Decisões encaminhadas

### P03 — Frontend, ORM e armazenamento (decidido em 25/09/2026, exceto armazenamento)

| Tema | Decisão | Motivo |
|---|---|---|
| ORM | **Drizzle** | Próximo do SQL. Permite índices parciais, `CHECK` e SQL manual versionado, que as regras de SLA (pausas sem sobreposição) vão exigir |
| Frontend | **React + Vite (SPA)** | Um só frontend para os dois perfis, servido na mesma origem da API |
| Sessão | **Cookie `HttpOnly` com sessão no PostgreSQL** | Revogação imediata (desativar conta, trocar senha); o token não fica acessível a JavaScript |
| Armazenamento de arquivos | **Em aberto** | Decidir no início da E1, com o primeiro upload (disco local com backup coordenado ou compatível com S3) |

Versões verificadas na criação: Node 24, NestJS 12.1, TypeScript 6.0 (a CLI do Nest exige `~6.0`), Drizzle ORM 0.45, PostgreSQL 18, React 19.3, Vite 8, React Router 8, Zod 4.

### P02 — Política de acesso (proposta implementada; validar com o responsável pela operação)

| Papel | Pode |
|---|---|
| `cliente` | Ver e abrir atendimentos **do próprio cadastro** (`rma.own.*`) |
| `agente_consulta` | Consultar atendimentos e clientes |
| `agente` | Consultar e também alterar atendimentos, registrar recebimento e despacho, cadastrar clientes e contatos, convidar contato ao portal |
| `administrador` | Tudo do agente, mais gerenciar contas, papéis, avisos e parâmetros |

Regras adotadas:

- A equipe entra **somente por convite** (7 dias, uso único). O cliente pode se cadastrar sozinho ou ser convidado como contato de um cliente já cadastrado.
- O autocadastro **não** se vincula a um CPF/CNPJ já existente, porque isso daria acesso a atendimentos de terceiros. Nesse caso, a pessoa pede um convite à equipe.
- A confirmação de e-mail no autocadastro é enviada e registrada, mas **ainda não bloqueia** nada. **Pendente:** decidir se a abertura de RMA exige e-mail confirmado (fechar antes da E1).
- Recebimento (`rma.receive`) e despacho (`rma.dispatch`) já são permissões separadas, para o caso de haver setores distintos (escopo §3.1). Hoje ambas pertencem ao `agente`.
- Ninguém altera o próprio papel nem desativa a própria conta. O sistema mantém ao menos um administrador ativo.

### P01 — Convenção dos 30 dias e fuso (proposta registrada; confirmar antes do motor de SLA na E1)

- Proposta mantida: **720 horas** a partir do instante do recebimento físico, descontadas as pausas válidas.
- Fuso operacional configurado: `OPERATIONAL_TIMEZONE=America/Sao_Paulo`. Todos os instantes são persistidos em `timestamptz` (UTC).
- **Pendente:** confirmação do responsável pela operação. Nada do SLA foi implementado na E0.

## Pendências e riscos conhecidos

- **Armazenamento de arquivos (P03):** decidir no início da E1.
- **Limite de tentativas:** fica em memória por instância da API. Com mais de uma instância, será necessário um armazenamento compartilhado.
- **Entrega de avisos:** é "pelo menos uma vez". Se o SMTP aceitar e a gravação do resultado falhar, o aviso pode ser repetido (o escopo não promete "exatamente uma vez").
- **Links com token:** ficam no registro do aviso até o envio e são removidos logo depois.
- **Imagens de produção:** Dockerfiles e Traefik ainda não foram criados. O ambiente de produção ainda precisa ser confirmado (A7).
- **Testes de navegador:** ainda não existem (Playwright). Entram com o primeiro fluxo da E1.
