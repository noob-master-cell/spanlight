#!/usr/bin/env bash
# Checks the repository-hygiene files a public repository needs: each one exists and is not
# empty, and every YAML file among them parses.
#
#   scripts/check-repo-files.sh
#
# Exit status: 0 and a final "ok" line, or non-zero with one line per problem.
#
# YAML parsing needs PyYAML. CI runs this under `uv run --no-project --with pyyaml`, which puts a
# Python that has it first on PATH. Set PYTHON to use a different interpreter.
# Written for bash 3.2 (the macOS default), so no bash 4 features.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PYTHON=${PYTHON:-python3}

REQUIRED_FILES=(
  CONTRIBUTING.md
  SECURITY.md
  CODE_OF_CONDUCT.md
  .github/CODEOWNERS
  .github/dependabot.yml
  .github/ISSUE_TEMPLATE/bug_report.yml
  .github/ISSUE_TEMPLATE/feature_request.yml
  .github/ISSUE_TEMPLATE/config.yml
  .github/pull_request_template.md
)

problems=0
yaml_files=()

for path in "${REQUIRED_FILES[@]}"; do
  if [[ ! -e "$REPO_ROOT/$path" ]]; then
    echo "missing: $path"
    problems=$((problems + 1))
  elif [[ ! -s "$REPO_ROOT/$path" ]]; then
    echo "empty: $path"
    problems=$((problems + 1))
  elif [[ "$path" == *.yml || "$path" == *.yaml ]]; then
    yaml_files+=("$path")
  fi
done

# Only files that exist reach this point, so a missing file is reported once, above.
if [[ ${#yaml_files[@]} -gt 0 ]]; then
  if ! "$PYTHON" -c 'import yaml' 2>/dev/null; then
    echo "error: PyYAML is not available to $PYTHON (try: uv run --no-project --with pyyaml bash $0)" >&2
    exit 2
  fi
  for path in "${yaml_files[@]}"; do
    if ! error=$("$PYTHON" -c '
import sys
import yaml

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        yaml.safe_load(handle)
except yaml.YAMLError as exc:
    mark = getattr(exc, "problem_mark", None)
    where = " (line %d)" % (mark.line + 1) if mark else ""
    sys.exit("%s%s" % (getattr(exc, "problem", None) or exc, where))
' "$REPO_ROOT/$path" 2>&1); then
      echo "invalid yaml: $path: $error"
      problems=$((problems + 1))
    fi
  done
fi

if [[ "$problems" -gt 0 ]]; then
  echo "FAIL: $problems problem(s)"
  exit 1
fi

echo "ok"
