# E1 — Perfis, operação do chamado e conversa

Terceira entrega da E1: separa o que cada perfil faz no chamado, dá ao agente as ações de operação (responsável, prioridade, etapa e cancelamento) e acrescenta a conversa entre o cliente e a equipe. Complementa a abertura, o envio e o recebimento ([E1-abertura-envio-recebimento.md](E1-abertura-envio-recebimento.md)).

## Perfis

| Perfil                        | O que faz                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Administrador**             | Tudo o que o agente faz. Além disso, gerencia contas (papel, desativação e reativação de agentes e clientes), convida a equipe e acompanha os avisos por e-mail.                                                              |
| **Agente**                    | Vê **todos** os chamados, não só os próprios. Abre chamado em nome do cliente, registra o recebimento, assume, transfere ou libera o chamado, muda a prioridade e a etapa dos equipamentos, cancela e conversa com o cliente. |
| **Agente (somente consulta)** | Vê chamados, clientes e a conversa, sem alterar nada.                                                                                                                                                                         |
| **Cliente**                   | Abre atendimentos, informa o envio e acompanha cada equipamento em **Meus equipamentos**. Conversa com a equipe pelo detalhe do atendimento.                                                                                  |

A permissão nova é `rma.own.message` (cliente). As ações da equipe usam `rma.write`, e o despacho (em devolução, recebido pelo cliente) exige também `rma.dispatch`.

## Decisões registradas em 30/09/2026

| Assunto                             | Decisão                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Excluir" chamado                   | **Cancelar com motivo**, só enquanto nenhum equipamento chegou à fábrica. Nada é apagado (NF-e e histórico continuam), o motivo vai para o histórico e para o aviso ao cliente, e o chamado deixa de aceitar envio, recebimento e mudanças. A conversa continua aberta.                                                                                 |
| "Excluir" conta                     | **Desativar** (já existia): encerra as sessões e bloqueia o acesso, mantendo o nome nos chamados e no histórico.                                                                                                                                                                                                                                        |
| Etapas (proposta até a tabela A5.1) | Depois do recebimento, a condução técnica é livre entre diagnóstico, aguardando peça, aguardando cliente, manutenção, testes e pronto para devolução. "Em devolução" só parte de "pronto para devolução", e "recebido pelo cliente" é final. Envio e recebimento seguem com operações próprias (`STAGE_TRANSITIONS`, em `contracts/rma-management.ts`). |
| Encerramento                        | O chamado se encerra sozinho quando todos os equipamentos chegam ao cliente.                                                                                                                                                                                                                                                                            |
| Conversa                            | Mensagens ficam no sistema e só são inseridas, nunca editadas. O e-mail avisa que há mensagem nova e **não repete o texto**. Cada lado recebe no máximo um aviso por chamado a cada 30 minutos de conversa. A mensagem do cliente avisa o responsável. Sem responsável, ninguém recebe e-mail, porque o chamado já aparece em "Requer atenção".         |
| Nome da equipe no portal            | O cliente vê "Equipe de manutenção", não o nome nem a conta de quem respondeu (RN11).                                                                                                                                                                                                                                                                   |

## O que foi entregue

| Parte                                                                                                                                   | Onde                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Responsável (assumir, transferir, liberar)                                                                                              | `PATCH /api/rmas/:numero/assignee`, `GET /api/rmas/assignees`                                    |
| Prioridade                                                                                                                              | `PATCH /api/rmas/:numero/priority`                                                               |
| Mudança de etapa de um ou mais itens                                                                                                    | `POST /api/rmas/:numero/stage-changes`                                                           |
| Cancelamento com motivo                                                                                                                 | `POST /api/rmas/:numero/cancellation`                                                            |
| Conversa                                                                                                                                | `GET`/`POST /api/rmas/:numero/messages` (equipe) e `/api/portal/rmas/:numero/messages` (cliente) |
| Avisos `rma_etapa_alterada`, `rma_cancelado`, `rma_mensagem_equipe` e `rma_mensagem_cliente`                                            | `apps/api/src/notifications/templates.ts`                                                        |
| Tabela `rma_messages`, `rmas.cancelled_at` e `rmas.cancellation_reason`                                                                 | migration `0006_gestao_chamados_mensagens`                                                       |
| Início da equipe: "Assumir" direto em "Requer atenção"                                                                                  | `apps/web/src/pages/rmas/AttentionPanel.tsx`                                                     |
| Detalhe do chamado: assumir/deixar, seleção de responsável e prioridade, "Alterar etapa", "Cancelar chamado" e "Conversa com o cliente" | `apps/web/src/pages/rmas`                                                                        |
| Portal: "Meus equipamentos", aviso de cancelamento e "Conversa com a equipe"                                                            | `apps/web/src/pages/portal`                                                                      |

## Regras que a implementação garante

- **Sem cruzamento:** toda operação que muda o chamado ou os itens bloqueia a linha do RMA (`lockOpenRma`). Cancelamento, recebimento, envio e mudança de etapa não se sobrepõem, e chamado encerrado não muda mais.
- **Responsável sem sobrescrita:** a tela envia o responsável que via (`expectedAssigneeId`). Se outra pessoa assumiu antes, nada é gravado e a resposta é 409.
- **Tudo ou nada na etapa:** um item fora do fluxo recusa a mudança inteira e aponta a posição dele.
- **Histórico:** responsável, prioridade, etapa (com a etapa anterior de cada item) e cancelamento (com o motivo) são auditados na mesma transação dos avisos.
- **Escopo do cliente:** a conversa de outro cliente responde 404 (CA04).

## Critérios exercitados

`npm run test:e2e` (101 cenários) inclui `test/rma-management.e2e-spec.ts` e `test/rma-messages.e2e-spec.ts`. As transições e a matriz de permissões têm testes unitários em `packages/contracts`. No navegador foram conferidos, com os dados sintéticos: assumir pela lista "Requer atenção", deixar o chamado, o diálogo de etapa listando só os itens elegíveis, a troca de mensagens nos dois lados e o portal em 375 px sem rolagem horizontal.

## Fora desta entrega

- **Garantia, laudo e nota interna:** a edição com histórico e aviso depende da P09 (condução técnica, E2).
- **Pausa do prazo** em "aguardando peça" e "aguardando cliente": o prazo segue correndo até a regra da P01 ser definida.
- **Reabertura** de chamado cancelado ou encerrado (P06).
- **Configurações do sistema pelo administrador** (prazo, antecedência de "vence em breve", regras do XML): hoje vêm da configuração do servidor (`config/env.ts`) e de `RULES`. A permissão `settings.manage` já existe, mas ainda não tem tela.
- **Edição do cadastro de clientes e contatos** (razão social, telefone): hoje só inclusão.
- **Anexos na conversa** e aviso em tempo real: a tela consulta a conversa de novo a cada 20 segundos.
