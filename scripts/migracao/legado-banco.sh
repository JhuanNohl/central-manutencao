# Acesso ao banco do sistema anterior (osTicket), comum aos scripts desta
# pasta. Não é executado sozinho: os scripts o carregam com `source`.
#
# Quem carrega define `container`, `database` e `native_user` (opções -c, -b
# e -u) e chama `legacy_db client` (lê SQL da entrada) ou `legacy_db dump`
# (escreve o dump completo na saída).

readonly DB_IMAGE_PATTERN='mariadb|mysql'
readonly NATIVE_DEFAULT_DATABASE='osticket'

fail() {
  echo "Erro: $*" >&2
  exit 1
}

# Pasta pessoal de quem chamou o sudo, para baixar os arquivos pelo MobaXterm.
owner_home() {
  local owner="${SUDO_USER:-$(id -un)}"
  local home
  home="$(getent passwd "$owner" 2>/dev/null | cut -d: -f6 || true)"
  printf '%s' "${home:-$HOME}"
}

# Arquivos gerados com dados reais: só o dono de quem chamou o sudo lê.
give_to_owner() {
  if [ -n "${SUDO_USER:-}" ]; then
    chown -R "$SUDO_USER": "$1"
  fi
}

# Preenche `container` com o único contêiner MariaDB/MySQL em execução. Sem
# Docker ou sem contêiner de banco, fica vazio e o script usa o MariaDB
# instalado no servidor.
find_container() {
  command -v docker >/dev/null || return 0
  docker info >/dev/null 2>&1 ||
    fail "sem acesso ao Docker. Rode com sudo: sudo bash $(basename "$0")"
  local found
  found="$(docker ps --format '{{.Names}} {{.Image}}' |
    grep -Ei " .*(${DB_IMAGE_PATTERN})" | cut -d' ' -f1 || true)"
  if [ "$(printf '%s' "$found" | grep -c .)" -gt 1 ]; then
    echo 'Há mais de um contêiner de banco em execução:' >&2
    printf '  %s\n' $found >&2
    fail 'escolha o do sistema anterior com -c <nome>.'
  fi
  container="$found"
}

describe_source() {
  [ -n "$container" ] || find_container
  if [ -n "$container" ]; then
    echo "Banco do legado: contêiner ${container}"
  else
    echo 'Banco do legado: MariaDB instalado no servidor'
  fi
}

# Executa o cliente (`client`) ou o dump (`dump`) no contêiner, com as
# credenciais que ele já tem no ambiente: root, se houver senha de root;
# senão, o usuário da aplicação. A senha não passa pela linha de comando.
legacy_db_in_container() {
  docker exec -i "$container" sh -c '
    tool="$1"
    case "$tool" in
      client) program="$(command -v mariadb || command -v mysql)" ;;
      dump) program="$(command -v mariadb-dump || command -v mysqldump)" ;;
    esac
    [ -n "$program" ] ||
      { echo "Erro: $3 não é o contêiner do banco (sem cliente MariaDB/MySQL). Rode sem -c para encontrá-lo sozinho." >&2; exit 1; }
    database="${2:-${MARIADB_DATABASE:-${MYSQL_DATABASE:-}}}"
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
    if [ "$tool" = dump ]; then
      exec "$program" --user="$user" --single-transaction --routines \
        --triggers --no-tablespaces --default-character-set=utf8mb4 "$database"
    fi
    exec "$program" --user="$user" --database="$database" \
      --batch --default-character-set=utf8mb4
  ' sh "$1" "$database" "$container"
}

# MariaDB instalado no servidor: com sudo, o root entra pelo socket. Com -u, o
# programa pede a senha no terminal, fora do histórico do shell.
legacy_db_native() {
  local program
  local credentials=(--user=root)
  if [ "$1" = dump ]; then
    program="$(command -v mariadb-dump || command -v mysqldump)" || true
  else
    program="$(command -v mariadb || command -v mysql)" || true
  fi
  [ -n "$program" ] ||
    fail 'nenhum contêiner de banco em execução e nenhum cliente MariaDB instalado. Informe o contêiner com -c <nome>.'
  [ -z "$native_user" ] || credentials=(--user="$native_user" --password)
  local db="${database:-$NATIVE_DEFAULT_DATABASE}"
  if [ "$1" = dump ]; then
    "$program" "${credentials[@]}" --single-transaction --routines \
      --triggers --no-tablespaces --default-character-set=utf8mb4 "$db"
  else
    "$program" "${credentials[@]}" --database="$db" \
      --batch --default-character-set=utf8mb4
  fi
}

legacy_db() {
  if [ -n "$container" ]; then
    legacy_db_in_container "$1"
  else
    legacy_db_native "$1"
  fi
}
