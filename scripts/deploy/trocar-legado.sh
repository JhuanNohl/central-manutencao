#!/usr/bin/env bash
# Troca do sistema anterior (osTicket) pela Central de Manutenção, no servidor,
# na ordem de docs/deploy-servidor.md (seção 4). Pede confirmação antes de
# cada passo que muda alguma coisa.
#
# Uso, no servidor, na pasta da central:
#   sudo bash scripts/deploy/trocar-legado.sh       faz a troca
#   sudo bash scripts/deploy/trocar-legado.sh -r    volta atrás: para a central e religa o legado
#
#   -a  contêiner da aplicação do legado (padrão: osticket-app)
#   -d  contêiner do banco do legado (padrão: osticket-db)
#   -p  pasta do projeto do legado, para o backup (padrão: /docker-files/centralmanutencao)
#   -s  lista de e-mails dos agentes (JSON) para a importação, se houver
#
# A senha do banco do legado é lida do próprio contêiner, como nos scripts de
# scripts/migracao, e não aparece na tela nem na linha de comando.
set -euo pipefail

readonly PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Política de reinício do legado antes da troca, para a volta atrás.
readonly STATE_FILE="${PROJECT_DIR}/.troca-legado"
readonly IMPORT_COMMAND='dist/legacy-import/scripts/import-legacy.js'
readonly LEGACY_DB_PORT=3306
# Sem registro da política anterior, a volta atrás religa assim.
readonly FALLBACK_RESTART_POLICY='unless-stopped'

app='osticket-app'
db='osticket-db'
legacy_dir='/docker-files/centralmanutencao'
staff_emails=''
rollback=false
connected_by_us=false

fail() {
  echo "Erro: $*" >&2
  exit 1
}

usage() {
  sed -n '6,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while getopts 'a:d:p:s:rh' option; do
  case "$option" in
    a) app="$OPTARG" ;;
    d) db="$OPTARG" ;;
    p) legacy_dir="$OPTARG" ;;
    s) staff_emails="$OPTARG" ;;
    r) rollback=true ;;
    *) usage ;;
  esac
done

# ENV_FILE e COMPOSE_PROJECT_NAME, como no compose, só mudam em testes fora do servidor.
compose() {
  docker compose --project-directory "$PROJECT_DIR" \
    -f "${PROJECT_DIR}/docker-compose.producao.yml" \
    --env-file "${ENV_FILE:-${PROJECT_DIR}/docker/producao.env}" "$@"
}
readonly CENTRAL_NETWORK="${COMPOSE_PROJECT_NAME:-central-manutencao}_interna"

step() {
  echo
  echo "== $*"
}

# Só segue com "s"; qualquer outra resposta interrompe sem mudar mais nada.
confirm() {
  local answer
  read -r -p "$1 [s/N] " answer
  [[ "$answer" =~ ^[sS]$ ]] || fail "interrompido por você. ${2:-Nada mais foi alterado.}"
}

running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]
}

central_running() {
  compose ps --status running --services 2>/dev/null | grep -qx "$1"
}

urlencode() {
  local LC_ALL=C text="$1" encoded='' char index
  for ((index = 0; index < ${#text}; index++)); do
    char="${text:index:1}"
    case "$char" in
      [a-zA-Z0-9.~_-]) encoded+="$char" ;;
      *) encoded+="$(printf '%%%02X' "'$char")" ;;
    esac
  done
  printf '%s' "$encoded"
}

# Endereço do banco do legado com as credenciais que o contêiner já tem: root,
# se houver senha de root; senão, o usuário da aplicação.
legacy_database_url() {
  local credentials user password database
  credentials="$(docker exec "$db" sh -c '
    root="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
    if [ -n "$root" ]; then
      printf "root\n%s\n" "$root"
    else
      printf "%s\n%s\n" "${MARIADB_USER:-${MYSQL_USER:-}}" "${MARIADB_PASSWORD:-${MYSQL_PASSWORD:-}}"
    fi
    printf "%s\n" "${MARIADB_DATABASE:-${MYSQL_DATABASE:-}}"')"
  { IFS= read -r user; IFS= read -r password; IFS= read -r database; } <<<"$credentials"
  [ -n "$user" ] && [ -n "$database" ] ||
    fail "não foi possível ler usuário e banco no contêiner ${db}."
  printf 'mysql://%s:%s@%s:%s/%s' "$(urlencode "$user")" \
    "$(urlencode "$password")" "$db" "$LEGACY_DB_PORT" "$(urlencode "$database")"
}

# O banco do legado entra na rede interna da central só durante a importação.
connect_legacy_db() {
  if docker inspect -f '{{json .NetworkSettings.Networks}}' "$db" |
    grep -q "\"${CENTRAL_NETWORK}\""; then
    return
  fi
  docker network connect "$CENTRAL_NETWORK" "$db"
  connected_by_us=true
}

disconnect_legacy_db() {
  if [ "$connected_by_us" = true ]; then
    docker network disconnect "$CENTRAL_NETWORK" "$db" >/dev/null 2>&1 || true
    connected_by_us=false
  fi
}
trap disconnect_legacy_db EXIT

# Importação no contêiner da API; a URL vai pelo ambiente, não pela linha de comando.
run_import() {
  local mount=() options=()
  if [ -n "$staff_emails" ]; then
    mount=(-v "$(realpath "$staff_emails"):/tmp/agentes.json:ro")
    options=(--staff-emails=/tmp/agentes.json)
  fi
  LEGACY_DATABASE_URL="$(legacy_database_url)" compose run --rm \
    "${mount[@]}" -e LEGACY_DATABASE_URL api \
    node "$IMPORT_COMMAND" "$@" "${options[@]}"
}

check_access() {
  docker info >/dev/null 2>&1 ||
    fail 'sem acesso ao Docker. Rode com sudo.'
  [ -f "${ENV_FILE:-${PROJECT_DIR}/docker/producao.env}" ] ||
    fail 'docker/producao.env não encontrado na pasta da central.'
  docker inspect "$app" >/dev/null 2>&1 ||
    fail "contêiner ${app} não encontrado; informe o da aplicação do legado com -a."
}

roll_back() {
  check_access
  local policy="$FALLBACK_RESTART_POLICY"
  if [ -f "$STATE_FILE" ]; then
    policy="$(cut -d= -f2 "$STATE_FILE")"
  else
    echo "Aviso: sem registro da política de reinício; o legado volta com ${policy}."
  fi
  step "Volta atrás: parar a web da central e religar ${app} (reinício: ${policy})"
  confirm 'Confirmar a volta atrás?'
  compose stop web
  docker update --restart="$policy" "$app" >/dev/null
  docker start "$app" >/dev/null
  rm -f "$STATE_FILE"
  echo 'Legado de volta no domínio. Banco e arquivos da central seguem guardados.'
  echo 'Se o legado voltar a ser usado por dias, zere a central antes da próxima troca (docs/deploy-servidor.md).'
}

prepare_central() {
  if central_running api; then return; fi
  step 'Subir banco e API da central (o legado continua no ar; o domínio não muda)'
  confirm 'Construir as imagens e subir banco e API?'
  compose up -d --build --wait postgres migrate api
}

back_up_legacy() {
  step "Backup do legado: banco (${db}) e pasta ${legacy_dir}"
  [ -d "$legacy_dir" ] || fail "pasta ${legacy_dir} não encontrada; informe a do legado com -p."
  confirm 'Fazer o backup do legado agora?'
  bash "${PROJECT_DIR}/scripts/migracao/backup-legado.sh" -c "$db" -p "$legacy_dir"
}

rehearse_import() {
  step 'Ensaio da importação (--dry-run): confere tudo e não grava nada'
  connect_legacy_db
  run_import --dry-run || true
  confirm 'O relatório acima está como esperado? Seguir para a parada do legado?'
}

stop_legacy() {
  local policy
  policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$app")"
  step "Parar ${app} (reinício atual: ${policy}). O banco do legado continua no ar."
  confirm 'Parar a aplicação do legado? O domínio fica fora do ar até a central subir.'
  # Numa segunda tentativa, o registro guarda a política de antes da primeira.
  [ -f "$STATE_FILE" ] || echo "${app}=${policy}" >"$STATE_FILE"
  docker update --restart=no "$app" >/dev/null
  docker stop "$app" >/dev/null
}

import_for_real() {
  local undo='Para religar o legado: sudo bash scripts/deploy/trocar-legado.sh -r'
  step 'Importação real'
  if ! run_import; then
    confirm 'Houve falhas no relatório acima. Subir a central mesmo assim? (Os tickets com falha entram numa próxima execução.)' "$undo"
  fi
}

start_web() {
  step 'Subir a web: o Traefik passa a entregar o domínio à central'
  compose up -d --wait web
}

swap() {
  check_access
  running "$db" || fail "o banco do legado (${db}) não está rodando."
  if central_running web; then
    fail 'a web da central já está no ar; a troca já foi feita. Para desfazer, use -r.'
  fi
  prepare_central
  back_up_legacy
  rehearse_import
  stop_legacy
  import_for_real
  disconnect_legacy_db
  start_web
  echo
  echo 'Troca concluída. Próximos passos:'
  echo '  1. Abra o domínio e entre com uma conta de agente e uma de cliente.'
  echo '  2. Ative o backup diário (docs/deploy-servidor.md, "Backup da central").'
  echo '  3. Se algo der errado: sudo bash scripts/deploy/trocar-legado.sh -r'
}

if [ "$rollback" = true ]; then roll_back; else swap; fi
