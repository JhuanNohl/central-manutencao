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
# shellcheck source=legado-banco.sh
source "${SCRIPT_DIR}/legado-banco.sh"

container=''
database=''
native_user=''
output_dir=''

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
output_dir="${output_dir:-$(owner_home)/migracao-legado}"

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

describe_source

umask 077
mkdir -p "$output_dir"
stamp="$(date +%Y%m%d-%H%M)"

for report in "${REPORTS[@]}"; do
  sql="${SCRIPT_DIR}/${report}.sql"
  [ -f "$sql" ] || fail "arquivo ${sql} não encontrado."
  csv="${output_dir}/${report}-${stamp}.csv"
  legacy_db client < "$sql" | to_csv > "$csv"
  rows=$(($(wc -l < "$csv") - 1))
  [ "$rows" -lt 0 ] && rows=0
  echo "  ${report}: ${rows} registro(s) → ${csv}"
done

give_to_owner "$output_dir"
echo 'Pronto. Baixe as planilhas e apague a pasta do servidor depois do uso.'
