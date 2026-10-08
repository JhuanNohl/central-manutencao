#!/usr/bin/env bash
# Pacote para levar o projeto ao servidor sem git clone: o código da versão
# commitada (git archive) e o que fica fora do git e o servidor precisa.
# Nada de node_modules, builds, dados da homologação ou documentos internos.
#
# Uso (Git Bash, na raiz do projeto):
#   bash scripts/deploy/empacotar.sh [pasta de destino]
#
# O pacote leva o docker/producao.env, com senhas e chaves: transporte e
# guarde com cuidado, e apague a cópia depois de extrair no servidor.
set -euo pipefail

readonly PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Fora do git: configuração do servidor, termo de garantia e logos da marca.
readonly LOCAL_FILES=(docker/producao.env apps/api/legal/termo-garantia.json apps/web/public/brand)

fail() {
  echo "Erro: $*" >&2
  exit 1
}

cd "$PROJECT_DIR"
for path in "${LOCAL_FILES[@]}"; do
  [ -e "$path" ] || fail "${path} não existe; ele é necessário no servidor."
done
git diff --quiet HEAD ||
  fail 'há alterações não commitadas; o pacote leva só a versão commitada.'

destination="${1:-..}"
package="${destination}/central-manutencao-$(git rev-parse --short HEAD).tar.gz"
staging="$(mktemp -d)"
trap 'rm -rf -- "$staging"' EXIT

git archive HEAD | tar -x -C "$staging"
tar -c "${LOCAL_FILES[@]}" | tar -x -C "$staging"
tar --force-local -czf "$package" -C "$staging" .

echo "Pacote: ${package} ($(du -h "$package" | cut -f1))"
echo 'Ele contém o docker/producao.env, com senhas: apague a cópia depois de extrair no servidor.'
