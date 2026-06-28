#!/usr/bin/env bash
# D18-2 / HF-TYPES-REGEN-01 — CI guard
# Fails the build if the Deno mirror has drifted from the Vite source of truth.
#
# Fix locally with:
#   bash scripts/sync-database-types.sh
set -euo pipefail

SRC="src/integrations/supabase/types.ts"
DST="supabase/functions/_shared/database.types.ts"

if [[ ! -f "$SRC" || ! -f "$DST" ]]; then
  echo "✗ missing one of the typegen files ($SRC / $DST)" >&2
  exit 1
fi

src_hash="$(sha256sum "$SRC" | awk '{print $1}')"
dst_hash="$(sha256sum "$DST" | awk '{print $1}')"

if [[ "$src_hash" != "$dst_hash" ]]; then
  echo "✗ database.types.ts drift detected" >&2
  echo "    $SRC  $src_hash" >&2
  echo "    $DST  $dst_hash" >&2
  echo "  Run: bash scripts/sync-database-types.sh   (then commit the result)" >&2
  exit 1
fi

echo "✓ database.types.ts mirror in sync ($src_hash)"
