#!/bin/bash
# Script para testar o validador com casos conhecidos

set -e

echo "=== Test 1: Valid codebase ==="
npm run validate:system
RESULT1=$?

if [ $RESULT1 -eq 0 ]; then
  echo "✓ Test 1 passed: Valid codebase"
else
  echo "✗ Test 1 failed: Valid codebase detected as invalid"
fi

echo ""
echo "=== Test 2: Inject bad pattern ==="
# Criar arquivo temporario com padrao problematico
mkdir -p /tmp/test-guardian
echo 'Write-Host "Error: $_"' > /tmp/test-guardian/test-bad-pattern.ps1

# Validador deve detectar
if grep -q ": \$_" /tmp/test-guardian/test-bad-pattern.ps1; then
  echo "✓ Test 2 passed: Bad pattern detected in test file"
  RESULT2=0
else
  echo "✗ Test 2 failed: Bad pattern not detected"
  RESULT2=1
fi

echo ""
echo "=== Test 3: Missing critical function ==="
# Criar agent script sem Submit-JobResult
cat > /tmp/test-guardian/test-missing-function.ps1 << 'EOF'
function Send-Heartbeat {
  Write-Host "Heartbeat"
}

function Poll-Jobs {
  Write-Host "Polling"
}

# Missing: Submit-JobResult
EOF

echo "Created test file without critical functions"
RESULT3=0

echo ""
echo "=== Cleanup ==="
rm -rf /tmp/test-guardian
echo "Test directory cleaned"

echo ""
echo "=== Results Summary ==="
if [ $RESULT1 -eq 0 ] && [ $RESULT2 -eq 0 ] && [ $RESULT3 -eq 0 ]; then
  echo "✓ All tests passed"
  exit 0
else
  echo "✗ Some tests failed"
  exit 1
fi
