# Deploy no servidor

Como a Central de Manutenção sobe no servidor, no lugar do sistema anterior: atrás do Traefik que já está lá, com backup diário. A validação das funções acontece antes, na [homologação](homologacao-docker.md), e a carga dos dados segue o [guia de migração](migracao-sistema-anterior.md).

## Como fica

```
navegador ──HTTPS──▶ Traefik ──HTTP──▶ web (Caddy) ──▶ api ──▶ postgres
                    (certificado)      portal + /api           (rede interna)
```

| Serviço    | Papel                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| `web`      | Portal e proxy da API (`docker/caddy/Caddyfile.producao`). É o único na rede do Traefik. |
| `api`      | API, com o termo de garantia montado só para leitura.                                    |
| `migrate`  | Aplica as migrations a cada subida e termina.                                            |
| `postgres` | Banco, sem porta publicada.                                                              |

Volumes: `pgdata` (banco) e `files` (fotos, vídeos, XML e declarações). Os dois entram no backup.

O Traefik cuida do certificado e repassa o IP do cliente. A Caddy só aceita esse dado vindo da rede privada dos contêineres, e a API confia nos dois saltos (`TRUST_PROXY_HOPS=2`). Assim o limite de requisições por IP vale por cliente, e não para todos juntos.

## O que vai para o servidor

1. **O código:** clone do repositório numa pasta nova, com nome diferente da pasta do legado:

   ```bash
   sudo git clone <url do repositório> <pasta da central>
   ```

2. **O que fica fora do git**, copiado pela pasta Samba para os mesmos caminhos dentro da pasta da central:

   | Arquivo                              | O que é                                                   |
   | ------------------------------------ | --------------------------------------------------------- |
   | `docker/producao.env`                | Configuração do servidor, com senhas e chaves             |
   | `apps/api/legal/termo-garantia.json` | Texto do termo de garantia que o cliente aceita no portal |
   | `apps/web/public/brand/`             | Logos da marca, usados no build do portal                 |

## 1. Configuração do Traefik

O compose precisa de três dados do Traefik do servidor. Para descobrir, veja como outro serviço publicado por ele está configurado:

```bash
sudo docker network ls
sudo docker inspect <contêiner publicado pelo Traefik> --format '{{json .Config.Labels}}'
```

| Variável               | Onde aparece                                                            |
| ---------------------- | ----------------------------------------------------------------------- |
| `TRAEFIK_NETWORK`      | `traefik.docker.network`, ou a rede em comum com o contêiner do Traefik |
| `TRAEFIK_ENTRYPOINT`   | `traefik.http.routers.<nome>.entrypoints` (geralmente `websecure`)      |
| `TRAEFIK_CERTRESOLVER` | `traefik.http.routers.<nome>.tls.certresolver`                          |

Se a TI instalar o certificado do domínio como arquivo, sem emissor (`certresolver`), a linha `tls.certresolver` sai do `docker-compose.producao.yml`.

## 2. `docker/producao.env`

Parta de `docker/producao.env.example`. Os campos vazios são obrigatórios: sem eles, o compose ou a API recusam subir e dizem o que falta.

| Campo                                        | O que pôr                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `APP_DOMAIN`                                 | Domínio público, sem `https://`                                                        |
| `TRAEFIK_*`                                  | Os três valores do passo 1                                                             |
| `POSTGRES_PASSWORD`                          | Senha longa e aleatória (`openssl rand -base64 32`). Não muda depois do primeiro `up`. |
| `SMTP_*`, `MAIL_FROM`                        | Servidor de e-mail real do setor                                                       |
| `MAINTENANCE_INBOX_EMAIL`                    | Caixa do setor, que recebe todos os avisos da equipe                                   |
| `INVOICE_RECIPIENT_DOCUMENT`                 | CNPJ da fábrica, destinatário das notas de remessa                                     |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Chaves do widget do Turnstile criado para o domínio no painel da Cloudflare            |

Em todos os comandos abaixo, `compose` quer dizer, dentro da pasta da central:

```bash
sudo docker compose -f docker-compose.producao.yml --env-file docker/producao.env
```

## 3. Preparar, com o legado ainda no ar

A `web` só sobe na troca. Antes disso, nada responde no domínio, e o legado continua atendendo.

1. Construir as imagens e subir banco e API:

   ```bash
   compose up -d --build --wait postgres migrate api
   ```

2. Criar o primeiro administrador. A senha provisória aparece uma vez no terminal:

   ```bash
   compose exec api node dist/identity/scripts/create-admin.js --email <e-mail> --name "<nome completo>"
   ```

3. Ensaiar a importação. A aplicação de migração entra na rede interna da central, sem expor o banco:

   ```bash
   sudo docker run --rm --network central-manutencao_interna -e DATABASE_URL=postgres://central:<senha>@postgres:5432/central <imagem da migração>
   ```

   Para recomeçar do zero, `compose down -v` apaga banco e arquivos.

## 4. Troca do sistema

O legado e a central respondem pelo mesmo domínio. **Os dois nunca ficam no ar ao mesmo tempo**: o Traefik dividiria os acessos entre eles.

1. Avise os usuários da janela de manutenção.
2. Faça o backup do legado ([abaixo](#backup-do-legado)).
3. Pare só a aplicação do legado. O banco dele continua no ar para a importação. Anote a política de reinício e desligue-a: com `always`, o Docker religaria o legado depois de um reinício do servidor, e os dois voltariam a disputar o domínio.

   ```bash
   sudo docker inspect <contêiner da aplicação do legado> --format '{{.HostConfig.RestartPolicy.Name}}'
   sudo docker update --restart=no <contêiner da aplicação do legado>
   sudo docker stop <contêiner da aplicação do legado>
   ```

4. Rode a importação final e confira o resultado ("Depois da importação" no guia de migração).
5. Suba a web. O Traefik passa a entregar o domínio à central:

   ```bash
   compose up -d --wait web
   ```

6. Abra o domínio, entre com o administrador e com uma conta importada.
7. Ative o backup diário ([abaixo](#backup-da-central)).

**Volta atrás**, se algo der errado na troca: pare a central e religue o legado com a política de reinício anotada no passo 3. Nada do legado foi apagado.

```bash
compose stop web
sudo docker update --restart=<política anotada> <contêiner da aplicação do legado>
sudo docker start <contêiner da aplicação do legado>
```

## Backups

### Backup do legado

Antes da troca, guarde o legado inteiro. Nada dele vem para este repositório: o dump tem dados reais e senhas.

```bash
cd <pasta da central>/scripts/migracao
sudo bash backup-legado.sh -p <pasta do projeto do legado>
```

- **Banco:** `banco.sql.gz`, dump completo do MariaDB. Os anexos do osTicket ficam no próprio banco, então vão junto. O script confere se o dump terminou.
- **Pasta do projeto:** `pasta-do-projeto.tar.gz`, com o compose, o `.env` e os arquivos locais do legado. A subpasta `backups/` fica de fora.
- **Destino:** `~/backup-legado/<data>/`, legível só pelo seu usuário, com `SHA256SUMS`.

Copie a pasta para fora do servidor e confira a cópia com `sha256sum -c SHA256SUMS`. Ela é o plano de volta definitivo, se o legado precisar ser reconstruído.

### Backup da central

```bash
sudo bash <pasta da central>/scripts/backup/backup-central.sh
```

Cada execução cria `/var/backups/central-manutencao/<data>/`, legível só pelo root, com:

| Arquivo               | Conteúdo                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `banco.dump`          | Banco inteiro, no formato do `pg_restore` (conferido depois de gerado)   |
| `arquivos.tar.gz`     | Fotos, vídeos, XML e declarações dos chamados                            |
| `configuracao.tar.gz` | `docker/producao.env`, termo de garantia e logos: o que fica fora do git |
| `SHA256SUMS`          | Conferência dos três                                                     |

Backups com mais de 14 dias são apagados (`-r <dias>` muda a retenção; `-d <pasta>` muda o destino).

**Todo dia às 2h30**, pelo cron do sistema:

```bash
echo '30 2 * * * root bash <pasta da central>/scripts/backup/backup-central.sh >> /var/log/central-manutencao-backup.log 2>&1' | sudo tee /etc/cron.d/central-manutencao-backup
```

O backup no mesmo disco não protege contra a perda do servidor: combine com a TI uma cópia de `/var/backups/central-manutencao` para outro lugar.

### Restaurar um backup

Com a aplicação parada (`compose stop web api`) e o backup em `<backup>`:

```bash
compose exec -T postgres pg_restore -U central -d central --clean --if-exists --no-owner < <backup>/banco.dump
compose run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /app/apps/api/storage/files/* && tar -xzf - -C /app/apps/api/storage/files' < <backup>/arquivos.tar.gz
compose up -d --wait
```

A configuração (`configuracao.tar.gz`) só é necessária num servidor novo: extraia na pasta da central antes do primeiro `up`.

## Atualizar a aplicação

```bash
cd <pasta da central>
sudo git pull
compose up -d --build --wait
```

As migrations rodam sozinhas antes da API. Rode o backup antes de atualizar.
