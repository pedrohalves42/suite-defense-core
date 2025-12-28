#!/bin/bash

# ============================================================
# E2E Test Runner - CyberShield
# Script unificado para execução de todos os testes E2E
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REPORTER="list"
WORKERS=4
RETRIES=1
TIMEOUT=60000

# Print header
print_header() {
    echo -e "${BLUE}"
    echo "============================================================"
    echo "  CyberShield E2E Test Suite"
    echo "============================================================"
    echo -e "${NC}"
}

# Print usage
usage() {
    echo -e "${YELLOW}Usage:${NC} $0 [CATEGORY] [OPTIONS]"
    echo ""
    echo -e "${GREEN}Categories:${NC}"
    echo "  --all           Run all E2E tests"
    echo "  --security      Run security tests (red-team, invariants, RLS)"
    echo "  --agent         Run agent flow tests"
    echo "  --installer     Run installer tests"
    echo "  --dashboard     Run dashboard tests"
    echo "  --payment       Run Stripe payment tests"
    echo "  --validation    Run input validation tests"
    echo "  --hmac          Run HMAC authentication tests"
    echo "  --admin         Run admin access tests"
    echo "  --features      Run feature-specific tests"
    echo "  --smoke         Run quick smoke tests (P0 only)"
    echo ""
    echo -e "${GREEN}Options:${NC}"
    echo "  --headed        Run in headed browser mode"
    echo "  --debug         Run with debug mode enabled"
    echo "  --html          Generate HTML report"
    echo "  --workers=N     Set number of parallel workers (default: 4)"
    echo "  --retries=N     Set retry count for failed tests (default: 1)"
    echo "  --list          List all tests without running"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  $0 --all                    # Run all tests"
    echo "  $0 --security --html        # Run security tests with HTML report"
    echo "  $0 --agent --headed         # Run agent tests in browser"
    echo "  $0 --smoke                  # Quick smoke test"
    exit 0
}

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check if .env.test exists
    if [ ! -f ".env.test" ] && [ ! -f ".env" ]; then
        echo -e "${RED}Error: .env.test or .env file not found${NC}"
        echo "Please create .env.test with required environment variables"
        exit 1
    fi
    
    # Check required env vars
    if [ -z "$VITE_SUPABASE_URL" ] && [ -z "$(grep VITE_SUPABASE_URL .env.test 2>/dev/null)" ] && [ -z "$(grep VITE_SUPABASE_URL .env 2>/dev/null)" ]; then
        echo -e "${YELLOW}Warning: VITE_SUPABASE_URL not found in environment${NC}"
    fi
    
    echo -e "${GREEN}Prerequisites OK${NC}"
}

# Run tests by category
run_tests() {
    local category=$1
    local extra_args=$2
    
    echo -e "${BLUE}Running $category tests...${NC}"
    
    case $category in
        "all")
            npx playwright test e2e/ --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "security")
            npx playwright test \
                e2e/red-team-security.spec.ts \
                e2e/security-invariants.spec.ts \
                e2e/rls-cross-tenant-isolation.spec.ts \
                e2e/super-admin-privilege-escalation.spec.ts \
                e2e/super-admin-tenant-management.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "agent")
            npx playwright test \
                e2e/complete-agent-flow.spec.ts \
                e2e/complete-enrollment-flow.spec.ts \
                e2e/agent-creation-post-rls-fix.spec.ts \
                e2e/agent-status-badges.spec.ts \
                e2e/agent-health-filters.spec.ts \
                e2e/agent-quick-actions.spec.ts \
                e2e/agent-name-validation.spec.ts \
                e2e/agent-scheduled-task-parameters.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "installer")
            npx playwright test \
                e2e/complete-installer-flow.spec.ts \
                e2e/one-click-installation.spec.ts \
                e2e/linux-agent-installation.spec.ts \
                e2e/macos-agent-installation.spec.ts \
                e2e/installer-token-validation.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "dashboard")
            npx playwright test \
                e2e/dashboard-agent-health.spec.ts \
                e2e/dashboard-installation-logs.spec.ts \
                e2e/dashboard-installation-pipeline.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "payment")
            npx playwright test \
                e2e/stripe-checkout-flow.spec.ts \
                e2e/stripe-payment.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "validation")
            npx playwright test \
                e2e/input-validation.spec.ts \
                e2e/agent-name-validation.spec.ts \
                e2e/installer-token-validation.spec.ts \
                e2e/ps1-sha256-validation.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "hmac")
            npx playwright test \
                e2e/agent-hmac-complete-flow.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "admin")
            npx playwright test \
                e2e/admin-access.spec.ts \
                e2e/update-user-role.spec.ts \
                e2e/multiple-roles-validation.spec.ts \
                e2e/member-limits.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "features")
            npx playwright test \
                e2e/dns-filter.spec.ts \
                e2e/rules-engine-management.spec.ts \
                e2e/process-control.spec.ts \
                e2e/ai-actions.spec.ts \
                --reporter=$REPORTER --workers=$WORKERS --retries=$RETRIES $extra_args
            ;;
        "smoke")
            npx playwright test \
                e2e/admin-access.spec.ts \
                e2e/complete-agent-flow.spec.ts \
                e2e/red-team-security.spec.ts \
                --reporter=$REPORTER --workers=2 --retries=0 --timeout=30000 $extra_args
            ;;
        "list")
            npx playwright test e2e/ --list
            ;;
        *)
            echo -e "${RED}Unknown category: $category${NC}"
            usage
            ;;
    esac
}

# Parse arguments
CATEGORY=""
EXTRA_ARGS=""

for arg in "$@"; do
    case $arg in
        --all|--security|--agent|--installer|--dashboard|--payment|--validation|--hmac|--admin|--features|--smoke|--list)
            CATEGORY="${arg#--}"
            ;;
        --headed)
            EXTRA_ARGS="$EXTRA_ARGS --headed"
            ;;
        --debug)
            EXTRA_ARGS="$EXTRA_ARGS --debug"
            ;;
        --html)
            REPORTER="html"
            ;;
        --workers=*)
            WORKERS="${arg#*=}"
            ;;
        --retries=*)
            RETRIES="${arg#*=}"
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $arg${NC}"
            usage
            ;;
    esac
done

# Main execution
print_header

if [ -z "$CATEGORY" ]; then
    usage
fi

check_prerequisites
run_tests "$CATEGORY" "$EXTRA_ARGS"

# Print summary
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Test execution completed!${NC}"
echo -e "${GREEN}============================================================${NC}"

if [ "$REPORTER" = "html" ]; then
    echo -e "${BLUE}View report: npx playwright show-report${NC}"
fi
