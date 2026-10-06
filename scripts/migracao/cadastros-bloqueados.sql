-- Clientes do sistema anterior (osTicket) que travariam a importação.
--
-- Somente leitura, para o MariaDB do legado (10.2 ou mais novo). Execute com
-- extrair-cadastros.sh e guarde o resultado FORA deste repositório, porque ele
-- tem dados reais de clientes.
--
-- Mesmas regras da Central de Manutenção:
--   * o cliente é identificado pelo CPF/CNPJ, obrigatório, sem pontuação;
--   * CPF com 11 dígitos e CNPJ com 14 caracteres (o CNPJ alfanumérico tem 12
--     caracteres [0-9A-Z] e 2 dígitos verificadores), conferidos pelos dígitos
--     verificadores;
--   * o e-mail é o login e não pode repetir o de outra conta, inclusive de um
--     agente.
--
-- Uma linha por cliente com problema; `problemas` junta todos os motivos.

WITH RECURSIVE
  posicoes (p) AS (
    SELECT 1
    UNION ALL
    SELECT p + 1 FROM posicoes WHERE p < 13
  ),
  documento_informado AS (
    SELECT fe.object_id AS user_id,
           MAX(NULLIF(TRIM(v.value), '')) AS informado
      FROM ost_form_entry fe
      JOIN ost_form_entry_values v ON v.entry_id = fe.id
      JOIN ost_form_field f ON f.id = v.field_id AND f.name = 'cpf_cnpj'
     WHERE fe.object_type = 'U'
     GROUP BY fe.object_id
  ),
  clientes AS (
    SELECT u.id AS user_id,
           u.name AS nome,
           e.address AS email,
           d.informado,
           UPPER(REGEXP_REPLACE(COALESCE(d.informado, ''), '[.\\-/[:space:]]', '')) AS documento,
           (SELECT COUNT(*) FROM ost_ticket t WHERE t.user_id = u.id) AS tickets,
           EXISTS (SELECT 1 FROM ost_user_account a WHERE a.user_id = u.id) AS tem_conta
      FROM ost_user u
      LEFT JOIN ost_user_email e ON e.id = u.default_email_id
      LEFT JOIN documento_informado d ON d.user_id = u.id
  ),
  -- Soma ponderada de cada dígito verificador, com o valor do caractere igual
  -- ao código ASCII menos 48 (vale para o CNPJ alfanumérico).
  somas AS (
    SELECT c.user_id,
           SUM(CASE WHEN p <= 9 THEN (ASCII(SUBSTRING(c.documento, p, 1)) - 48) * (11 - p) END) AS cpf1,
           SUM(CASE WHEN p <= 10 THEN (ASCII(SUBSTRING(c.documento, p, 1)) - 48) * (12 - p) END) AS cpf2,
           SUM(CASE WHEN p <= 12 THEN (ASCII(SUBSTRING(c.documento, p, 1)) - 48)
                    * (CASE WHEN p <= 4 THEN 6 - p ELSE 14 - p END) END) AS cnpj1,
           SUM((ASCII(SUBSTRING(c.documento, p, 1)) - 48)
               * (CASE WHEN p <= 5 THEN 7 - p ELSE 15 - p END)) AS cnpj2
      FROM clientes c
      JOIN posicoes ON p <= 13
     GROUP BY c.user_id
  ),
  validacao AS (
    SELECT c.*,
           CASE
             WHEN c.documento = '' THEN 'sem CPF/CNPJ'
             WHEN c.documento REGEXP '^[0-9]{11}$' THEN
               CASE
                 WHEN c.documento REGEXP '^(0{11}|1{11}|2{11}|3{11}|4{11}|5{11}|6{11}|7{11}|8{11}|9{11})$'
                   OR MOD(MOD(s.cpf1 * 10, 11), 10) <> SUBSTRING(c.documento, 10, 1)
                   OR MOD(MOD(s.cpf2 * 10, 11), 10) <> SUBSTRING(c.documento, 11, 1)
                 THEN 'CPF inválido (dígitos verificadores)'
               END
             WHEN c.documento REGEXP '^[0-9A-Z]{12}[0-9]{2}$' THEN
               CASE
                 WHEN c.documento = REPEAT(LEFT(c.documento, 1), 14)
                   OR MOD(MOD(s.cnpj1 * 10, 11), 10) <> SUBSTRING(c.documento, 13, 1)
                   OR MOD(MOD(s.cnpj2 * 10, 11), 10) <> SUBSTRING(c.documento, 14, 1)
                 THEN 'CNPJ inválido (dígitos verificadores)'
               END
             ELSE 'CPF/CNPJ com tamanho ou caracteres inválidos'
           END AS problema_documento,
           CASE
             WHEN c.email IS NULL OR TRIM(c.email) = '' THEN 'sem e-mail'
             WHEN c.email NOT REGEXP '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' THEN 'e-mail em formato inválido'
             WHEN EXISTS (SELECT 1 FROM ost_staff st WHERE LOWER(TRIM(st.email)) = LOWER(TRIM(c.email)))
               THEN 'e-mail igual ao de um agente'
           END AS problema_email
      FROM clientes c
      JOIN somas s ON s.user_id = c.user_id
  )
SELECT user_id,
       nome,
       email,
       informado AS cpf_cnpj_informado,
       tickets,
       IF(tem_conta, 'sim', 'não') AS conta_no_portal,
       CONCAT_WS('; ', problema_documento, problema_email) AS problemas
  FROM validacao
 WHERE problema_documento IS NOT NULL OR problema_email IS NOT NULL
 ORDER BY tickets DESC, nome;
