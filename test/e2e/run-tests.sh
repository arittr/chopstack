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
TEST_WORKSPACE="${TEST_WORKSPACE:-/Users/drewritter/projects/typescript-nextjs-starter}"

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
    cd "$TEST_WORKSPACE"

    # Remove test files (but be careful not to remove important files)
    rm -f README-test.md chopstack-test-config.json
    rm -rf test-files/ src/types/test.ts src/utils/test.ts src/components/ src/main.ts

    # Clean up worktrees if they exist
    if git worktree list | grep -q ".chopstack-shadows"; then
        log_info "Cleaning up git worktrees..."
        git worktree list | grep ".chopstack-shadows" | while read line; do
            worktree_path=$(echo "$line" | awk '{print $1}')
            git worktree remove "$worktree_path" --force 2>/dev/null || true
        done
    fi

    log_success "Cleanup completed"
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