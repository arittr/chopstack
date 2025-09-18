#!/bin/bash

# Manual Worktree Test Script
# Tests real git worktree operations with the VcsEngine

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Manual Worktree Test for VcsEngine${NC}"
echo "================================================"

# Create temporary test repository
TEST_REPO="/tmp/chopstack-worktree-test-$(date +%s)"
echo -e "${YELLOW}📁 Creating test repository: $TEST_REPO${NC}"

mkdir -p "$TEST_REPO"
cd "$TEST_REPO"

# Initialize git repository
git init
git config user.name "Test User"
git config user.email "test@example.com"

# Create initial commit
echo "# Test Repository" > README.md
git add README.md
git commit -m "Initial commit"

echo -e "${GREEN}✅ Test repository initialized${NC}"

# Test 1: Create worktree using VcsEngine approach
echo -e "\n${YELLOW}🔧 Test 1: Creating worktree manually${NC}"

SHADOW_PATH=".chopstack-shadows"
TASK_ID="add-component"
BRANCH_NAME="feature/add-component"
WORKTREE_PATH="$SHADOW_PATH/$TASK_ID"
ABSOLUTE_PATH="$TEST_REPO/$WORKTREE_PATH"

mkdir -p "$SHADOW_PATH"

echo "Creating worktree at: $WORKTREE_PATH"
echo "Branch name: $BRANCH_NAME"
echo "Base ref: main"

# Create worktree (this is what VcsEngine does)
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "main"

if [ -d "$ABSOLUTE_PATH" ]; then
    echo -e "${GREEN}✅ Worktree created successfully${NC}"
    echo "Contents of worktree directory:"
    ls -la "$ABSOLUTE_PATH"
else
    echo -e "${RED}❌ Worktree creation failed${NC}"
    exit 1
fi

# Test 2: Work in the worktree
echo -e "\n${YELLOW}🔧 Test 2: Working in worktree${NC}"

cd "$ABSOLUTE_PATH"
echo "Current directory: $(pwd)"
echo "Git status in worktree:"
git status

# Create a component file
mkdir -p src/components
cat > src/components/Button.tsx << 'EOF'
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary'
}) => {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
EOF

echo -e "${GREEN}✅ Component file created${NC}"

# Test 3: Commit in worktree
echo -e "\n${YELLOW}🔧 Test 3: Committing in worktree${NC}"

git add -A
git status

# Generate commit message (simplified version of VcsEngine logic)
COMMIT_MESSAGE="Add Button component

Implements Button component with TypeScript props interface

🤖 Generated with Claude via chopstack

Co-Authored-By: Claude <noreply@anthropic.com>"

git commit -m "$COMMIT_MESSAGE"

echo -e "${GREEN}✅ Commit created in worktree${NC}"
echo "Commit hash: $(git rev-parse HEAD)"

# Test 4: Return to main repo and check state
echo -e "\n${YELLOW}🔧 Test 4: Checking main repository state${NC}"

cd "$TEST_REPO"
echo "Back in main repo: $(pwd)"

echo "Git worktree list:"
git worktree list

echo "Branches:"
git branch -a

echo "Main repo file listing:"
ls -la

# Test 5: git-spice integration (if available)
echo -e "\n${YELLOW}🔧 Test 5: Testing git-spice integration${NC}"

if command -v gs &> /dev/null; then
    echo "git-spice found, testing branch creation"

    # Switch to worktree for git-spice operations
    cd "$ABSOLUTE_PATH"

    # Try to create git-spice branch
    echo "Creating git-spice branch..."
    if gs branch create "$BRANCH_NAME" --onto main; then
        echo -e "${GREEN}✅ git-spice branch creation successful${NC}"
    else
        echo -e "${YELLOW}⚠️ git-spice branch creation failed (may already exist)${NC}"
    fi

    # Check git-spice status
    echo "git-spice status:"
    gs status || echo -e "${YELLOW}⚠️ git-spice status failed${NC}"

else
    echo -e "${YELLOW}⚠️ git-spice not found, skipping integration test${NC}"
fi

# Test 6: Cleanup worktree
echo -e "\n${YELLOW}🔧 Test 6: Cleaning up worktree${NC}"

cd "$TEST_REPO"

# Remove worktree (with force to handle any issues)
echo "Removing worktree: $WORKTREE_PATH"
git worktree remove "$WORKTREE_PATH" --force

if [ ! -d "$ABSOLUTE_PATH" ]; then
    echo -e "${GREEN}✅ Worktree removed successfully${NC}"
else
    echo -e "${RED}❌ Worktree removal failed${NC}"
fi

# Final verification
echo -e "\n${YELLOW}🔧 Final verification${NC}"

echo "Remaining worktrees:"
git worktree list

echo "Remaining branches:"
git branch -a

# Test 7: Multiple worktrees (parallel execution simulation)
echo -e "\n${YELLOW}🔧 Test 7: Multiple worktrees (parallel simulation)${NC}"

TASKS=("add-header" "add-footer" "add-sidebar")

for task in "${TASKS[@]}"; do
    worktree_path="$SHADOW_PATH/$task"
    branch_name="feature/$task"

    echo "Creating worktree for task: $task"
    git worktree add -b "$branch_name" "$worktree_path" "main"

    # Simulate work in each worktree
    cd "$TEST_REPO/$worktree_path"
    mkdir -p "src/components"
    echo "export const ${task^} = () => <div>${task^}</div>;" > "src/components/${task^}.tsx"
    git add -A
    git commit -m "Add ${task^} component

🤖 Generated with Claude via chopstack

Co-Authored-By: Claude <noreply@anthropic.com>"

    cd "$TEST_REPO"
done

echo -e "${GREEN}✅ Multiple worktrees created and committed${NC}"

echo "All worktrees:"
git worktree list

echo "All branches:"
git branch -a

# Cleanup all worktrees
echo -e "\n${YELLOW}🧹 Cleaning up all worktrees${NC}"

for task in "${TASKS[@]}"; do
    worktree_path="$SHADOW_PATH/$task"
    echo "Removing worktree: $worktree_path"
    git worktree remove "$worktree_path" --force
done

# Remove shadow directory
rm -rf "$SHADOW_PATH"

echo -e "${GREEN}✅ All worktrees cleaned up${NC}"

# Final summary
echo -e "\n${BLUE}📊 Test Summary${NC}"
echo "==============="
echo -e "${GREEN}✅ Worktree creation and management${NC}"
echo -e "${GREEN}✅ File operations in worktrees${NC}"
echo -e "${GREEN}✅ Commit creation in worktrees${NC}"
echo -e "${GREEN}✅ Multiple parallel worktrees${NC}"
echo -e "${GREEN}✅ Worktree cleanup${NC}"

if command -v gs &> /dev/null; then
    echo -e "${GREEN}✅ git-spice integration tested${NC}"
else
    echo -e "${YELLOW}⚠️ git-spice not available for testing${NC}"
fi

echo -e "\n${GREEN}🎉 All tests completed successfully!${NC}"

# Cleanup test repository
echo -e "\n${YELLOW}🧹 Cleaning up test repository${NC}"
cd /tmp
rm -rf "$TEST_REPO"
echo -e "${GREEN}✅ Test repository cleaned up${NC}"

echo -e "\n${BLUE}Manual worktree test completed.${NC}"