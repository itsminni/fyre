#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"
cd "$repository_root"

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-appwrite-functions.sh --confirm-project PROJECT_ID [--env PATH] [--function-id ID ...] [--force]

Deploys and activates all tracked Appwrite functions after tests and target verification.
--function-id limits deployment to selected manifest IDs, preserving manifest order.
--force is opt-in and skips Appwrite CLI warnings and confirmations, including destructive ones.
USAGE
}

confirmed_project_id=""
env_path=".env"
force_push=false
selected_function_ids=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --function-id)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      selected_function_ids="${selected_function_ids},$2"
      shift 2
      ;;
    --confirm-project)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      confirmed_project_id="$2"
      shift 2
      ;;
    --confirm-project=*)
      confirmed_project_id="${1#*=}"
      shift
      ;;
    --env)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      env_path="$2"
      shift 2
      ;;
    --env=*)
      env_path="${1#*=}"
      shift
      ;;
    --force)
      force_push=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$confirmed_project_id" ]]; then
  echo "--confirm-project with the exact target project ID is required." >&2
  exit 2
fi

if ! command -v appwrite >/dev/null 2>&1; then
  echo "Appwrite CLI is required: https://appwrite.io/docs/tooling/command-line/installation" >&2
  exit 1
fi

if [[ "$env_path" != /* ]]; then
  env_path="$repository_root/$env_path"
fi

if [[ ! -f "$env_path" ]]; then
  echo "Create an ignored environment file from .env.example and replace every live value locally." >&2
  exit 1
fi

npm --prefix functions test
ruby scripts/secure_appwrite_endpoint.test.rb
ruby scripts/prepare-appwrite-config.rb --check "$env_path"
ruby scripts/prepare-appwrite-config.rb "$env_path"

configured_project_id="$(ruby -rjson -e 'print JSON.parse(File.read(ARGV.fetch(0))).fetch("projectId")' appwrite.config.json)"
if [[ "$confirmed_project_id" != "$configured_project_id" ]]; then
  echo "Project confirmation does not match the generated Appwrite configuration." >&2
  exit 1
fi

function_ids="$(ruby -rjson -e '
  ids = JSON.parse(File.read(ARGV.fetch(0))).map { |function| function.fetch("$id") }
  requested = ARGV.fetch(1).split(",").reject(&:empty?)
  abort("Unknown function ID requested") unless (requested - ids).empty?
  puts(requested.empty? ? ids : ids.select { |id| requested.include?(id) })
' appwrite/functions.local.json "$selected_function_ids")"

appwrite whoami >/dev/null
project_preflight="$(mktemp "${TMPDIR:-/tmp}/fyre-appwrite-project.XXXXXX")"
trap 'rm -f -- "$project_preflight"' EXIT
appwrite project get --json >"$project_preflight"
remote_project_id="$(ruby -rjson -e 'print JSON.parse(File.read(ARGV.fetch(0))).fetch("$id")' "$project_preflight")"
if [[ "$remote_project_id" != "$configured_project_id" ]]; then
  echo "The Appwrite CLI session is connected to a different project." >&2
  exit 1
fi

appwrite_flags=(--with-variables --activate true)
if [[ "$force_push" == true ]]; then
  appwrite_flags+=(--force)
fi

push_help="$(appwrite push functions --help)"
if [[ "$push_help" == *"--function-id"* ]]; then
  while IFS= read -r function_id; do
    appwrite push functions --function-id "$function_id" "${appwrite_flags[@]}" <&3
  done 3<&0 <<< "$function_ids"
elif [[ "$push_help" == *"--all"* && -z "$selected_function_ids" ]]; then
  appwrite push functions --all "${appwrite_flags[@]}"
else
  echo "Unsupported Appwrite CLI: expected --function-id or --all for function deployment." >&2
  exit 1
fi
