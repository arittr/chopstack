#!/bin/bash

# Chopstack E2E Test Runner
# Usage: ./run-tests.sh [test-name] [mode] [strategy]
# Examples:
#   ./run-tests.sh simple-single-task dry-run parallel
#   ./run-tests.sh parallel-tasks execute parallel
#   ./run-tests.sh all validate parallel

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHOPSTACK_BIN="../../dist/bin/chopstack.js"
SPECS_DIR="$SCRIPT_DIR/specs"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_ID="${TEST_ID:-e2e-shell}"
BASE_REF="${BASE_REF:-HEAD}"
TEST_WORKSPACE_ROOT="${TEST_WORKSPACE_ROOT:-$REPO_ROOT/test/tmp}"
TEST_WORKSPACE="$TEST_WORKSPACE_ROOT/$TEST_ID"
TEST_BRANCH="test/$TEST_ID"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="${2:-dry-run}"
STRATEGY="${3:-parallel}"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

run_test() {
    local test_name="$1"
    local test_file="$SPECS_DIR/${test_name}.yaml"

    if [[ ! -f "$test_file" ]]; then
        log_error "Test file not found: $test_file"
        return 1
    fi

    log_info "Running test: $test_name (mode: $MODE, strategy: $STRATEGY)"
    echo "════════════════════════════════════════════════════════════════"

    ensure_worktree
    cd "$TEST_WORKSPACE"

    # Run the chopstack command
    if "$SCRIPT_DIR/$CHOPSTACK_BIN" run --plan "$test_file" --mode "$MODE" --strategy "$STRATEGY" --verbose; then
        log_success "Test $test_name completed successfully"
    else
        log_error "Test $test_name failed"
        return 1
    fi

    echo ""
}

cleanup_test_artifacts() {
    log_info "Cleaning up test artifacts..."
    if [ -d "$TEST_WORKSPACE" ]; then
        cd "$REPO_ROOT"
        git worktree remove "$TEST_WORKSPACE" --force 2>/dev/null || true
        git branch -D "$TEST_BRANCH" 2>/dev/null || true
    fi

    log_success "Cleanup completed"
}

ensure_worktree() {
    mkdir -p "$TEST_WORKSPACE_ROOT"

    if [ -d "$TEST_WORKSPACE/.git" ]; then
        return
    fi

    if git -C "$REPO_ROOT" worktree list | grep -q " $TEST_WORKSPACE "; then
        return
    fi

    if ! git -C "$REPO_ROOT" worktree add "$TEST_WORKSPACE" "$BASE_REF" -b "$TEST_BRANCH" 2>/dev/null; then
        if ! git -C "$REPO_ROOT" worktree add "$TEST_WORKSPACE" "$TEST_BRANCH" 2>/dev/null; then
            log_error "Failed to create test worktree at $TEST_WORKSPACE"
            exit 1
        fi
    fi
}

# Available tests
AVAILABLE_TESTS=(
    "simple-single-task"
    "parallel-tasks"
    "stacked-dependencies"
    "complex-parallel-layers"
)

# Show usage
show_usage() {
    echo "Chopstack E2E Test Runner"
    echo ""
    echo "Usage: $0 [test-name|all] [mode] [strategy]"
    echo ""
    echo "Available tests:"
    for test in "${AVAILABLE_TESTS[@]}"; do
        echo "  - $test"
    done
    echo "  - all (runs all tests)"
    echo ""
    echo "Modes: plan, dry-run, execute, validate (default: dry-run)"
    echo "Strategies: parallel, serial (default: parallel)"
    echo ""
    echo "Examples:"
    echo "  $0 simple-single-task dry-run parallel"
    echo "  $0 parallel-tasks execute parallel"
    echo "  $0 all validate parallel"
    echo "  $0 cleanup  # Clean up test artifacts"
}

# Main execution
case "${1:-help}" in
    "help"|"-h"|"--help")
        show_usage
        exit 0
        ;;
    "cleanup")
        cleanup_test_artifacts
        exit 0
        ;;
    "all")
        log_info "Running all tests with mode: $MODE, strategy: $STRATEGY"
        failed_tests=()

        for test in "${AVAILABLE_TESTS[@]}"; do
            if ! run_test "$test"; then
                failed_tests+=("$test")
            fi
        done

        echo "════════════════════════════════════════════════════════════════"
        if [[ ${#failed_tests[@]} -eq 0 ]]; then
            log_success "All tests passed! 🎉"
        else
            log_error "Failed tests: ${failed_tests[*]}"
            exit 1
        fi
        ;;
    *)
        if [[ " ${AVAILABLE_TESTS[*]} " =~ " $1 " ]]; then
            run_test "$1"
        else
            log_error "Unknown test: $1"
            echo ""
            show_usage
            exit 1
        fi
        ;;
esac
