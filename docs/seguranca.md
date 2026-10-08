# Segurança: controles e riscos aceitos

Revisão de 05/10/2026, antes da exposição pública. Lista o que protege cada superfície, o que foi corrigido nesta revisão e o que ficou como decisão pendente ou risco aceito.

## Controles por superfície

| Superfície          | Controle                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL                 | Consultas pelo Drizzle, sempre com parâmetros. Nenhum `sql.raw` com dado do usuário; `ORDER BY` nunca vem da entrada; a busca escapa `%`, `_` e `\` (`containsPattern`).                                              |
| Entrada             | Todo corpo e query validados por zod (`packages/contracts`); JSON até 100 kb; paginação até 100 itens; número do chamado na URL conferido antes do banco (`RmaNumberPipe`).                                           |
| Sessão              | Cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção; token novo a cada login; troca e redefinição de senha encerram as outras sessões; conta desativada perde todas.                                             |
| CSRF                | `OriginGuard`: todo método que altera estado exige a `Origin` do portal; com cookie e sem `Origin`, é recusado.                                                                                                       |
| Autorização         | Permissões por papel (`authorization.ts`) em cada rota; escopo do cliente no serviço, com 404 para registro de outro cliente.                                                                                         |
| Senhas e tokens     | Argon2id (19 MiB, t=2); senha forte obrigatória; tokens de 256 bits guardados como SHA-256, de uso único e com expiração no banco; senha provisória e links saem do banco depois do envio ou da desistência do envio. |
| Robôs               | Cloudflare Turnstile no cadastro e no pedido de redefinição de senha (`@RequireCaptcha()`), validado no servidor e com falha fechada.                                                                                 |
| Rajadas             | Limite por IP: geral (600/min), rotas sensíveis (`AUTH_RATE_LIMIT_PER_MINUTE`) e envio de arquivos (`UPLOAD_RATE_LIMIT_PER_MINUTE`). Redefinição de senha: um e-mail por conta a cada 5 minutos.                      |
| Arquivos            | Tipo pelo conteúdo (assinatura), extensão e tamanho por finalidade; XML sem `DOCTYPE`/`ENTITY`; nome sem caminho, controle nem marcas de direção; chave de armazenamento gerada no servidor; downloads com `nosniff`. |
| Memória e disco     | Envios simultâneos limitados no processo (`UPLOAD_MAX_CONCURRENT`); cota de temporários por conta (150 arquivos, 3 GB); corpo até 110 MB no proxy; limpeza dos temporários vencidos.                                  |
| Banco sob pressão   | Pool com tempo máximo para conseguir conexão, para cada consulta e para transação ociosa: uma conexão presa não trava a API.                                                                                          |
| Cabeçalhos (portal) | CSP só com a própria origem (e a Cloudflare para o Turnstile), `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy` e `Permissions-Policy`, aplicados no Caddy. A API usa o helmet.                           |
| Conexões lentas     | Tempos máximos de leitura de cabeçalho e de corpo no Caddy (slowloris).                                                                                                                                               |
| Erros               | Resposta sem stack, só com `requestId`; o log de requisições não registra corpo, query nem cookies.                                                                                                                   |
| Configuração        | Ambiente validado por zod; produção exige cookie seguro, caixa do setor, CNPJ da fábrica, termo de garantia e chaves do Turnstile.                                                                                    |
| Contêineres         | API sem root e só com dependências de produção; banco e Mailpit publicados apenas em `127.0.0.1`; segredos e termo fora das imagens (`.dockerignore`).                                                                |

## Corrigido nesta revisão

- Envio pelo celular usava uma segunda conexão do pool dentro da transação: com envios simultâneos para o mesmo QR Code, o pool se esgotava e a API parava.
- Envios de arquivos sem teto de memória, sem cota de disco e sem limite próprio de tentativas.
- Mailpit da homologação aberto na rede: mostrava links de redefinição e senhas provisórias a quem acessasse a porta.
- Portal sem cabeçalhos de segurança (clickjacking das telas de administração).
- Pedidos de redefinição de senha podiam inundar a caixa de uma pessoa.
- Senha provisória e links permaneciam no banco quando o envio do e-mail desistia.
- Número de chamado fora do tipo da coluna gerava erro 500.
- XML com aninhamento extremo podia gerar erro 500.

## Decisões de 05/10/2026

| Assunto                          | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autocadastro com CPF/CNPJ alheio | **Risco aceito.** O autocadastro continua sem confirmação de e-mail: a conta nasce ativa com o aceite do termo. Sem essa confirmação, alguém pode se cadastrar com o documento de um cliente real antes dele; o Turnstile e o limite por IP reduzem o abuso em massa, não o caso pontual. Se acontecer, a equipe desativa a conta indevida e, no mesmo cadastro do cliente, inclui o contato legítimo e cria o acesso dele ao portal. |
| Domínio e certificado            | **Com a TI do servidor.** HTTPS com o domínio público da empresa e certificado válido, no lugar da CA local da homologação. Será solicitado ao responsável pelo servidor antes da exposição pública.                                                                                                                                                                                                                                  |

## Riscos aceitos (baixo impacto)

- **Login sem captcha (decisão de 08/10/2026):** o Turnstile saiu do login para não pesar no acesso do dia a dia. No lugar, além do limite por IP, cada e-mail aceita 5 senhas erradas seguidas e fica 15 minutos bloqueado (`LoginAttempts`), inclusive e-mail sem conta, para não revelar quem tem. A contagem fica em memória: reiniciar a API zera.
- **Mensagem clara no cadastro:** o autocadastro informa quando o e-mail ou o documento já existem. Isso revela cadastros, mas evita suporte; o Turnstile e o limite por IP restringem a varredura.
- **Conversa sem paginação:** o limite geral de requisições restringe o volume; paginar quando houver conversas longas.
- **Imagens sem digest fixo** (`node:24-alpine`, `caddy:2-alpine`, `mailpit`): fixar no pipeline de deploy.
- **Cookie sem prefixo `__Host-`:** a origem única e o `Path=/` já evitam a sobreposição por subdomínio.
