#!/usr/bin/env bash
# Backup da Central de Manutenção no servidor (docker-compose.producao.yml):
# banco, arquivos dos chamados (fotos, vídeos, XML e declarações) e a
# configuração que fica fora do git. Apaga os backups mais antigos que a
# retenção. Feito para rodar todo dia pelo cron (docs/deploy-servidor.md).
#
# Uso, no servidor:
#   sudo bash scripts/backup/backup-central.sh [-d destino] [-r dias]
#
#   -d  destino (padrão: /var/backups/central-manutencao)
#   -r  dias de retenção (padrão: 14)
#
# Restauração: docs/deploy-servidor.md, seção "Restaurar um backup".
set -euo pipefail

readonly PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEFAULT_DESTINATION='/var/backups/central-manutencao'
readonly DEFAULT_RETENTION_DAYS=14
readonly FILES_DIR='/app/apps/api/storage/files'
# Fora do git e necessários para reconstruir o servidor.
readonly LOCAL_CONFIG=(docker/producao.env apps/api/legal/termo-garantia.json apps/web/public/brand)

destination="$DEFAULT_DESTINATION"
retention_days="$DEFAULT_RETENTION_DAYS"

fail() {
  echo "Erro: $*" >&2
  exit 1
}

usage() {
  sed -n '7,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while getopts 'd:r:h' option; do
  case "$option" in
    d) destination="$OPTARG" ;;
    r) retention_days="$OPTARG" ;;
    *) usage ;;
  esac
done
[[ "$retention_days" =~ ^[1-9][0-9]*$ ]] || fail 'a retenção (-r) é um número de dias.'
# A rotação apaga dentro do destino: nunca na raiz nem num caminho relativo.
[[ "$destination" == /* && "$destination" != / ]] ||
  fail 'o destino (-d) precisa ser um caminho absoluto, fora da raiz.'

# ENV_FILE, como no compose, só muda em testes fora do servidor.
compose() {
  docker compose --project-directory "$PROJECT_DIR" \
    -f "${PROJECT_DIR}/docker-compose.producao.yml" \
    --env-file "${ENV_FILE:-${PROJECT_DIR}/docker/producao.env}" "$@"
}

umask 077
target="${destination}/$(date +%Y%m%d-%H%M)"
mkdir -p "$target"
# Backup pela metade não pode passar por bom numa restauração.
completed=false
trap '[ "$completed" = true ] || { rm -rf -- "$target"; echo "Backup incompleto removido." >&2; }' EXIT
echo "Backup em ${target}"

# Formato do pg_restore: restaura tudo ou só parte, e confere o arquivo.
compose exec -T postgres pg_dump -U central -d central -Fc > "${target}/banco.dump"
compose exec -T postgres pg_restore --list < "${target}/banco.dump" > /dev/null ||
  fail 'o dump do banco não pode ser lido. Confira o PostgreSQL e rode de novo.'
echo "  banco: $(du -h "${target}/banco.dump" | cut -f1)"

compose exec -T api tar -czf - -C "$FILES_DIR" . > "${target}/arquivos.tar.gz"
gzip -t "${target}/arquivos.tar.gz"
echo "  arquivos: $(du -h "${target}/arquivos.tar.gz" | cut -f1)"

config=()
for path in "${LOCAL_CONFIG[@]}"; do
  [ -e "${PROJECT_DIR}/${path}" ] && config+=("$path")
done
tar -czf "${target}/configuracao.tar.gz" -C "$PROJECT_DIR" "${config[@]}"
echo "  configuração: ${config[*]}"

(cd "$target" && sha256sum -- * > SHA256SUMS)
completed=true

# Rotação: só as pastas de backup (AAAAMMDD-HHMM) mais antigas que a retenção.
find "$destination" -mindepth 1 -maxdepth 1 -type d \
  -regextype posix-extended -regex '.*/[0-9]{8}-[0-9]{4}' \
  -mtime +"$retention_days" -print -exec rm -rf -- {} + |
  sed 's/^/  removido: /'
echo 'Pronto.'
