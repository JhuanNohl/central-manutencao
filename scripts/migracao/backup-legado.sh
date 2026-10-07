#!/usr/bin/env bash
# Backup completo do sistema anterior (osTicket) antes da troca: o dump do
# banco, que inclui os anexos (o osTicket guarda os arquivos no próprio banco),
# e, com -p, a pasta do projeto no servidor (configuração e arquivos locais).
#
# Uso, no servidor e dentro desta pasta:
#   sudo bash backup-legado.sh [-c contêiner] [-b banco] [-u usuário] [-p pasta do legado] [-o destino]
#
#   -c  contêiner do MariaDB do legado (padrão: o único contêiner MariaDB/MySQL
#       em execução; sem nenhum, usa o MariaDB instalado no servidor)
#   -b  nome do banco (padrão: o configurado no contêiner; no MariaDB
#       instalado, "osticket")
#   -u  só no MariaDB instalado: usuário do banco, com a senha pedida no
#       terminal (padrão: root pelo socket, sem senha)
#   -p  pasta do projeto do legado, ex.: /docker-files/centralmanutencao
#       (a subpasta backups/ fica de fora)
#   -o  destino (padrão: backup-legado na pasta pessoal de quem chamou o sudo)
#
# O backup tem dados reais e senhas do legado: fica só para o dono (chmod 600)
# e nunca vai para o repositório. Guarde uma cópia fora do servidor.
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Última linha que o mariadb-dump/mysqldump escreve quando termina sem erro.
readonly DUMP_COMPLETED_MARK='-- Dump completed'
# shellcheck source=legado-banco.sh
source "${SCRIPT_DIR}/legado-banco.sh"

container=''
database=''
native_user=''
project_dir=''
output_dir=''

usage() {
  sed -n '6,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while getopts 'c:b:u:p:o:h' option; do
  case "$option" in
    c) container="$OPTARG" ;;
    b) database="$OPTARG" ;;
    u) native_user="$OPTARG" ;;
    p) project_dir="$OPTARG" ;;
    o) output_dir="$OPTARG" ;;
    *) usage ;;
  esac
done
if [ -n "$project_dir" ] && [ ! -d "$project_dir" ]; then
  fail "pasta ${project_dir} não encontrada."
fi

describe_source

umask 077
destination="${output_dir:-$(owner_home)/backup-legado}/$(date +%Y%m%d-%H%M)"
mkdir -p "$destination"
# Backup pela metade não pode passar por bom numa restauração.
completed=false
trap '[ "$completed" = true ] || { rm -rf -- "$destination"; echo "Backup incompleto removido." >&2; }' EXIT

dump="${destination}/banco.sql.gz"
legacy_db dump | gzip > "$dump"
# Um dump interrompido parece válido até a restauração: confere o final.
gzip -t "$dump"
zcat "$dump" | tail -n 1 | grep -q -- "$DUMP_COMPLETED_MARK" ||
  fail "o dump não terminou. Confira ${dump} e rode de novo."
echo "  banco: $(du -h "$dump" | cut -f1) → ${dump}"

if [ -n "$project_dir" ]; then
  project="${destination}/pasta-do-projeto.tar.gz"
  tar -czf "$project" --exclude='./backups' -C "$project_dir" .
  echo "  pasta do projeto: $(du -h "$project" | cut -f1) → ${project}"
fi

(cd "$destination" && sha256sum -- * > SHA256SUMS)
completed=true
give_to_owner "$(dirname "$destination")"
echo 'Pronto. Copie a pasta para fora do servidor e confira com: sha256sum -c SHA256SUMS'
