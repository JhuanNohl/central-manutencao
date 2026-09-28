# E1 — Abertura, envio e recebimento parcial

Segunda entrega da E1: o cliente abre um RMA com equipamentos, fotos e documentação, informa o envio, e a equipe registra o recebimento físico. Cada item recebido inicia o próprio prazo. Complementa a fatia inicial ([E1-visao-do-agente.md](E1-visao-do-agente.md)) e **não** equivale à E2 (condução técnica).

Revisão: branch `feat/e1-abertura-recebimento`, a partir de `3b68d79`.

## O que foi entregue

| Parte | Onde |
|---|---|
| Arquivos privados: envio, tipo lido do conteúdo, limites por finalidade, limpeza de temporários | `apps/api/src/files`, `POST /api/files` |
| Validação do XML da NF-e durante o preenchimento | `apps/api/src/rmas/invoice-xml.ts`, `POST /api/invoice-validations` |
| Abertura pelo cliente e pela equipe, idempotente | `POST /api/portal/rmas` (`rma.own.create`), `POST /api/rmas` (`rma.write`) |
| Consulta do cliente, limitada ao próprio cadastro | `GET /api/portal/rmas`, `GET /api/portal/rmas/:numero` |
| Downloads de fotos e documentos | `GET /api/rmas/:numero/files/:id` e `GET /api/portal/rmas/:numero/files/:id` |
| Envio à fábrica pelo cliente | `POST /api/portal/rmas/:numero/shipments` (`rma.own.ship`) |
| Recebimento parcial pela equipe, com início do prazo | `POST /api/rmas/:numero/receipts` (`rma.receive`) |
| Avisos de abertura e de recebimento | modelos `rma_aberto` e `rma_itens_recebidos` |
| Tabelas `files`, `rma_item_photos`, `rma_documents`, `rma_shipments(_items)`, `rma_receipts(_items)`; `rma_items.sla_hours`; `rmas.opening_key` | migrations `0003` a `0005` |
| Portal: início, Meus atendimentos, Novo atendimento, detalhe com "Informar envio" | `apps/web/src/pages/portal` |
| Painel: Novo chamado, detalhe com fotos, documentos, movimentações, prazo e "Registrar recebimento" | `apps/web/src/pages/rmas` |

## Decisões registradas em 28/09/2026

| Pendência | Decisão |
|---|---|
| **P01** — 30 dias corridos | **720 horas** desde o instante do recebimento físico. O prazo aplicado fica gravado no item (`sla_hours`), e mudar `RMA_SLA_HOURS` só afeta recebimentos novos (CA15). Itens recebidos antes desta entrega receberam 720 h (migration `0004`). |
| **P02** — e-mail confirmado | O cliente precisa ter o **e-mail confirmado para abrir** atendimento (`EMAIL_NOT_VERIFIED`). Contas convidadas já chegam confirmadas. A equipe não tem essa exigência. |
| **P03** — armazenamento | **Disco local** em `FILES_STORAGE_DIR` (padrão `storage/files`, ignorado pelo git), atrás da porta `FILE_STORAGE`. Trocar por um serviço compatível com S3 não muda as regras. **A pasta precisa entrar no backup** junto do banco. |
| **P04** — regras do XML | Base mínima, versão `2026-09-28.1`: NF-e legível (`infNFe`), número da nota, **emitente = CPF/CNPJ do cliente** e **destinatário = `INVOICE_RECIPIENT_DOCUMENT`** (obrigatório em produção). Todas bloqueiam a abertura com aquele XML. CFOP é só lido e exibido; tributos não são avaliados. |
| **P05** — limites (proposta) | De 1 a 5 fotos por equipamento (JPG, PNG ou WebP de até 10 MB); XML de até 1 MB; declaração em PDF, JPG ou PNG de até 10 MB; até 20 equipamentos por RMA. Temporários não vinculados são removidos após 24 h. |
| **PC01** — perfis | A matriz tem quatro papéis: cliente, agente somente consulta, agente e administrador. O agente operacional existe e recebe (`rma.receive`); **nenhuma conta foi alterada**. |
| **PC06** — envio (proposta) | Modalidades: transportadora (exige o nome), Correios e entrega própria. O rastreio é opcional em todas. |

## Regras que a implementação garante

- **Abertura atômica (CA17):** RMA, itens, vínculos de arquivos, histórico e intenção de aviso gravam na mesma transação. Um arquivo que não pode ser vinculado (de outra conta, já usado, expirado ou de outra finalidade) desfaz tudo e aponta o campo, e os arquivos continuam temporários para a nova tentativa.
- **Sem duplicidade (CA16):** a `openingKey` do formulário devolve o RMA já criado, inclusive em requisições paralelas. O recebimento é de uso único no banco (`received_at is null` e índice único por item), então repetir ou concorrer não reinicia o prazo.
- **Tudo ou nada nas movimentações:** se um item selecionado deixou de ser elegível, nada é gravado. O conflito indica a posição de cada item recusado.
- **XML revalidado na abertura (CA03):** vale o arquivo efetivamente vinculado, nunca uma resposta anterior. No formulário, o resultado é indexado pelo arquivo, e a resposta de um XML trocado não aparece para o novo.
- **Arquivos:** o tipo vem do conteúdo (assinatura binária; XML em UTF-8 bem formado e **sem DTD**, contra XXE). O conteúdo é gravado antes do registro e descartado se o banco falhar.
- **Portal:** 404 fora do próprio cadastro (CA04). Os campos são listados explicitamente, então nota interna e contas da equipe não chegam ao cliente (RN11).
- **Prazo:** não começa no envio nem na atribuição de responsável (RN04). O detalhe mostra "Não iniciado" até o recebimento e, depois, o vencimento e o saldo por extenso.

## Critérios exercitados

Os testes de integração (`npm run test:e2e`, 77 cenários contra PostgreSQL real) cobrem:

| Critério | Arquivo |
|---|---|
| S2-02/CA01, S2-06, S2-09/CA16, S2-13/CA17, S2-14/CA18, S2-16, RN01, RN11, P02 | `test/rma-opening.e2e-spec.ts` |
| S2-04/CA02, S2-05/CA03 | `test/rma-opening.e2e-spec.ts`, `test/files.e2e-spec.ts`, `test/invoice-validation.e2e-spec.ts` |
| S2-07/CA04, S2-08/CA05 | todos os arquivos acima e `test/rma-logistics.e2e-spec.ts` |
| S2-10/CA06, S2-11/CA07, S2-12/CA16, S2-15/CA15, S2-20/RN04 | `test/rma-logistics.e2e-spec.ts` |

Também conferidos no navegador, com os dados sintéticos: abertura com dois equipamentos, reordenação com as fotos no item certo (S2-03), troca de XML com divergência por um válido, foto falsa recusada, envio parcial com transportadora, recebimento parcial pelo administrador, ações escondidas do agente somente consulta, uso em 375 px sem rolagem horizontal e troca para o tema claro sem perder o rascunho (S2-17, S2-18).

## Fora desta entrega

- **Regras fiscais completas (P04):** tabela de CFOP e tributos revisada pelo responsável. Até lá, entram em `RULES` (`invoice-xml.ts`) com nova versão.
- **Edição depois da abertura:** substituir documentos ou fotos, corrigir envio ou recebimento, e recebimento com data retroativa. Cada uma exige operação auditada própria (PC06).
- **Envio registrado pela equipe em nome do cliente:** não implementado, por exigir regra de representação.
- **Pausa por falta de peça, retomada e fim do prazo no despacho:** condução técnica e devolução (E2 em diante).
- **Testes de navegador automatizados (Playwright) e testes unitários do frontend:** ainda não existem. A verificação no navegador desta entrega foi manual.
- **Conteúdo sem registro:** se a remoção no disco falhar, o conteúdo fica sem registro e inacessível pela API. Uma varredura periódica ainda não existe.
- O bundle do frontend passa de 500 kB (aviso do Vite). A divisão de código fica para quando for necessária.
