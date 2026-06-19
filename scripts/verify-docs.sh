#!/usr/bin/env bash
set -euo pipefail

# Documentation consistency verifier for NeoCompanion.
# Run from the repository root.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ERRORS=0

log_error() {
  echo "❌ $1"
  ERRORS=$((ERRORS + 1))
}

# 1. Required root files must exist.
for file in LICENSE CLAUDE.md CONTRIBUTING.md CHANGELOG.md; do
  if [[ ! -f "$file" ]]; then
    log_error "Missing required file: $file"
  fi
done

# 2. No Windows-absolute file:// links in markdown files.
if grep -RniE 'file:///[a-zA-Z]:/' --include='*.md' --exclude-dir=node_modules .; then
  log_error "Found Windows-absolute file:// links in markdown files (see above)"
fi

# 3. No stale product name "NeoAssistant" in markdown files.
if grep -Rni 'NeoAssistant' --include='*.md' --exclude-dir=node_modules .; then
  log_error "Found stale product name 'NeoAssistant' in markdown files (see above)"
fi

# 4. Deprecated user-facing terms should not appear outside migration/glossary docs.
# "宠物" / "桌宠" / "主子" / "小宠" / "Desk-Pet" are allowed only in TERM_MIGRATION_pet_to_assistant.md and GLOSSARY.md.
DEPRECATED_PATTERN='主子|小宠|桌宠|Desk-Pet'
VIOLATIONS=$(grep -RniE "$DEPRECATED_PATTERN" --include='*.md' --exclude-dir=node_modules . | grep -v 'TERM_MIGRATION_pet_to_assistant.md' | grep -v 'GLOSSARY.md' || true)
if [[ -n "$VIOLATIONS" ]]; then
  echo "$VIOLATIONS"
  log_error "Found deprecated user-facing terms in markdown files (see above)"
fi

# "宠物" is also deprecated, but the migration doc title contains it by design; allow that exact title.
PET_VIOLATIONS=$(grep -Rni '宠物' --include='*.md' --exclude-dir=node_modules . | grep -v 'TERM_MIGRATION_pet_to_assistant.md' | grep -v 'GLOSSARY.md' | grep -v '术语迁移方案：pet → assistant' || true)
if [[ -n "$PET_VIOLATIONS" ]]; then
  echo "$PET_VIOLATIONS"
  log_error "Found deprecated term '宠物' in markdown files (see above)"
fi

# 5. README must not claim FTS5 + sqlite-vec is already shipped.
if grep -nE 'SQLite \(Drizzle ORM \+ FTS5\).*sqlite-vec' README.md; then
  log_error "README claims FTS5 + sqlite-vec is shipped; it is currently planned, not implemented"
fi

# 6. TTS error message must reference the real setup doc.
if grep -q 'Xiaomi MiMo TTS console documentation' packages/tts/src/index.ts; then
  log_error "TTS error still references non-existent 'Xiaomi MiMo TTS console documentation'"
fi

if [[ "$ERRORS" -eq 0 ]]; then
  echo "✅ Documentation verification passed."
  exit 0
else
  echo ""
  echo "Found $ERRORS documentation issue(s). Please fix them."
  exit 1
fi
