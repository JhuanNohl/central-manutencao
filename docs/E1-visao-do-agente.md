# E1 — Fatia inicial: visão de chamados do agente

Primeiro incremento da E1: o modelo de RMA e as telas de consulta da equipe. O objetivo é validar como o agente enxerga os chamados antes de fechar o escopo da E1.

> **Atualização (28/09/2026):** a abertura pelo cliente e pela equipe, as fotos, o XML, o envio, o recebimento e o início do prazo entraram na entrega seguinte ([E1-abertura-envio-recebimento.md](E1-abertura-envio-recebimento.md)), que também registra as decisões P01, P03, P04 e P05 citadas abaixo.

## O que foi entregue

| Parte | Onde |
|---|---|
| Tabelas `rmas`, `rma_items` e `rma_invoices` | `apps/api/src/database/schema/rmas.ts`, migration `0002_rmas_itens_notas` |
| Contratos (etapas, prioridade, garantia, visões) | `packages/contracts/src/rmas.ts` |
| API `GET /api/rmas` (busca, filtros, paginação) e `GET /api/rmas/:numero` | `apps/api/src/rmas` (permissão `rma.read`) |
| Tela **Chamados** (lista) e **Chamado #nº** (detalhe) | `apps/web/src/pages/rmas` |
| 5 chamados sintéticos com 1 a 3 equipamentos em etapas diferentes | `npm run db:seed` (acrescenta os chamados se não houver nenhum) |

O número público começa em **#100001**. A equipe (agente, agente somente consulta e administrador) vê todos os chamados. O cliente recebe 403, porque a visão dele entra na E1 com escopo do próprio cadastro.

## Referência visual (sistema atual) → Central de Manutenção

| Campo do sistema atual | Aqui | Observação |
|---|---|---|
| Ticket | Nº público (`#100001`) | Sequencial, único |
| Status (um por chamado) | **Situação por etapa dos itens** | Um chamado com 3 equipamentos mostra cada etapa com a quantidade. O escopo não permite status único (A5) |
| Última atualização | Atualizado em | |
| Assunto | Gerado dos itens: "Manutenção — VR10 (S/N …)" ou "3 equipamentos: 2× …" | Não é digitado |
| De (solicitante) | Cliente + solicitante (nome, e-mail, telefone) | |
| Razão social / CNPJ | Cadastro do cliente (CNPJ/CPF) e emitente da NF | |
| Prioridade | **Normal, Alta ou Urgente** | Novo campo, **fora do Escopo 1.0**, incluído por decisão de 26/09/2026 |
| Atribuído a | Responsável (conta da equipe) | Filtros: meus chamados e sem responsável |
| Nº nota fiscal | Nota fiscal: número, emitente e CNPJ | Hoje preenchida pelo seed. Na E1 virá da validação do XML (P04) |
| Equipamento, S/N, problema relatado | Tabela de equipamentos | Com observação, etapa e data de recebimento |
| Garantia | Não solicitada, Em análise, Coberta, Fora da garantia | Revisões e justificativas na P09 |
| Laudo (visível ao cliente) / Nota interna | Colunas separadas | A nota interna nunca vai para o portal nem para os avisos (RN11) |
| Plano de SLA / data de vencimento | Mostra só o recebimento de cada item | O vencimento depende da **P01** |
| Barra "% concluído" | **Não reproduzida** | O escopo pede contagem por etapa, não pesos do osTicket (A5.2) |
| Adicionar fotos pelo celular | **Não reproduzida** | QR Code está fora da 1.0 (A12). As fotos dependem da **P03** |

## Ainda somente leitura

As ações do detalhe (mudar etapa, garantia, laudo, nota interna, responsável e prioridade) **não** foram implementadas. Cada uma exige transição auditada e aviso ao cliente, e dependem de:

- tabela de transições de etapa (A5.1): o que pode ser pulado, quem corrige e que justificativa é exigida;
- **P06** (cancelamento, item sem reparo, reabertura) e **P09** (garantia e laudo);
- motor de prazo e pausas (**P01**, RN04–RN09).

## Pendências para o escopo da E1

1. **Prioridade:** quem define (só a equipe?), se pode mudar depois e se afeta a ordenação padrão da fila.
2. **P01:** a convenção dos 30 dias, para calcular o vencimento por item.
3. **P03:** o armazenamento de fotos e documentos, para exibir as fotos dos itens.
4. **P04:** as regras do XML e os campos extraídos (número da NF, emitente, CNPJ).
5. Visão do cliente: quais campos do chamado ele vê (sem nota interna; com laudo e etapa por item).
