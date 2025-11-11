#!/bin/bash
# CyberShield Linux Installation Test Suite
# Este script testa completamente a instalação e funcionamento do agent Linux

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Variables
SERVER_URL=""
ENROLLMENT_KEY=""
TEST_DURATION=300  # 5 minutes default
TEST_AGENT_TOKEN=""
TEST_HMAC_SECRET=""
TEST_AGENT_NAME=""

# Function to display test results
write_test_result() {
    local test_name="$1"
    local passed="$2"
    local details="$3"
    
    if [ "$passed" = "true" ]; then
        echo -e "${GREEN}[✓ PASS]${NC} $test_name"
    else
        echo -e "${RED}[✗ FAIL]${NC} $test_name"
    fi
    
    if [ -n "$details" ]; then
        echo -e "       ${GRAY}$details${NC}"
    fi
}

# Function to calculate HMAC signature
get_hmac_signature() {
    local message="$1"
    local secret="$2"
    echo -n "$message" | openssl dgst -sha256 -hmac "$secret" | awk '{print $2}'
}

# Test 1: Prerequisites
test_prerequisites() {
    echo -e "\n${CYAN}=== TESTE 1: Pré-requisitos ===${NC}"
    
    local all_ok=true
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        write_test_result "Root/Sudo Access" "true"
    else
        write_test_result "Root/Sudo Access" "false" "Please run with sudo"
        all_ok=false
    fi
    
    # Check required commands
    for cmd in curl jq openssl; do
        if command -v $cmd &> /dev/null; then
            write_test_result "$cmd installed" "true"
        else
            write_test_result "$cmd installed" "false" "Please install $cmd"
            all_ok=false
        fi
    done
    
    # Check network connectivity
    if ping -c 1 8.8.8.8 &> /dev/null; then
        write_test_result "Network Connectivity" "true"
    else
        write_test_result "Network Connectivity" "false"
        all_ok=false
    fi
    
    # Check server reachability
    if curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/functions/v1/poll-jobs" | grep -q "401\|200"; then
        write_test_result "Server Reachable" "true" "URL: $SERVER_URL"
    else
        write_test_result "Server Reachable" "false" "URL: $SERVER_URL"
        all_ok=false
    fi
    
    if [ "$all_ok" = "true" ]; then
        return 0
    else
        return 1
    fi
}

# Test 2: Enrollment Process
test_enrollment() {
    echo -e "\n${CYAN}=== TESTE 2: Processo de Enrollment ===${NC}"
    
    local agent_name="test-agent-$(date +%Y%m%d-%H%M%S)"
    local enroll_url="${SERVER_URL}/functions/v1/enroll-agent"
    
    local response=$(curl -s -X POST "$enroll_url" \
        -H "Content-Type: application/json" \
        -d "{\"enrollmentKey\":\"$ENROLLMENT_KEY\",\"agentName\":\"$agent_name\"}")
    
    local agent_token=$(echo "$response" | jq -r '.agent_token // empty')
    local hmac_secret=$(echo "$response" | jq -r '.hmac_secret // empty')
    
    if [ -n "$agent_token" ] && [ -n "$hmac_secret" ]; then
        write_test_result "Enrollment Successful" "true" "Agent: $agent_name"
        echo -e "       ${GRAY}Token: ${agent_token:0:16}...${NC}"
        echo -e "       ${GRAY}Secret: ${hmac_secret:0:16}...${NC}"
        
        # Save for subsequent tests
        TEST_AGENT_TOKEN="$agent_token"
        TEST_HMAC_SECRET="$hmac_secret"
        TEST_AGENT_NAME="$agent_name"
        
        return 0
    else
        write_test_result "Enrollment Failed" "false" "Invalid response"
        echo -e "       ${RED}Response: $response${NC}"
        return 1
    fi
}

# Test 3: Heartbeat
test_heartbeat() {
    echo -e "\n${CYAN}=== TESTE 3: Heartbeat ===${NC}"
    
    if [ -z "$TEST_AGENT_TOKEN" ]; then
        write_test_result "Heartbeat Test" "false" "No agent token available"
        return 1
    fi
    
    local timestamp=$(date +%s%3N)
    local nonce=$(uuidgen)
    local message="${timestamp}:${nonce}:{}"
    local signature=$(get_hmac_signature "$message" "$TEST_HMAC_SECRET")
    
    local response=$(curl -s -X POST "${SERVER_URL}/functions/v1/heartbeat" \
        -H "Content-Type: application/json" \
        -H "X-Agent-Token: $TEST_AGENT_TOKEN" \
        -H "X-HMAC-Signature: $signature" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Nonce: $nonce" \
        -d '{}')
    
    local ok=$(echo "$response" | jq -r '.ok // false')
    
    if [ "$ok" = "true" ]; then
        local agent=$(echo "$response" | jq -r '.agent // "unknown"')
        write_test_result "Heartbeat" "true" "Agent: $agent"
        return 0
    else
        write_test_result "Heartbeat Failed" "false" "$response"
        return 1
    fi
}

# Test 4: Job Polling
test_job_polling() {
    echo -e "\n${CYAN}=== TESTE 4: Job Polling ===${NC}"
    
    if [ -z "$TEST_AGENT_TOKEN" ]; then
        write_test_result "Job Polling Test" "false" "No agent token available"
        return 1
    fi
    
    local timestamp=$(date +%s%3N)
    local nonce=$(uuidgen)
    local message="${timestamp}:${nonce}:{}"
    local signature=$(get_hmac_signature "$message" "$TEST_HMAC_SECRET")
    
    local response=$(curl -s -X GET "${SERVER_URL}/functions/v1/poll-jobs" \
        -H "Content-Type: application/json" \
        -H "X-Agent-Token: $TEST_AGENT_TOKEN" \
        -H "X-HMAC-Signature: $signature" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Nonce: $nonce")
    
    local job_count=$(echo "$response" | jq '. | length')
    
    write_test_result "Job Polling" "true" "Found $job_count job(s)"
    return 0
}

# Test 5: Continuous Operation
test_continuous_operation() {
    local duration=$1
    
    echo -e "\n${CYAN}=== TESTE 5: Operação Contínua ($duration segundos) ===${NC}"
    
    if [ -z "$TEST_AGENT_TOKEN" ]; then
        write_test_result "Continuous Operation Test" "false" "No agent token available"
        return 1
    fi
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    local heartbeat_count=0
    local heartbeat_errors=0
    local poll_count=0
    local poll_errors=0
    local last_heartbeat=0
    local last_poll=0
    
    echo -e "       ${GRAY}Starting continuous operation test...${NC}"
    echo -e "       ${GRAY}End time: $(date -d @$end_time +%H:%M:%S)${NC}"
    
    while [ $(date +%s) -lt $end_time ]; do
        local now=$(date +%s)
        
        # Heartbeat every 30 seconds
        if [ $((now - last_heartbeat)) -ge 30 ]; then
            local timestamp=$(date +%s%3N)
            local nonce=$(uuidgen)
            local message="${timestamp}:${nonce}:{}"
            local signature=$(get_hmac_signature "$message" "$TEST_HMAC_SECRET")
            
            if curl -s -X POST "${SERVER_URL}/functions/v1/heartbeat" \
                -H "Content-Type: application/json" \
                -H "X-Agent-Token: $TEST_AGENT_TOKEN" \
                -H "X-HMAC-Signature: $signature" \
                -H "X-Timestamp: $timestamp" \
                -H "X-Nonce: $nonce" \
                -d '{}' > /dev/null 2>&1; then
                ((heartbeat_count++))
                echo -e "       ${GREEN}✓ Heartbeat #$heartbeat_count${NC}"
            else
                ((heartbeat_errors++))
                echo -e "       ${RED}✗ Heartbeat error${NC}"
            fi
            last_heartbeat=$now
        fi
        
        # Poll every 10 seconds
        if [ $((now - last_poll)) -ge 10 ]; then
            local timestamp=$(date +%s%3N)
            local nonce=$(uuidgen)
            local message="${timestamp}:${nonce}:{}"
            local signature=$(get_hmac_signature "$message" "$TEST_HMAC_SECRET")
            
            local jobs=$(curl -s -X GET "${SERVER_URL}/functions/v1/poll-jobs" \
                -H "Content-Type: application/json" \
                -H "X-Agent-Token: $TEST_AGENT_TOKEN" \
                -H "X-HMAC-Signature: $signature" \
                -H "X-Timestamp: $timestamp" \
                -H "X-Nonce: $nonce")
            
            if [ $? -eq 0 ]; then
                local job_count=$(echo "$jobs" | jq '. | length' 2>/dev/null || echo "0")
                ((poll_count++))
                echo -e "       ${GREEN}✓ Poll #$poll_count (jobs: $job_count)${NC}"
            else
                ((poll_errors++))
                echo -e "       ${RED}✗ Poll error${NC}"
            fi
            last_poll=$now
        fi
        
        sleep 1
    done
    
    local total_ops=$((heartbeat_count + poll_count))
    local total_errors=$((heartbeat_errors + poll_errors))
    local success_rate=$(awk "BEGIN {printf \"%.2f\", (($total_ops - $total_errors) / $total_ops) * 100}")
    
    echo ""
    echo -e "       ${GRAY}Statistics:${NC}"
    echo -e "       ${GRAY}- Heartbeats: $heartbeat_count (errors: $heartbeat_errors)${NC}"
    echo -e "       ${GRAY}- Polls: $poll_count (errors: $poll_errors)${NC}"
    echo -e "       ${GRAY}- Success Rate: ${success_rate}%${NC}"
    
    if (( $(echo "$success_rate >= 95" | bc -l) )); then
        write_test_result "Continuous Operation" "true" "Success rate: ${success_rate}%"
        return 0
    else
        write_test_result "Continuous Operation" "false" "Success rate: ${success_rate}%"
        return 1
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 -s SERVER_URL -k ENROLLMENT_KEY [-d TEST_DURATION]"
    echo ""
    echo "Options:"
    echo "  -s SERVER_URL       Supabase server URL (required)"
    echo "  -k ENROLLMENT_KEY   Enrollment key (required)"
    echo "  -d TEST_DURATION    Duration for continuous test in seconds (default: 300)"
    echo ""
    echo "Example:"
    echo "  sudo $0 -s https://iavbnmduxpxhwubqrzzn.supabase.co -k abc123xyz -d 180"
    exit 1
}

# Parse command line arguments
while getopts "s:k:d:h" opt; do
    case $opt in
        s) SERVER_URL="$OPTARG" ;;
        k) ENROLLMENT_KEY="$OPTARG" ;;
        d) TEST_DURATION="$OPTARG" ;;
        h) usage ;;
        *) usage ;;
    esac
done

# Validate required arguments
if [ -z "$SERVER_URL" ] || [ -z "$ENROLLMENT_KEY" ]; then
    echo -e "${RED}Error: SERVER_URL and ENROLLMENT_KEY are required${NC}"
    usage
fi

# ============================================
# MAIN TEST EXECUTION
# ============================================

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     CyberShield Linux Agent Installation Test Suite      ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GRAY}Server: $SERVER_URL${NC}"
echo -e "${GRAY}Test Duration: $TEST_DURATION seconds${NC}"
echo ""

# Test results tracking
declare -A test_results
test_results[Prerequisites]=0
test_results[Enrollment]=0
test_results[Heartbeat]=0
test_results[JobPolling]=0
test_results[ContinuousOperation]=0

# Run tests
if test_prerequisites; then
    test_results[Prerequisites]=1
    
    if test_enrollment; then
        test_results[Enrollment]=1
        
        if test_heartbeat; then
            test_results[Heartbeat]=1
        fi
        
        if test_job_polling; then
            test_results[JobPolling]=1
        fi
        
        if test_continuous_operation $TEST_DURATION; then
            test_results[ContinuousOperation]=1
        fi
    fi
fi

# ============================================
# FINAL REPORT
# ============================================

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                     FINAL REPORT                          ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

passed_tests=0
total_tests=${#test_results[@]}

for test_name in "${!test_results[@]}"; do
    if [ "${test_results[$test_name]}" -eq 1 ]; then
        echo -e "${GREEN}[✓]${NC} $test_name"
        ((passed_tests++))
    else
        echo -e "${RED}[✗]${NC} $test_name"
    fi
done

echo ""
pass_rate=$(awk "BEGIN {printf \"%.1f\", ($passed_tests / $total_tests) * 100}")
echo -e "Tests Passed: $passed_tests / $total_tests (${pass_rate}%)"
echo ""

if (( $(echo "$pass_rate >= 85" | bc -l) )); then
    echo -e "${GREEN}✓ INSTALLATION VALIDATION: PASSED${NC}"
    echo -e "${GRAY}  Agent is ready for production deployment${NC}"
    exit 0
else
    echo -e "${RED}✗ INSTALLATION VALIDATION: FAILED${NC}"
    echo -e "${GRAY}  Review failed tests before deploying${NC}"
    exit 1
fi
