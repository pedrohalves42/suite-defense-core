#!/bin/bash

# scripts/debug-tests.sh
# Optimized test runner with fail-fast and priority sorting.

echo "🚀 Starting Priority Tests (Fail-Fast)..."

# Priority 1: Auth & User Creation
echo "📦 Testing priority modules: auth, admin..."

PRIORITY_TESTS=(
  "supabase/functions/__tests__/auth/"
  "supabase/functions/__tests__/admin/admin-create-user.test.ts"
)

for test_path in "${PRIORITY_TESTS[@]}"; do
  if [ -e "$test_path" ]; then
    echo "🔍 Running: $test_path"
    deno test --allow-all --fail-fast "$test_path" || { echo "❌ Critical failure in $test_path. Stopping."; exit 1; }
  else
    echo "⚠️ Path not found: $test_path"
  fi
done

# Priority 2: Core Infrastructure
echo "🏃 Running remaining tests..."
deno test --allow-all --fail-fast supabase/functions/__tests__/ || { echo "❌ Failure in remaining tests."; exit 1; }

echo "✅ All critical tests passed!"
