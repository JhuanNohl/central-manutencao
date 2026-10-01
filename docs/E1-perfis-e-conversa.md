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

## Fotos e vídeos (30/09/2026)

| Parte               | Decisão ou regra                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Carrossel           | As miniaturas de cada equipamento abrem um carrossel com setas nas laterais (e as setas do teclado), sem fechar para trocar de arquivo. Do último, volta ao primeiro.                                                                                                                                                                                        |
| Vídeo da falha      | Opcional, um por equipamento, enviado pelo cliente (ou pela equipe) na abertura, junto das fotos, e exibido no mesmo carrossel.                                                                                                                                                                                                                              |
| Vídeo de validação  | Gravado pela equipe com o item **em testes** ou **pronto para devolução**, num card próprio ("Vídeo de validação"). É **obrigatório para o despacho** ("em devolução") de cada item e fica **visível ao cliente**, sem o nome de quem gravou (RN11). Um novo substitui o anterior, que segue guardado e citado no histórico (`rma.video_validacao_anexado`). |
| Formatos (proposta) | MP4 (Android), MOV (iPhone) ou WebM de até **100 MB**, reconhecidos pelo conteúdo (caixa `ftyp` ou cabeçalho EBML). Vídeos do iPhone em HEVC podem não tocar em todos os navegadores; o link "Abrir em nova aba" baixa o original.                                                                                                                           |
| Reprodução          | Os downloads passam a ser lidos do armazenamento aos poucos e aceitam `Range` (206), o que permite tocar e avançar o vídeo sem baixar o arquivo inteiro.                                                                                                                                                                                                     |

Tabelas: `rma_items.video_file_id` e `rma_validation_videos` (migration `0007_videos_falha_validacao`). API: `PUT /api/rmas/:numero/items/:item/validation-video`. Testes: `test/rma-media.e2e-spec.ts`.

## Envio pelo celular por QR Code (01/10/2026)

O botão **"Enviar pelo celular"** (em cada equipamento da abertura) e **"Gravar pelo celular"** (no vídeo de validação) mostram um QR Code. O celular abre `/enviar` sem login, tira as fotos ou grava o vídeo pela câmera, e o arquivo vai direto para o lugar certo, sem passar por outro aplicativo. Isso revisa a A12 da 1.0 (QR Code fora do escopo), por decisão de 01/10/2026.

| Regra             | Como funciona                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destino           | **Abertura:** fotos e vídeo da falha entram no rascunho aberto no computador, com miniatura. **Validação:** o vídeo é anexado ao item assim que chega, e o código se encerra.                                                                                                                           |
| Dono dos arquivos | A conta que gerou o código, como se tivesse enviado do computador. A abertura e o vínculo seguem as regras de sempre.                                                                                                                                                                                   |
| Validade          | **15 minutos** (`UPLOAD_SESSION_TTL_MINUTES`, proposta). Fechar a janela do QR Code invalida o link na hora.                                                                                                                                                                                            |
| Limites           | Os da sessão: as fotos que ainda cabem no equipamento (até 5) e um vídeo. Envios simultâneos são serializados no banco, e o limite vale mesmo assim.                                                                                                                                                    |
| Segurança         | Token aleatório de 256 bits no **fragmento** do link (`#token=`), que não vai para logs de acesso; o banco guarda só o SHA-256. A conta precisa continuar ativa e com a permissão do envio: um papel alterado ou uma conta desativada invalidam o código. O celular não vê ids de conta nem de arquivo. |
| Falha no vínculo  | Se o item da validação saiu das etapas finais, o envio é desfeito e o celular pode tentar de novo.                                                                                                                                                                                                      |

API: `POST/GET/DELETE /api/upload-sessions` (computador), `POST /api/mobile-uploads/session` e `POST /api/mobile-uploads/files` (celular, públicas), `GET /api/files/:id` (miniatura de um temporário próprio). Tabelas `upload_sessions` e `upload_session_files` (migration `0008_envio_pelo_celular`). QR Code gerado no navegador com `qrcode-generator` (MIT, sem dependências). Testes: `test/upload-sessions.e2e-spec.ts` e `src/mobile-uploads/upload-session-rules.spec.ts`.

**Para testar com um celular de verdade em desenvolvimento:** o link usa `APP_ORIGIN`, e `localhost` não abre no celular. Coloque o IP do computador na rede local em `apps/api/.env` (ex.: `APP_ORIGIN=http://192.168.0.10:5173`), rode `npm run dev:lan`, que deixa o frontend visível na rede, e abra o sistema no computador pelo mesmo endereço, porque a proteção de origem só aceita o `APP_ORIGIN`.

## Fora desta entrega

- **Garantia, laudo e nota interna:** a edição com histórico e aviso depende da P09 (condução técnica, E2).
- **Pausa do prazo** em "aguardando peça" e "aguardando cliente": o prazo segue correndo até a regra da P01 ser definida.
- **Reabertura** de chamado cancelado ou encerrado (P06).
- **Configurações do sistema pelo administrador** (prazo, antecedência de "vence em breve", regras do XML): hoje vêm da configuração do servidor (`config/env.ts`) e de `RULES`. A permissão `settings.manage` já existe, mas ainda não tem tela.
- **Edição do cadastro de clientes e contatos** (razão social, telefone): hoje só inclusão.
- **Anexos na conversa** e aviso em tempo real: a tela consulta a conversa de novo a cada 20 segundos.
- **Envio de vídeo sem passar pela memória:** o envio ainda chega inteiro à memória do servidor antes da conferência (até 100 MB por envio). Gravar direto em disco durante o recebimento fica para quando o volume pedir.
- **Barra de progresso** do envio de vídeos grandes: hoje só aparece "Enviando…".
- **Limpeza das sessões de envio vencidas:** os registros ficam no banco (sem uso depois de expirar). Os arquivos temporários não vinculados já são removidos pela limpeza de 24 h.
