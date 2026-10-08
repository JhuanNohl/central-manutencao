# Migração do sistema anterior (osTicket)

Para onde vai cada dado do sistema anterior, o que este sistema preparou para recebê-los e o que fica de fora. A importação é feita pelo comando `import-legacy` ([apps/api/src/legacy-import](../apps/api/src/legacy-import)), que segue este guia: lê o MariaDB do legado e grava no PostgreSQL, **sem alterar as tabelas existentes**. Os dados sem lugar ganharam tabelas novas. Como rodar: [Rodar a importação](#rodar-a-importação).

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

Cada passo depende do anterior.

1. **Equipe** (`ost_staff`) → `accounts`.
2. **Clientes** (`ost_user`, `ost_user_email`, formulário do usuário, `ost_user_account`) → `customers`, `customer_contacts`, `accounts`, `customer_notes`.
3. **Tickets**, cada um inteiro numa transação só: o chamado (`ost_ticket`, `ost_ticket__cdata`), os equipamentos e as fotos (`ost_zk_equipment`, `ost_zk_equipment_file`), os documentos (`ost_zk_ticket_file`), o envio e os recebimentos (`ost_zk_ticket_envio`, eventos), a conversa (`ost_thread_entry`) e o histórico (`ost_zk_equipment_event`). Os arquivos (`ost_file` + `ost_file_chunk`) são lidos e gravados no armazenamento antes da transação.

Para cada registro criado, uma linha em `legacy_records`. Antes de criar, o importador consulta `legacy_records`: se a origem já foi importada, pula. Um ticket que falha é desfeito por inteiro, com os arquivos que já tinham sido gravados, e entra numa próxima execução. `audit_events` não aceita alteração nem exclusão; por isso o histórico de um ticket só é gravado na mesma transação em que o RMA nasce. Cada execução real também fica no histórico (`legado.importacao`), com as contagens e as ocorrências.

## De-para por tabela

### Equipe: `ost_staff` → `accounts`

| Origem                   | Destino                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `firstname` + `lastname` | `name`                                                             |
| `email`                  | `email`: o e-mail **próprio** do agente, que é o login (minúsculo) |
| `isadmin = 1`            | `role = 'administrador'`; senão `'agente'`                         |
| `isactive = 0`           | `status = 'desativada'` e `disabled_at` = data da importação       |
| `passwd` (bcrypt)        | `password_hash` como está; outro formato → ver "Senhas"            |
| `created`, `lastlogin`   | `created_at`, `last_login_at`                                      |

`legacy_records`: `('ost_staff', staff_id) → account`.

Cada agente entra com o próprio e-mail. A caixa do setor nunca é login: `accounts.email` é único e uma conta compartilhada apagaria quem fez cada ação no histórico. Quando o `ost_staff` traz a caixa do setor ou vem sem e-mail, a aplicação de migração usa o e-mail próprio do agente, de uma lista de-para mantida fora deste repositório. Todos os avisos à equipe vão para a caixa do setor (`MAINTENANCE_INBOX_EMAIL`); o e-mail próprio do agente serve só para entrar e recuperar a senha.

A conta do legado que tem a própria caixa do setor como e-mail (a conta compartilhada da manutenção) não é login de ninguém: entra **desativada**, sem senha utilizável, só para assinar o histórico. Assim, as respostas que ela deu continuam visíveis ao cliente na conversa (decisão de 08/10/2026). Ela não aparece entre os responsáveis possíveis.

### Clientes: `ost_user` + formulário → `customers`, `customer_contacts`, `accounts`

| Origem                                              | Destino                                                                                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campo `cpf_cnpj` do formulário                      | `customers.document` só com os caracteres; 11 → `pessoa_fisica`, 14 → `pessoa_juridica`. Documento repetido: um cliente, vários contatos.                                                                                  |
| `ost_user.name`                                     | `customers.name` e `customer_contacts.name`                                                                                                                                                                                |
| `ost_user_email.address` (o `default_email_id`)     | `customer_contacts.email` e `accounts.email`                                                                                                                                                                               |
| Campo `phone`                                       | `customer_contacts.phone` no formato `+55 (DD) 9 XXXX-XXXX` quando válido; senão, o texto original                                                                                                                         |
| Campo `notes` (notas internas)                      | `customer_notes.body`                                                                                                                                                                                                      |
| `ost_user_account.passwd`                           | `accounts.password_hash` como está (`role = 'cliente'`). Todas as contas de cliente importadas contam com o termo de garantia vigente aceito (decisão de 08/10/2026). Quem não tinha conta no portal recebe uma, com senha aleatória, e entra por **Esqueci minha senha**: a conta é a dona dos arquivos e a autora das mensagens dele. |
| `ost_organization` (nome, site, endereço, telefone) | Acrescentados ao `customer_notes.body` do cliente vinculado                                                                                                                                                                |

Basta um documento por cliente, CPF ou CNPJ. Quando o cadastro do legado não traz nenhum, vale o do **emitente da NF** dos tickets do usuário, da nota ou de um evento dela, como a carta de correção: a nota de remessa é emitida pelo próprio cliente (decisão de 08/10/2026). Só migram os cadastros válidos. O usuário sem CPF/CNPJ válido (nem no cadastro, nem na NF) ou sem e-mail válido (o documento é obrigatório e único, e o e-mail é o login) **não é importado**, e os tickets dele também ficam de fora: são cadastros que já não estão em uso. O importador registra cada um no relatório da migração; a lista prévia sai do script em [Cadastros que travam a importação](#cadastros-que-travam-a-importação). A data de nascimento **não** é migrada: o sistema não a usa, e a LGPD pede só o dado necessário.

`legacy_records`: `('ost_user', id) → customer_contact`, `('ost_user_account', id do usuário) → account` e `('cpf_cnpj', documento) → customer`.

### Arquivos: `ost_file` + `ost_file_chunk` → `files`

| Origem                            | Destino                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Chunks em ordem (`chunk_id`)      | Conteúdo gravado no disco em `storage_key` = `AAAAMM/<uuid>`                                                                             |
| `type`, `size`, `name`, `created` | `content_type`, `size_bytes`, `original_name` (sem caminho), `created_at`                                                                |
| —                                 | `sha256` do conteúdo; `created_at` e `linked_at` = data do equipamento ou do ticket; `owner_account_id` = conta do solicitante do ticket |
| —                                 | `purpose`: `foto_item` (fotos), `nota_xml` ou `declaracao` (documentos)                                                                  |

O tipo é reconhecido pelo conteúdo, não pela extensão, entre os aceitos na finalidade: fotos em JPEG, PNG ou WebP; nota em XML; declaração em PDF, JPEG ou PNG. Arquivo de outro tipo, vazio ou guardado fora do banco do legado (`bk` diferente de `D`) fica de fora, com aviso no relatório.

Um arquivo do legado usado por vários equipamentos ganha **uma cópia por uso**: aqui uma foto pertence a um item só.

### Tickets: `ost_ticket` → `rmas`

| Origem                                  | Destino                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `number`                                | `legacy_records.reference`; o `rmas.number` segue a numeração deste sistema                          |
| `user_id`                               | `customer_id` e `requester_contact_id` (pelo de-para do usuário)                                     |
| `user_id` (conta)                       | `opened_by_account_id`                                                                               |
| `staff_id` (0 = nenhum)                 | `assignee_account_id`                                                                                |
| `__cdata.priority`                      | `priority`: baixa/normal → `normal`, alta → `alta`, emergência → `urgente` (não há prioridade baixa) |
| `created`, `updated`/`lastupdate`       | `created_at`, `updated_at`                                                                           |
| `closed` (situação "Resolvido")         | `closed_at`                                                                                          |
| `__cdata.subject` e campo `observacoes` | Primeira mensagem da conversa, do lado do cliente, na data de abertura                               |

A situação do ticket (Solicitado, Enviado, Recebido, Resolvido) não é migrada como campo: aqui ela é a contagem das etapas dos itens (A5.1). Só o estado `closed` (ou `archived`) encerra o chamado. A numeração nova segue a ordem de abertura no legado, a partir do #100001.

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

`received_at` sai do primeiro evento `recebido` e `sla_finished_at`, do primeiro `concluido`; sem evento, vale o `updated` do equipamento. O prazo começa no recebimento (`sla_started_at`), já que o legado não tinha a etapa de diagnóstico, e `sla_hours` recebe o `RMA_SLA_HOURS` atual. Situação desconhecida faz o ticket falhar no relatório, para o de-para ser revisto.

A **pendência** do equipamento não tem campo: ela é recalculada pelos documentos do chamado. `nf_com_erro` vira o XML com `validation_status = 'com_divergencias'`; `sem_nf` vira o chamado sem documento; `envio_nao_informado` é a própria etapa `aguardando_envio`.

### Fotos: `ost_zk_equipment_file` → `rma_item_photos`

`position` segue o `slot`, na ordem. O sistema aceita até 5 fotos por equipamento: acima disso, entram as 5 primeiras e o restante fica de fora, com aviso no relatório.

### Documentos: `ost_zk_ticket_file` → `rma_documents` e `rma_invoices`

| Origem                      | Destino                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind = 'nf'` (arquivo XML) | `rma_documents.kind = 'nota_xml'`, validado de novo pelas regras atuais (`validation_status`, `issues` e `rules_version` vigentes), inclusive o endereço da fábrica. O campo `errors` do legado não é usado. |
| Dados da nota               | `rma_invoices`: número, emitente e documento lidos do XML; sem XML legível, `nf_numero` e `nf_razao_social` com o documento do cliente                                                                       |
| `kind = 'dc'`               | `rma_documents.kind = 'declaracao'`                                                                                                                                                                          |

Um RMA tem no máximo um documento de cada tipo: com mais de um, entra o mais recente. NF que não é XML (PDF ou imagem) não entra como `nota_xml`: ficam só os dados da nota em `rma_invoices` (sem `document_id`), e o arquivo fica no backup do legado.

Os primeiros tickets do legado foram abertos antes de a nota ser obrigatória e podem vir sem NF ou com dados inconsistentes. Eles são importados como estão, sem bloquear a migração. Quando a nota existe fora do sistema, a aplicação de migração pode anexá-la nesse momento: o XML entra como `nota_xml`, validado pelas regras atuais. Chamado encerrado nunca aparece como pendente; o que continuar aberto sem nota mostra **Documentação pendente** até alguém usar **Enviar documentação**.

### Envio e recebimento

| Origem                                  | Destino                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ost_zk_ticket_envio.transportadora`    | `rma_shipments.method`: Correios → `correios`; vazio → `entrega_propria`; outros → `transportadora` com `carrier` = código |
| `rastreio`, `confirmado` (ou `updated`) | `tracking_code`, `confirmed_at`; `confirmed_by_account_id` = conta do cliente                                              |
| Itens do ticket já enviados             | `rma_shipment_items`                                                                                                       |
| Itens recebidos (eventos `recebido`)    | `rma_receipts` (um por data de recebimento) e `rma_receipt_items`                                                          |

### Conversa: `ost_thread_entry` (thread do ticket) → `rma_messages` e `rma_internal_notes`

| `type` | Destino                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `M`    | `rma_messages`, `author_side = 'cliente'`, autor = conta de quem escreveu, se for do mesmo cliente; senão, o solicitante |
| `R`    | `rma_messages`, `author_side = 'equipe'`, autor = conta do agente; agente sem conta → nota interna com o nome dele       |
| `N`    | `rma_internal_notes`, `author_account_id` do agente (ou nulo) e `author_name` = `poster`                                 |

O corpo em HTML vira texto, com as quebras de linha e sem tags. Mensagem acima de 2.000 caracteres vira mais de uma, sem perder nada. O assunto e as observações do ticket abrem a conversa como mensagem do cliente. Anexos da conversa (`ost_attachment` tipo `H`) ficam com o script à parte.

### Histórico

`ost_zk_equipment_event` → `audit_events` com `action = 'rma.etapa_alterada'`, `entity_type = 'rma'`, `actor_account_id` = agente, `occurred_at` = `created` e `data` no mesmo formato da troca de etapa deste sistema, `{ "stage": <etapa nova>, "before": { "<id do item>": <etapa anterior> } }`, acrescido de `"legado": true` e da observação do evento (etapas já convertidas). Os eventos da conversa do osTicket (`ost_thread_event`) não entram.

## Cadastros que travam a importação

O script [scripts/migracao/extrair-cadastros.sh](../scripts/migracao/extrair-cadastros.sh) roda no servidor do legado, só lê o banco e gera duas planilhas CSV que o Excel abre direto. A primeira é a lista do que **não** será migrado, para conferir antes da importação:

- `cadastros-bloqueados-<data>.csv`: um usuário por linha, com nome, e-mail, CPF/CNPJ informado, quantidade de tickets, se tem conta no portal e o motivo: sem CPF/CNPJ, dígitos verificadores inválidos (inclusive CNPJ alfanumérico), sem e-mail, e-mail inválido ou igual ao de um agente. Os de mais tickets vêm primeiro.
- `documentos-repetidos-<data>.csv`: CPF/CNPJ usados por mais de um usuário. Não trava: vira um cliente com vários contatos.

Ele encontra sozinho o contêiner do MariaDB e usa as credenciais que o próprio contêiner já tem, sem pedir senha.

1. Copie a pasta `scripts/migracao` (os três arquivos) para o servidor, pela pasta Samba do projeto.
2. No MobaXterm, abra a sessão SSH do servidor e entre na pasta:

   ```bash
   cd <pasta do projeto no servidor>/scripts/migracao
   ```

3. Rode o script com `sudo`:

   ```bash
   sudo bash extrair-cadastros.sh
   ```

   Se aparecer "Há mais de um contêiner de banco em execução", escolha o do legado pela lista e informe com `-c`:

   ```bash
   sudo bash extrair-cadastros.sh -c <nome do contêiner>
   ```

4. Baixe as planilhas pelo painel SFTP do MobaXterm, na pasta `migracao-legado` da sua pasta pessoal (o script mostra o caminho completo).
5. Depois de baixar, apague as planilhas do servidor:

   ```bash
   rm -r ~/migracao-legado
   ```

As planilhas têm dados reais de clientes: só o seu usuário consegue lê-las no servidor, e elas nunca entram neste repositório.

| Situação                                            | O que fazer                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Erro `$'\r': command not found`                     | O arquivo ganhou quebra de linha do Windows na cópia. Corrija com `sed -i 's/\r$//' extrair-cadastros.sh`        |
| "sem acesso ao Docker"                              | Faltou o `sudo` no comando                                                                                       |
| MariaDB instalado direto no servidor, sem contêiner | O script usa o root pelo socket. Se pedir senha, rode com `-u <usuário do banco>` e digite a senha quando pedida |
| Banco com outro nome                                | Informe com `-b <nome do banco>`                                                                                 |

## Rodar a importação

O comando roda no contêiner da API, que já tem acesso ao PostgreSQL e ao volume dos arquivos. Ele precisa enxergar também o banco do legado (`LEGACY_DATABASE_URL`).

| Opção                          | Para quê                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run`                    | Ensaio: roda tudo e desfaz no fim. As restrições do banco são conferidas de verdade, nada fica gravado e a numeração volta ao #100001. |
| `--staff-emails=<arquivo>`     | JSON `{ "<staff_id>": "<e-mail próprio>" }` dos agentes cujo cadastro traz a caixa do setor ou vem sem e-mail. Fica fora do git.       |
| `--legacy-utc-offset=<±hh:mm>` | Fuso das datas gravadas no banco do legado (padrão `+00:00`).                                                                          |
| `--report=<arquivo>`           | Relatório completo em JSON.                                                                                                            |

O relatório mostra quanto entrou de cada assunto e as ocorrências, só com ids e números do legado: `ignorado` (ficou de fora por regra ou decisão), `aviso` (entrou com adaptação) e `falha` (o ticket foi desfeito e entra numa próxima execução). Rodar de novo só acrescenta o que faltou.

**Fuso:** no ensaio, compare a data de abertura de um ticket na tela do legado com a mesma data na central. Se houver 3 horas de diferença, rode com `--legacy-utc-offset=-03:00`.

### Ensaio na homologação

Com o dump do legado (`banco.sql.gz`, gerado por `scripts/migracao/backup-legado.sh`) numa pasta fora do projeto, no Git Bash:

```bash
docker run -d --name legado-ensaio --network central-homologacao_default -e MARIADB_ROOT_PASSWORD=ensaio -e MARIADB_DATABASE=osticket mariadb:10.6
gzip -dc banco.sql.gz | docker exec -i legado-ensaio mariadb -uroot -pensaio osticket
npm run homolog -- down -v
npm run homolog:up
MSYS_NO_PATHCONV=1 npm run homolog -- run --rm -v "<pasta>/agentes.json:/tmp/agentes.json:ro" -e LEGACY_DATABASE_URL=mysql://root:ensaio@legado-ensaio:3306/osticket api node dist/legacy-import/scripts/import-legacy.js --dry-run --staff-emails=/tmp/agentes.json
```

Sem ocorrências inesperadas, repita sem `--dry-run` e confira pelo checklist [Depois da importação](#depois-da-importação). Ao terminar, `docker rm -f legado-ensaio`.

### No servidor

Na janela de troca ([deploy-servidor.md](deploy-servidor.md)), com a aplicação do legado parada e o banco dele no ar, `compose` sendo o comando do guia de deploy:

```bash
sudo docker network connect central-manutencao_interna <contêiner do banco do legado>
compose run --rm -v <pasta>/agentes.json:/tmp/agentes.json:ro -e LEGACY_DATABASE_URL='mysql://<usuário>:<senha>@<contêiner do banco do legado>:3306/<banco>' api node dist/legacy-import/scripts/import-legacy.js --staff-emails=/tmp/agentes.json --dry-run
```

Usuário, senha e banco são os do `.env` do legado; caracteres especiais da senha vão codificados na URL (`#` → `%23`, `@` → `%40`). Confira o relatório, repita sem `--dry-run` e, no fim, `sudo docker network disconnect central-manutencao_interna <contêiner do banco do legado>`.

## Senhas

- **bcrypt** (`$2a$`, `$2b$`, `$2y$`): importe o hash como está. O primeiro login confere com bcrypt, grava a senha com Argon2id e, se ela não atende à política atual (8 caracteres, maiúscula, número e especial), leva para a tela de troca obrigatória.
- **Outro formato** (MD5 antigo, vazio): grave um hash Argon2id aleatório e a pessoa usa **Esqueci minha senha**.

## Fica de fora

| Dado                                             | Motivo                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| Data de nascimento                               | Não usada; minimização exigida pela LGPD           |
| IP, origem do ticket (Web/E-mail), fuso e idioma | Sem uso neste sistema                              |
| Departamentos, tópicos, SLA e status do osTicket | Substituídos pelas regras deste sistema            |
| Assinatura, telefones e permissões dos agentes   | Sem uso; os papéis vêm de `isadmin`                |
| Funções específicas do osTicket                  | Este sistema substitui o fluxo; só os dados migram |
| Anexos da conversa                               | Recuperados por um script à parte                  |
| Eventos da conversa (`ost_thread_event`)         | Controle interno do osTicket, sem uso aqui         |

## Decisões

| Assunto                                                              | Decisão                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Funções específicas do legado                                        | Não migram; só os dados                                                                                     |
| Prioridade baixa                                                     | Vira `normal`; o sistema segue com normal, alta e urgente                                                   |
| Tickets iniciais sem NF ou inconsistentes                            | Importados como estão; a nota guardada fora do sistema é anexada na migração quando houver                  |
| E-mail dos agentes                                                   | Login com o e-mail próprio; avisos ao setor na caixa de `MAINTENANCE_INBOX_EMAIL`                           |
| Anexos da conversa                                                   | Recuperados por um script à parte, fora desta importação                                                    |
| Usuários sem CPF/CNPJ ou e-mail válido                               | Não migram, nem os tickets deles; são cadastros fora de uso                                                 |
| Conta compartilhada do setor (08/10/2026)                            | Entra desativada, só como autora das respostas antigas                                                      |
| Cliente com CPF/CNPJ inválido, mesmo com ticket recente (08/10/2026) | Fica de fora com o ticket; se o dado chegar depois, uma nova execução contra o backup do legado traz só ele |

## Depois da importação

1. Conferir as quantidades por tabela contra o legado (tickets, equipamentos, fotos, documentos, mensagens, notas), descontando os cadastros que não migram e os tickets deles.
2. Na fila, filtrar **Documentação pendente**: devem aparecer os chamados que no legado estavam "NF com erro" ou "sem NF".
3. Buscar alguns números antigos na fila e abrir no portal com uma conta de cliente.
4. Entrar com uma conta importada (senha antiga) e confirmar a conversão.
