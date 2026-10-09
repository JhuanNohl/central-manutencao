# Documentação por etapa

Decisões, regras e entregas da Central de Manutenção, na ordem em que o sistema foi construído. Cada etapa tem uma pasta, e cada subetapa, um arquivo. Os identificadores citados (D, RF, CA, P, E0, E1) vêm do documento de escopo, mantido fora deste repositório.

## 0 — Fundação

| Subetapa                                     | Conteúdo                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [0.1 — Fundação](0-fundacao/0.1-fundacao.md) | Monorepo, identidade e acesso, clientes e contatos, permissões, histórico imutável e fila de avisos (E0) |

## 1 — Abertura do chamado

| Subetapa                                                                                         | Conteúdo                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [1.1 — Visão do agente](1-abertura-do-chamado/1.1-visao-do-agente.md)                            | Fila de chamados da equipe e o de-para visual com o sistema anterior                        |
| [1.2 — Abertura, envio e recebimento](1-abertura-do-chamado/1.2-abertura-envio-e-recebimento.md) | Abertura com fotos e XML da NF-e, envio pelo cliente, recebimento parcial e início do prazo |
| [1.3 — Chamados grandes](1-abertura-do-chamado/1.3-chamados-grandes.md)                          | Chamados de até 200 equipamentos, cada um com as suas fotos                                 |

## 2 — Operação do chamado

| Subetapa                                                                                        | Conteúdo                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [2.1 — Perfis e conversa](2-operacao-do-chamado/2.1-perfis-e-conversa.md)                       | Papéis, responsável, prioridade, cancelamento e conversa entre cliente e equipe |
| [2.2 — Fotos, vídeos e envio pelo celular](2-operacao-do-chamado/2.2-fotos-videos-e-celular.md) | Mídias de cada equipamento e envio pelo celular por QR Code                     |
| [2.3 — Fluxo de etapas](2-operacao-do-chamado/2.3-fluxo-de-etapas.md)                           | Etapas do processo, quem avança cada uma e o prazo do diagnóstico à devolução   |

## 3 — Comunicação e cadastro

| Subetapa                                                                                | Conteúdo                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [3.1 — Avisos por e-mail](3-comunicacao-e-cadastro/3.1-avisos-por-email.md)             | Quem recebe o quê: cliente, caixa do setor e responsável                        |
| [3.2 — Cadastro, senha e termo](3-comunicacao-e-cadastro/3.2-cadastro-senha-e-termo.md) | Cadastro pela equipe, senha forte, máscaras, termo de garantia e campo de senha |

## 4 — Segurança

| Subetapa                                                              | Conteúdo                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| [4.1 — Revisão de segurança](4-seguranca/4.1-revisao-de-seguranca.md) | Controles por superfície, correções e riscos aceitos |

## 5 — Homologação e migração

| Subetapa                                                                                           | Conteúdo                                                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [5.1 — Homologação em contêineres](5-homologacao-e-migracao/5.1-homologacao-em-conteineres.md)     | A aplicação inteira em Docker, com as regras de produção, na rede interna           |
| [5.2 — Migração do sistema anterior](5-homologacao-e-migracao/5.2-migracao-do-sistema-anterior.md) | De-para do osTicket, o comando de importação, o ensaio e as decisões sobre os dados |
| [5.3 — Deploy e troca no servidor](5-homologacao-e-migracao/5.3-deploy-e-troca-no-servidor.md)     | Pacote, Traefik, troca do sistema anterior com volta atrás e backups                |
