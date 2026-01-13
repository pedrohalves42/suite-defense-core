#!/bin/bash
# =============================================================================
# CI Guard: Validate jsPDF uses dynamic imports
# =============================================================================
# This test ensures jsPDF and jspdf-autotable are imported dynamically
# to avoid test/build issues with ES modules.
# =============================================================================

set -e

echo "Checking for static jsPDF imports..."

# Find static imports of jspdf
STATIC_IMPORTS=$(grep -r "^import.*from ['\"]jspdf['\"]" src/ --include="*.tsx" --include="*.ts" 2>/dev/null || true)

if [ -n "$STATIC_IMPORTS" ]; then
  echo "ERROR: Found static jsPDF imports that should be dynamic:"
  echo "$STATIC_IMPORTS"
  echo ""
  echo "Fix by converting to dynamic imports:"
  echo "  const { default: jsPDF } = await import('jspdf');"
  exit 1
fi

# Find static imports of jspdf-autotable
STATIC_AUTOTABLE=$(grep -r "^import.*from ['\"]jspdf-autotable['\"]" src/ --include="*.tsx" --include="*.ts" 2>/dev/null || true)

if [ -n "$STATIC_AUTOTABLE" ]; then
  echo "ERROR: Found static jspdf-autotable imports that should be dynamic:"
  echo "$STATIC_AUTOTABLE"
  echo ""
  echo "Fix by converting to dynamic imports:"
  echo "  const { default: autoTable } = await import('jspdf-autotable');"
  exit 1
fi

echo "VALIDATION PASSED: All jsPDF imports are dynamic"
exit 0
