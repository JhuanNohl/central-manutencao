#!/usr/bin/env bash
# Gera, a partir do banco do sistema anterior (osTicket), as planilhas dos
# cadastros que travariam a importação. Só lê o banco.
#
# Uso, no servidor e dentro desta pasta:
#   sudo bash extrair-cadastros.sh [-c contêiner] [-b banco] [-u usuário] [-o pasta]
#
#   -c  contêiner do MariaDB do legado (padrão: o único contêiner MariaDB/MySQL
#       em execução; sem nenhum, usa o MariaDB instalado no servidor)
#   -b  nome do banco (padrão: o configurado no contêiner; no MariaDB
#       instalado, "osticket")
#   -u  só no MariaDB instalado: usuário do banco, com a senha pedida no
#       terminal (padrão: root pelo socket, sem senha)
#   -o  pasta das planilhas (padrão: migracao-legado na pasta pessoal de quem
#       chamou o sudo)
#
# As planilhas têm dados reais de clientes: ficam só para o dono (chmod 600)
# e não devem ir para o repositório.
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPORTS=(cadastros-bloqueados documentos-repetidos)
readonly DB_IMAGE_PATTERN='mariadb|mysql'
readonly NATIVE_DEFAULT_DATABASE='osticket'

container=''
database=''
native_user=''
output_dir=''

fail() {
  echo "Erro: $*" >&2
  exit 1
}

usage() {
  sed -n '5,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while getopts 'c:b:u:o:h' option; do
  case "$option" in
    c) container="$OPTARG" ;;
    b) database="$OPTARG" ;;
    u) native_user="$OPTARG" ;;
    o) output_dir="$OPTARG" ;;
    *) usage ;;
  esac
done

# Pasta pessoal de quem chamou o sudo, para baixar as planilhas pelo MobaXterm.
owner="${SUDO_USER:-$(id -un)}"
owner_home="$(getent passwd "$owner" 2>/dev/null | cut -d: -f6 || true)"
output_dir="${output_dir:-${owner_home:-$HOME}/migracao-legado}"

# Preenche `container` com o único contêiner MariaDB/MySQL em execução. Sem
# Docker ou sem contêiner de banco, fica vazio e o script usa o MariaDB
# instalado no servidor.
find_container() {
  command -v docker >/dev/null || return 0
  docker info >/dev/null 2>&1 ||
    fail 'sem acesso ao Docker. Rode com sudo: sudo bash extrair-cadastros.sh'
  local found
  found="$(docker ps --format '{{.Names}} {{.Image}}' |
    grep -Ei " .*(${DB_IMAGE_PATTERN})" | cut -d' ' -f1 || true)"
  if [ "$(printf '%s' "$found" | grep -c .)" -gt 1 ]; then
    echo 'Há mais de um contêiner de banco em execução:' >&2
    printf '  %s
' $found >&2
    fail 'escolha o do sistema anterior com -c <nome>.'
  fi
  container="$found"
}

# Executa um .sql no contêiner com as credenciais que ele já tem no ambiente
# (root, se houver senha de root; senão o usuário da aplicação). A senha não
# passa pela linha de comando.
run_in_container() {
  docker exec -i "$container" sh -c '
    client="$(command -v mariadb || command -v mysql)" ||
      { echo "Erro: $2 não é o contêiner do banco (sem cliente MariaDB/MySQL). Rode sem -c para encontrá-lo sozinho." >&2; exit 1; }
    database="${1:-${MARIADB_DATABASE:-${MYSQL_DATABASE:-}}}"
    [ -n "$database" ] ||
      { echo "Erro: informe o banco com -b <nome>." >&2; exit 1; }
    root_password="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
    if [ -n "$root_password" ]; then
      user=root
      MYSQL_PWD="$root_password"
    else
      user="${MARIADB_USER:-${MYSQL_USER:-root}}"
      MYSQL_PWD="${MARIADB_PASSWORD:-${MYSQL_PASSWORD:-}}"
    fi
    export MYSQL_PWD
    exec "$client" --user="$user" --database="$database" \
      --batch --default-character-set=utf8mb4
  ' sh "$database" "$container"
}

# MariaDB instalado no servidor: com sudo, o root entra pelo socket. Com -u, o
# cliente pede a senha no terminal, fora do histórico do shell.
run_native() {
  local client
  local credentials=(--user=root)
  client="$(command -v mariadb || command -v mysql)" ||
    fail 'nenhum contêiner de banco em execução e nenhum cliente MariaDB instalado. Informe o contêiner com -c <nome>.'
  [ -z "$native_user" ] || credentials=(--user="$native_user" --password)
  "$client" "${credentials[@]}" \
    --database="${database:-$NATIVE_DEFAULT_DATABASE}" \
    --batch --default-character-set=utf8mb4
}

# Saída tabulada do cliente → CSV com ";" e BOM, que o Excel abre com acentos.
to_csv() {
  printf '\xEF\xBB\xBF'
  awk -F '\t' -v OFS=';' '{
    for (i = 1; i <= NF; i++) {
      value = $i
      if (value == "NULL") value = ""
      gsub(/\\t/, " ", value)
      gsub(/\\n/, " ", value)
      gsub(/"/, "\"\"", value)
      $i = "\"" value "\""
    }
    print
  }'
}

[ -n "$container" ] || find_container
if [ -n "$container" ]; then
  echo "Banco do legado: contêiner ${container}"
else
  echo 'Banco do legado: MariaDB instalado no servidor'
fi

umask 077
mkdir -p "$output_dir"
stamp="$(date +%Y%m%d-%H%M)"

for report in "${REPORTS[@]}"; do
  sql="${SCRIPT_DIR}/${report}.sql"
  [ -f "$sql" ] || fail "arquivo ${sql} não encontrado."
  csv="${output_dir}/${report}-${stamp}.csv"
  if [ -n "$container" ]; then
    run_in_container < "$sql" | to_csv > "$csv"
  else
    run_native < "$sql" | to_csv > "$csv"
  fi
  rows=$(($(wc -l < "$csv") - 1))
  [ "$rows" -lt 0 ] && rows=0
  echo "  ${report}: ${rows} registro(s) → ${csv}"
done

if [ -n "${SUDO_USER:-}" ]; then
  chown -R "$SUDO_USER": "$output_dir"
fi
echo 'Pronto. Baixe as planilhas e apague a pasta do servidor depois do uso.'
