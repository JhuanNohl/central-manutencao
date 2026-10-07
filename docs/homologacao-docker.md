# Homologação interna em contêineres

Roda a aplicação inteira em Docker, com as regras de produção: build de produção, `NODE_ENV=production`, HTTPS e cookie seguro. Serve para validar as funções na rede interna antes do deploy no servidor. Fica separada do ambiente de desenvolvimento (`docker-compose.yml`): os dois podem rodar ao mesmo tempo.

## O que sobe

| Serviço    | Imagem                               | Papel                                                                                      |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `postgres` | `postgres:18-alpine`                 | Banco. Porta só local (`127.0.0.1:5434`), para importar os dados do sistema atual.         |
| `migrate`  | `central-manutencao-api:homologacao` | Aplica as migrations e termina. A API só sobe depois.                                      |
| `api`      | `central-manutencao-api:homologacao` | API NestJS e fila de e-mails. Arquivos enviados no volume `files`.                         |
| `web`      | `central-manutencao-web:homologacao` | Caddy: portal (SPA), proxy de `/api` e HTTPS com certificado da CA local. Porta `8443`.    |
| `mailpit`  | `axllent/mailpit`                    | Caixa de teste: todos os e-mails ficam em http://localhost:8026 e não chegam aos clientes. |

As imagens saem de `docker/Dockerfile` (alvos `api` e `web`). A API roda sem root e só com dependências de produção.

## Antes de subir

1. **Configuração:** copie `docker/homologacao.env.example` para `docker/homologacao.env` (fora do git) e preencha:
   - `APP_HOST` e `HTTPS_PORT`: o IP da máquina na rede e a porta. O portal fica em `https://APP_HOST:HTTPS_PORT`, por exemplo `https://192.168.0.10:8443`. Computador e celular acessam pelo mesmo endereço, e a API recusa outras origens.
   - `POSTGRES_PASSWORD`: uma senha longa.
   - `INVOICE_RECIPIENT_DOCUMENT`: o CNPJ da fábrica, destinatário das notas de remessa.
   - `MAIL_FROM` e `MAINTENANCE_INBOX_EMAIL`.
   - `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`: chaves do Cloudflare Turnstile (anti-robô do login, do cadastro e da redefinição de senha). Na homologação valem as chaves de teste da Cloudflare, já no exemplo, que sempre aprovam. No servidor, crie um widget no painel da Cloudflare para o domínio e use as chaves dele; a chave secreta nunca vai para o navegador nem para o git.
2. **Termo de garantia:** `apps/api/legal/termo-garantia.json` precisa existir. Em produção, a API não sobe sem ele. O arquivo é montado no contêiner e não entra na imagem.
3. **Marca:** com os arquivos em `apps/web/public/brand/`, o build da web usa a marca real, como no `npm run build`. As imagens ficam só nesta máquina: **não publique em registro público**.
4. **Firewall:** para o celular acessar, libere a porta `8443` (TCP) na rede privada do Windows.

## Comandos

```bash
npm run homolog:up
```

Constrói as imagens, aplica as migrations e espera todos os serviços ficarem saudáveis. Outros comandos:

| Comando                          | O que faz                                            |
| -------------------------------- | ---------------------------------------------------- |
| `npm run homolog -- ps`          | Situação de cada serviço                             |
| `npm run homolog -- logs -f api` | Log da API                                           |
| `npm run homolog:down`           | Para tudo e **mantém** os dados                      |
| `npm run homolog -- down -v`     | Para tudo e **apaga** banco, arquivos e certificados |

### Primeiro administrador

Um ambiente novo não tem quem convide. Crie o primeiro administrador pela linha de comando:

```bash
npm run homolog -- exec api node dist/identity/scripts/create-admin.js --email admin@empresa.com.br --name "Nome Completo"
```

A senha provisória aparece uma única vez no terminal e precisa ser trocada no primeiro acesso. Os demais integrantes entram por convite (`/admin/convites`), e os clientes pelo autocadastro ou pelo cadastro da equipe.

Em desenvolvimento, o mesmo comando é `npm run admin:create -w @central/api -- --email … --name …`.

### Dados sintéticos (opcional)

Para testar com dados de exemplo antes da migração, rode o seed **em modo de desenvolvimento** dentro do contêiner:

```bash
npm run homolog -- run --rm -e NODE_ENV=development api node dist/database/scripts/seed.js
```

As contas sintéticas usam a senha conhecida do README. Antes de importar os dados reais, apague tudo com `npm run homolog -- down -v` e suba de novo.

## Certificado HTTPS

O Caddy emite o certificado com uma CA própria, e o navegador mostra um aviso no primeiro acesso. Para validar, basta prosseguir. Para tirar o aviso, instale a CA como confiável no computador e no celular:

```bash
npm run homolog -- cp web:/data/caddy/pki/authorities/local/root.crt ./caddy-homologacao.crt
```

O arquivo fica no volume `caddy-data` e continua o mesmo entre reinícios. No servidor, o certificado vem do domínio público (Traefik), e esta CA não é usada.

## E-mails

Por padrão, tudo vai para o Mailpit (http://localhost:8026), inclusive a caixa do setor. Para validar o envio real, troque `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` e `SMTP_PASSWORD` no `docker/homologacao.env` e reinicie a API:

```bash
npm run homolog -- up -d api
```

Com o SMTP real, os e-mails chegam de verdade a qualquer endereço cadastrado.

## Migração dos dados do sistema atual

O banco da homologação aceita conexões em `127.0.0.1:5434` (usuário `central`, banco `central`, senha do `homologacao.env`). Com o dump e a descrição do sistema atual, a importação será feita por script, nesta ordem: clientes e contatos, contas, atendimentos e itens. Assim ninguém precisa recadastrar nada à mão. O script será validado aqui antes de rodar no servidor.

## Segurança

Os controles, o que foi corrigido na revisão de 05/10/2026 e as decisões tomadas estão em [seguranca.md](seguranca.md).

## Diferenças para o servidor

O servidor usa outro compose, atrás do Traefik, com o SMTP real, sem Mailpit e com backup diário: veja [deploy-servidor.md](deploy-servidor.md).
