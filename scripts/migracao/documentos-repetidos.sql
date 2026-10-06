-- Usuários do sistema anterior com o mesmo CPF/CNPJ (somente leitura).
--
-- Não trava a importação, mas vale conferir: o mesmo documento vira um
-- cliente só, com um contato para cada usuário.

SELECT UPPER(REGEXP_REPLACE(TRIM(v.value), '[.\\-/[:space:]]', '')) AS documento,
       COUNT(DISTINCT fe.object_id) AS usuarios,
       GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ' | ') AS nomes
  FROM ost_form_entry fe
  JOIN ost_form_entry_values v ON v.entry_id = fe.id
  JOIN ost_form_field f ON f.id = v.field_id AND f.name = 'cpf_cnpj'
  JOIN ost_user u ON u.id = fe.object_id
 WHERE fe.object_type = 'U' AND TRIM(COALESCE(v.value, '')) <> ''
 GROUP BY documento
HAVING usuarios > 1;
