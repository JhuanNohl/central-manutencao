# Migração do sistema anterior (osTicket)

Guia para a aplicação de migração: para onde vai cada dado do sistema anterior, o que este sistema preparou para recebê-los e o que fica de fora. A importação grava direto no PostgreSQL (na homologação, `127.0.0.1:5434`), **sem alterar as tabelas existentes**: os dados sem lugar ganharam tabelas novas.

## O que foi preparado

| Necessidade do legado                             | Onde fica                                                                                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| De-para dos ids (rodar de novo sem duplicar)      | `legacy_records`: tabela e id de origem → entidade criada aqui. Chave `(source_table, source_id)`.                                                             |
| Nº do ticket que cliente e equipe conhecem        | `legacy_records.reference` da linha `ost_ticket` → RMA. Aparece na fila, no detalhe e no portal (badge "Sistema anterior · nº …") e entra na busca.            |
| Pendência de documentação (NF com erro, sem NF)   | Calculada pelos documentos do RMA. Badge na fila e no detalhe, filtro "Documentação pendente" e ação **Enviar documentação** para a equipe e para o cliente.   |
| Notas internas do ticket (thread tipo `N`)        | `rma_internal_notes`, card "Notas internas" no detalhe do chamado. Só a equipe vê.                                                                             |
| Notas internas do cliente (formulário do usuário) | `customer_notes`, card "Observações internas" no detalhe do cliente. Só a equipe vê.                                                                           |
| Senhas do legado (bcrypt `$2a$`/`$2y$`)           | Gravadas como estão em `accounts.password_hash`. No primeiro login a senha é convertida para Argon2id; se não atender à política atual, a troca é obrigatória. |

## Ordem da importação

Cada passo depende do anterior. Um ticket inteiro (RMA, itens, fotos, documentos, conversa e histórico) grava numa transação só.

1. **Equipe** (`ost_staff`) → `accounts`.
2. **Clientes** (`ost_user`, `ost_user_email`, formulário do usuário, `ost_user_account`) → `customers`, `customer_contacts`, `accounts`, `customer_notes`.
3. **Arquivos** (`ost_file` + `ost_file_chunk`) → `files` e o conteúdo em `FILES_STORAGE_DIR`.
4. **Tickets** (`ost_ticket`, `ost_ticket__cdata`) → `rmas`.
5. **Equipamentos** (`ost_zk_equipment`) → `rma_items`; fotos (`ost_zk_equipment_file`) → `rma_item_photos`.
6. **Documentos** (`ost_zk_ticket_file`) → `rma_documents` e `rma_invoices`.
7. **Envio e recebimento** (`ost_zk_ticket_envio`, eventos de equipamento) → `rma_shipments`, `rma_receipts` e itens.
8. **Conversa** (`ost_thread_entry`) → `rma_messages` e `rma_internal_notes`.
9. **Histórico** (`ost_zk_equipment_event`, `ost_thread_event`) → `audit_events`.

Para cada registro criado, uma linha em `legacy_records`. Antes de criar, o importador consulta `legacy_records`: se a origem já foi importada, pula. `audit_events` não aceita alteração nem exclusão; por isso o histórico de um ticket só é gravado na mesma transação em que o RMA nasce.

## De-para por tabela

### Equipe: `ost_staff` → `accounts`

| Origem                   | Destino                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| `firstname` + `lastname` | `name`                                                                          |
| `email`                  | `email` (minúsculo; obrigatório; sem e-mail, a conta fica para cadastro manual) |
| `isadmin = 1`            | `role = 'administrador'`; senão `'agente'`                                      |
| `isactive = 0`           | `status = 'desativada'` e `disabled_at` = data da importação                    |
| `passwd` (bcrypt)        | `password_hash` como está; outro formato → ver "Senhas"                         |
| `created`, `lastlogin`   | `created_at`, `last_login_at`                                                   |

`legacy_records`: `('ost_staff', staff_id) → account`.

### Clientes: `ost_user` + formulário → `customers`, `customer_contacts`, `accounts`

| Origem                                              | Destino                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Campo `cpf_cnpj` do formulário                      | `customers.document` só com os caracteres; 11 → `pessoa_fisica`, 14 → `pessoa_juridica`. Documento repetido: um cliente, vários contatos. |
| `ost_user.name`                                     | `customers.name` e `customer_contacts.name`                                                                                               |
| `ost_user_email.address` (o `default_email_id`)     | `customer_contacts.email` e `accounts.email`                                                                                              |
| Campo `phone`                                       | `customer_contacts.phone` no formato `+55 (DD) 9 XXXX-XXXX` quando válido; senão, o texto original                                        |
| Campo `notes` (notas internas)                      | `customer_notes.body`                                                                                                                     |
| `ost_user_account.passwd`                           | `accounts.password_hash` como está (`role = 'cliente'`, `email_verified_at` = `registered`)                                               |
| `ost_organization` (nome, site, endereço, telefone) | Acrescentados ao `customer_notes.body` do cliente vinculado                                                                               |

Sem CPF/CNPJ não há como criar o cliente (o documento é obrigatório e único): esses usuários vão para uma lista de pendências da migração. A data de nascimento **não** é migrada: o sistema não a usa, e a LGPD pede só o dado necessário.

`legacy_records`: `('ost_user', id) → customer_contact` e `account`; o cliente com `('cpf_cnpj', documento) → customer`.

### Arquivos: `ost_file` + `ost_file_chunk` → `files`

| Origem                            | Destino                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Chunks em ordem (`chunk_id`)      | Conteúdo gravado no disco em `storage_key` = `AAAAMM/<uuid>`                                                          |
| `type`, `size`, `name`, `created` | `content_type`, `size_bytes`, `original_name` (sem caminho), `created_at`                                             |
| —                                 | `sha256` do conteúdo; `linked_at` = data da importação; `owner_account_id` = conta do cliente do ticket (obrigatório) |
| —                                 | `purpose`: `foto_item` (fotos), `nota_xml` ou `declaracao` (documentos)                                               |

`content_type` aceita só JPEG, PNG, WebP, MP4, QuickTime, WebM, PDF e XML, reconhecidos pelo conteúdo (não pela extensão). Outro tipo vai para a lista de pendências.

Um arquivo do legado usado por vários equipamentos precisa de **uma cópia por uso**: aqui uma foto pertence a um item só. Arquivos repetidos dezenas de vezes costumam ser imagem padrão; vale conferir antes de copiar.

### Tickets: `ost_ticket` → `rmas`

| Origem                                  | Destino                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `number`                                | `legacy_records.reference`; o `rmas.number` segue a numeração deste sistema |
| `user_id`                               | `customer_id` e `requester_contact_id` (pelo de-para do usuário)            |
| `user_id` (conta)                       | `opened_by_account_id`                                                      |
| `staff_id` (0 = nenhum)                 | `assignee_account_id`                                                       |
| `__cdata.priority`                      | `priority`: baixa/normal → `normal`, alta → `alta`, emergência → `urgente`  |
| `created`, `updated`/`lastupdate`       | `created_at`, `updated_at`                                                  |
| `closed` (situação "Resolvido")         | `closed_at`                                                                 |
| `__cdata.subject` e campo `observacoes` | Primeira mensagem da conversa, do lado do cliente, na data de abertura      |

A situação do ticket (Solicitado, Enviado, Recebido, Resolvido) não é migrada como campo: aqui ela é a contagem das etapas dos itens (A5.1).

### Equipamentos: `ost_zk_equipment` → `rma_items`

| Origem                    | Destino                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `seq`                     | `position` (1, 2, 3… na ordem)                                                    |
| `modelo`, `numero_serie`  | `model`, `serial_number`                                                          |
| `resumo` + `detalhamento` | `reported_failure` (resumo, linha em branco, detalhamento)                        |
| `descricao`               | `notes`                                                                           |
| `garantia`                | `warranty` (mesmos valores); `warranty_requested` = diferente de `nao_solicitada` |
| `laudo`                   | `technical_report`                                                                |
| `nota_interna`            | `internal_note`                                                                   |
| `status`                  | `stage` (tabela abaixo)                                                           |
| `staff_id`                | Não tem campo próprio: o responsável é do chamado (`assignee_account_id`)         |

| `status` no legado   | `stage` aqui           | Exigências do banco                                              |
| -------------------- | ---------------------- | ---------------------------------------------------------------- |
| `aguardando_envio`   | `aguardando_envio`     | —                                                                |
| `recebido`           | `recebido`             | `received_at`                                                    |
| `aguardando_cliente` | `aguardando_aprovacao` | `received_at`, `sla_started_at` e `sla_hours`                    |
| `em_testes`          | `testes`               | `received_at`, `sla_started_at` e `sla_hours`                    |
| `concluido`          | `finalizado`           | `received_at`, `sla_started_at`, `sla_hours` e `sla_finished_at` |

As datas saem dos eventos do equipamento (`to_status = 'recebido'` para `received_at`, e assim por diante); sem evento, use `updated`. `sla_hours` recebe o `RMA_SLA_HOURS` atual.

A **pendência** do equipamento não tem campo: ela é recalculada pelos documentos do chamado. `nf_com_erro` vira o XML com `validation_status = 'com_divergencias'`; `sem_nf` vira o chamado sem documento; `envio_nao_informado` é a própria etapa `aguardando_envio`.

### Fotos: `ost_zk_equipment_file` → `rma_item_photos`

`position` = `slot`, na ordem. O sistema aceita até 5 fotos por equipamento na abertura; acima disso, mantenha as 5 primeiras e registre o restante na lista de pendências.

### Documentos: `ost_zk_ticket_file` → `rma_documents` e `rma_invoices`

| Origem                         | Destino                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `kind = 'nf'` (arquivo XML)    | `rma_documents.kind = 'nota_xml'`, `rules_version = 'legado'`                                                               |
| `errors` preenchido            | `validation_status = 'com_divergencias'` e `issues` = cada erro como `{ "rule": "legado", "message": …, "blocking": true }` |
| `errors` vazio                 | `validation_status = 'valido'`                                                                                              |
| `nf_numero`, `nf_razao_social` | `rma_invoices.number`, `issuer_name` (`issuer_document` = documento do cliente), `document_id` = o XML                      |
| `kind = 'dc'`                  | `rma_documents.kind = 'declaracao'`                                                                                         |

Um RMA tem no máximo um documento de cada tipo: com mais de um, importe o mais recente. NF que não é XML (PDF ou imagem) não entra como `nota_xml`: registre só os dados da nota em `rma_invoices` (sem `document_id`) e o arquivo fica na lista de pendências. Depois da importação, a pendência é resolvida pela ação **Enviar documentação**, pelo cliente ou pela equipe.

### Envio e recebimento

| Origem                                  | Destino                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ost_zk_ticket_envio.transportadora`    | `rma_shipments.method`: Correios → `correios`; vazio → `entrega_propria`; outros → `transportadora` com `carrier` = código |
| `rastreio`, `confirmado` (ou `updated`) | `tracking_code`, `confirmed_at`; `confirmed_by_account_id` = conta do cliente                                              |
| Itens do ticket já enviados             | `rma_shipment_items`                                                                                                       |
| Itens recebidos (eventos `recebido`)    | `rma_receipts` (um por data de recebimento) e `rma_receipt_items`                                                          |

### Conversa: `ost_thread_entry` (thread do ticket) → `rma_messages` e `rma_internal_notes`

| `type` | Destino                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| `M`    | `rma_messages`, `author_side = 'cliente'`, autor = conta do usuário                      |
| `R`    | `rma_messages`, `author_side = 'equipe'`, autor = conta do agente                        |
| `N`    | `rma_internal_notes`, `author_account_id` do agente (ou nulo) e `author_name` = `poster` |

O corpo vem em HTML: converta para texto (quebras de linha preservadas, sem tags). `rma_messages.author_account_id` é obrigatório: mensagem de quem não tem conta usa a conta do solicitante (cliente) ou fica na lista de pendências (equipe). Anexos da conversa (`ost_attachment` tipo `H`) não têm destino nesta versão.

### Histórico

`ost_zk_equipment_event` → `audit_events` com `action = 'rma.etapa_alterada'`, `entity_type = 'rma'`, `actor_account_id` = agente, `occurred_at` = `created` e `data` no mesmo formato da troca de etapa deste sistema, `{ "stage": <etapa nova>, "before": { "<id do item>": <etapa anterior> } }`, acrescido de `"legado": true` e da observação do evento (etapas já convertidas). `ost_thread_event` pode entrar como `action = 'legado.<evento>'`, só para consulta.

## Senhas

- **bcrypt** (`$2a$`, `$2b$`, `$2y$`): importe o hash como está. O primeiro login confere com bcrypt, grava a senha com Argon2id e, se ela não atende à política atual (8 caracteres, maiúscula, número e especial), leva para a tela de troca obrigatória.
- **Outro formato** (MD5 antigo, vazio): grave um hash Argon2id aleatório e a pessoa usa **Esqueci minha senha**.

## Fica de fora

| Dado                                             | Motivo                                      |
| ------------------------------------------------ | ------------------------------------------- |
| Data de nascimento                               | Não usada; minimização exigida pela LGPD    |
| IP, origem do ticket (Web/E-mail), fuso e idioma | Sem uso neste sistema                       |
| Departamentos, tópicos, SLA e status do osTicket | Substituídos pelas regras deste sistema     |
| Assinatura, telefones e permissões dos agentes   | Sem uso; os papéis vêm de `isadmin`         |
| Anexos da conversa                               | Sem destino nesta versão (decisão pendente) |

## Depois da importação

1. Conferir as quantidades por tabela contra o legado (tickets, equipamentos, fotos, documentos, mensagens, notas).
2. Na fila, filtrar **Documentação pendente**: devem aparecer os chamados que no legado estavam "NF com erro" ou "sem NF".
3. Buscar alguns números antigos na fila e abrir no portal com uma conta de cliente.
4. Entrar com uma conta importada (senha antiga) e confirmar a conversão.
