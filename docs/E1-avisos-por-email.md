# E1 — Avisos por e-mail para cliente, setor e agente

Quarta entrega da E1: define quem recebe cada aviso, cria o acesso ao portal com senha provisória e prepara o envio pela caixa do setor de manutenção. Complementa [E1-perfis-e-conversa.md](E1-perfis-e-conversa.md).

## Quem recebe o quê

| Evento                                         | Cliente (solicitante)                                                    | Caixa do setor                      | Modelo                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------- |
| Cliente cria a conta                           | Boas-vindas, com a versão do termo aceita (sem link de confirmação)      | —                                   | `boas_vindas`                                       |
| Equipe cadastra o cliente ou cria o acesso     | E-mail de acesso e senha provisória                                      | —                                   | `acesso_portal`                                     |
| Administrador convida integrante da equipe     | Quem criou o acesso, o perfil e o link                                   | —                                   | `convite`                                           |
| Integrante aceita o convite                    | Acesso liberado, com o perfil                                            | —                                   | `acesso_liberado`                                   |
| Cliente abre o chamado                         | Confirmação com o número e o link                                        | Novo chamado                        | `rma_aberto`, `equipe_rma` (`aberto`)               |
| Equipe abre o chamado (equipamento na fábrica) | Confirmação com o fim do prazo                                           | —                                   | `rma_aberto_na_fabrica`                             |
| Agente assume ou recebe o chamado              | Nome do responsável                                                      | —                                   | `rma_responsavel`                                   |
| Cliente informa o envio                        | Confirmação ("Enviado")                                                  | Envio, com modalidade e rastreio    | `rma_etapa_alterada`, `equipe_rma` (`envio`)        |
| Equipe registra o recebimento                  | Equipamentos recebidos                                                   | Recebimento                         | `rma_itens_recebidos`, `equipe_rma` (`recebimento`) |
| Mudança de etapa                               | Etapa nova (no diagnóstico, com o fim do prazo)                          | Etapa alterada                      | `rma_etapa_alterada`, `equipe_rma` (`etapa`)        |
| Cancelamento                                   | Motivo e, com equipamentos na fábrica, a lista do que entra em devolução | Cancelamento, com o motivo          | `rma_cancelado`, `equipe_rma` (`cancelado`)         |
| Mensagem da equipe                             | Aviso de mensagem nova                                                   | —                                   | `rma_mensagem_equipe`                               |
| Mensagem do cliente                            | —                                                                        | Aviso, com o responsável do chamado | `rma_mensagem_cliente`                              |

- Todo aviso ao setor traz o cliente, o **responsável** (ou "sem responsável") e o link do chamado no painel.
- Os avisos de mensagem não repetem o texto da conversa, que é lido no sistema. Cada lado recebe no máximo um aviso por chamado a cada 30 minutos de conversa.
- Os avisos são gravados na mesma transação da operação e enviados depois, pela fila (`/admin/avisos` mostra a situação de cada um).

## Decisões registradas em 02/10/2026

| Assunto                        | Decisão                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conta criada pela equipe       | **Senha provisória aleatória** por conta (12 caracteres, sem os ambíguos 0/O e 1/l/I), enviada por e-mail. A troca é **obrigatória no primeiro acesso**: até lá, a API só aceita a troca de senha, a consulta da sessão e a saída (`PASSWORD_CHANGE_REQUIRED`). A troca também confirma o e-mail. Uma senha igual para todos foi descartada por permitir o acesso a qualquer conta ainda não usada. |
| Senha no banco                 | A senha provisória fica só no aviso pendente e é **retirada do banco** assim que o e-mail é enviado, como os links com token.                                                                                                                                                                                                                                                                       |
| Convite de contato             | Substituído pelo acesso com senha provisória ("Criar acesso ao portal"). Um convite antigo em aberto para o mesmo e-mail é revogado. Os convites da equipe continuam por link (ver [E1-cadastro-senha-e-termo.md](E1-cadastro-senha-e-termo.md)).                                                                                                                                                   |
| Responsável visível ao cliente | O nome (só o nome) aparece no e-mail e no detalhe do atendimento no portal. A conversa continua assinada como "Equipe de manutenção".                                                                                                                                                                                                                                                               |
| Notificações no sistema        | Por enquanto, só e-mail. Um sino com avisos dentro do sistema fica para depois.                                                                                                                                                                                                                                                                                                                     |

## Configuração do envio

O remetente e a caixa do setor vêm do ambiente da API (`apps/api/.env` em desenvolvimento, variáveis do servidor em produção). **A senha da conta de e-mail nunca entra no repositório.**

| Variável                                | Uso                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Servidor de saída. Porta 465 usa TLS direto (`SMTP_SECURE=true`).           |
| `SMTP_USER`, `SMTP_PASSWORD`            | Conta que envia (o próprio e-mail do setor).                                |
| `MAIL_FROM`                             | Remetente exibido, ex.: `"Manutenção <setor@empresa.com.br>"`.              |
| `MAINTENANCE_INBOX_EMAIL`               | Caixa do setor que recebe os avisos da equipe. **Obrigatória em produção.** |

Em desenvolvimento, tudo vai para o Mailpit (http://localhost:8025), inclusive a caixa do setor (`manutencao@central.local`).

O IMAP não é necessário: a aplicação só envia. Ler respostas por e-mail e transformá-las em mensagens do chamado seria uma entrega à parte.

### Validar a conta antes de ligar os avisos

```bash
npm run mail:test -w @central/api -- destino@exemplo.com
```

O comando manda um e-mail direto, sem passar pela fila, com a configuração atual, e mostra o erro do servidor se a conexão ou a senha falharem.

## O que foi entregue

| Parte                                                     | Onde                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acesso ao portal com senha provisória                     | `POST /api/customers/:id/contacts/:contato/access`, `identity/portal-access.service.ts`                                                             |
| Bloqueio até a troca da senha provisória                  | `identity/auth.guard.ts`, `@AllowedBeforePasswordChange()`; coluna `accounts.password_change_required` (migration `0010_senha_provisoria_e_avisos`) |
| Tela de primeiro acesso                                   | `apps/web/src/pages/auth/FirstAccessPage.tsx`                                                                                                       |
| Avisos ao setor                                           | `rmas/rma-team-notices.ts`, eventos em `notifications/team-events.ts`                                                                               |
| Aviso de etapa ao solicitante (equipe e envio do cliente) | `rmas/rma-requester-notices.ts`                                                                                                                     |
| Responsável no portal                                     | `PortalRmaDetail.assignee`                                                                                                                          |
| Teste do SMTP                                             | `npm run mail:test -w @central/api`                                                                                                                 |

Testes: `test/portal-access.e2e-spec.ts`, `test/notification-flows.e2e-spec.ts` e os modelos em `src/notifications/templates.spec.ts`.

## Fora desta entrega

- **Notificações dentro do sistema** (sino com contador de não lidas).
- **Respostas por e-mail** virando mensagens do chamado (exigiria ler a caixa por IMAP).
- **Envio pelo celular:** o link do QR Code e os links dos e-mails usam o `APP_ORIGIN`, que em produção precisa ser o domínio público em HTTPS.
