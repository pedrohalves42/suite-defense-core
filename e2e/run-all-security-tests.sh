#!/bin/bash

##############################################################################
# E2E Security Test Runner
# 
# Script unificado para executar todos os testes de segurança E2E.
# Uso: ./e2e/run-all-security-tests.sh [--fast|--full|--red-team|--invariants]
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default mode
MODE="${1:-full}"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    E2E SECURITY TEST SUITE                                ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Check environment variables
if [ -z "$VITE_SUPABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  VITE_SUPABASE_URL not set. Tests may be skipped.${NC}"
fi

if [ -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ]; then
    echo -e "${YELLOW}⚠️  VITE_SUPABASE_PUBLISHABLE_KEY not set. Tests may be skipped.${NC}"
fi

echo -e "${GREEN}Mode: ${MODE}${NC}"
echo ""

# Function to run tests with reporter
run_tests() {
    local test_name=$1
    local test_file=$2
    
    echo -e "${BLUE}▶ Running: ${test_name}${NC}"
    npx playwright test "$test_file" --reporter=list --timeout=60000
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${test_name} PASSED${NC}"
    else
        echo -e "${RED}✗ ${test_name} FAILED${NC}"
        exit 1
    fi
    echo ""
}

case $MODE in
    "--fast")
        echo -e "${YELLOW}Running FAST security tests (core only)...${NC}"
        echo ""
        run_tests "Security Invariants" "e2e/security-invariants.spec.ts"
        ;;
    
    "--red-team")
        echo -e "${YELLOW}Running RED TEAM adversarial tests...${NC}"
        echo ""
        run_tests "Red Team Security" "e2e/red-team-security.spec.ts"
        ;;
    
    "--invariants")
        echo -e "${YELLOW}Running INVARIANTS violation tests...${NC}"
        echo ""
        run_tests "Security Invariants" "e2e/security-invariants.spec.ts"
        ;;
    
    "--rls")
        echo -e "${YELLOW}Running RLS isolation tests...${NC}"
        echo ""
        run_tests "RLS Cross-Tenant Isolation" "e2e/rls-cross-tenant-isolation.spec.ts"
        ;;
    
    "--super-admin")
        echo -e "${YELLOW}Running Super Admin privilege tests...${NC}"
        echo ""
        run_tests "Super Admin Privilege Escalation" "e2e/super-admin-privilege-escalation.spec.ts"
        run_tests "Super Admin Tenant Management" "e2e/super-admin-tenant-management.spec.ts"
        ;;
    
    "--full"|*)
        echo -e "${YELLOW}Running FULL security test suite...${NC}"
        echo ""
        
        # Core security tests (P0)
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}                         P0: CORE SECURITY TESTS                           ${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        run_tests "Security Invariants" "e2e/security-invariants.spec.ts"
        run_tests "Red Team Security" "e2e/red-team-security.spec.ts"
        run_tests "RLS Cross-Tenant Isolation" "e2e/rls-cross-tenant-isolation.spec.ts"
        
        # Super Admin tests (P1)
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}                      P1: SUPER ADMIN SECURITY TESTS                       ${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        run_tests "Super Admin Privilege Escalation" "e2e/super-admin-privilege-escalation.spec.ts"
        run_tests "Super Admin Tenant Management" "e2e/super-admin-tenant-management.spec.ts"
        
        # Agent security tests (P2)
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}                        P2: AGENT SECURITY TESTS                           ${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        run_tests "Agent HMAC Improvements" "e2e/agent-hmac-improvements.spec.ts"
        run_tests "Agent Creation Post-RLS Fix" "e2e/agent-creation-post-rls-fix.spec.ts"
        run_tests "Input Validation" "e2e/input-validation.spec.ts"
        ;;
esac

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    ALL SECURITY TESTS PASSED ✓                            ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Generate HTML report
echo -e "${BLUE}Generating HTML report...${NC}"
npx playwright show-report --host 0.0.0.0 &
REPORT_PID=$!
echo -e "${GREEN}Report available at http://localhost:9323${NC}"
echo ""
echo "Press Ctrl+C to stop the report server"
wait $REPORT_PID
