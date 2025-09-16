#!/bin/bash

# Manual test script to explore parallel worktree → git-spice stack flow
# Run this to understand and debug the current implementation

set -e

echo "🧪 Creating test scenario for parallel worktree → git-spice stack flow"

# Create test directory
TEST_DIR="/tmp/chopstack-worktree-test-$(date +%s)"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "📁 Test directory: $TEST_DIR"

# Initialize git repo
git init
git config user.name "Test User"
git config user.email "test@example.com"

# Create initial structure
mkdir -p src
echo "# Test Project" > README.md
echo "// Initial index file" > src/index.ts
git add .
git commit -m "Initial commit"

echo "✅ Created test repository"

# Create test plan for parallel tasks
cat > test-plan.yaml << 'EOF'
tasks:
  - id: task-a
    title: Create Component A
    description: Create a React component A
    touches: []
    produces:
      - src/ComponentA.tsx
    requires: []
    estimatedLines: 30
    agentPrompt: |
      Create a simple React functional component called ComponentA in src/ComponentA.tsx.
      The component should:
      1. Accept props with a title: string
      2. Return a div with the title
      3. Use TypeScript

      Example:
      ```typescript
      export interface ComponentAProps {
        title: string;
      }

      export const ComponentA: React.FC<ComponentAProps> = ({ title }) => {
        return <div>ComponentA: {title}</div>;
      };
      ```

  - id: task-b
    title: Create Component B
    description: Create a React component B
    touches: []
    produces:
      - src/ComponentB.tsx
    requires: []
    estimatedLines: 30
    agentPrompt: |
      Create a simple React functional component called ComponentB in src/ComponentB.tsx.
      The component should:
      1. Accept props with a message: string
      2. Return a div with the message
      3. Use TypeScript

      Example:
      ```typescript
      export interface ComponentBProps {
        message: string;
      }

      export const ComponentB: React.FC<ComponentBProps> = ({ message }) => {
        return <div>ComponentB: {message}</div>;
      };
      ```

  - id: task-c
    title: Update index to export components
    description: Add exports for both components
    touches:
      - src/index.ts
    produces: []
    requires:
      - task-a
      - task-b
    estimatedLines: 5
    agentPrompt: |
      Update src/index.ts to export both ComponentA and ComponentB.
      Add these lines:
      ```typescript
      export { ComponentA } from './ComponentA';
      export { ComponentB } from './ComponentB';
      ```
EOF

echo "✅ Created test plan with 3 tasks (2 parallel, 1 dependent)"

# Show the plan structure
echo "📋 Test plan structure:"
cat test-plan.yaml

echo ""
echo "🚀 Testing chopstack execution..."

# Test different execution modes
echo ""
echo "=== Testing dry-run mode ==="
/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js run --plan test-plan.yaml --mode dry-run --strategy parallel --verbose

echo ""
echo "=== Testing plan mode ==="
/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js run --plan test-plan.yaml --mode plan --strategy parallel --verbose

echo ""
echo "=== Current git status ==="
git status
git branch -a

echo ""
echo "=== Current worktrees ==="
git worktree list || echo "No worktrees found"

echo ""
echo "=== Testing execute mode (the critical test) ==="
/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js run --plan test-plan.yaml --mode execute --strategy parallel --workdir "$TEST_DIR" --verbose

echo ""
echo "=== Post-execution analysis ==="

echo "📊 Git status after execution:"
git status

echo ""
echo "🌳 Git branches after execution:"
git branch -a

echo ""
echo "📂 Worktrees after execution:"
git worktree list || echo "No worktrees found"

echo ""
echo "📁 Shadow directory contents:"
if [ -d ".chopstack-shadows" ]; then
    find .chopstack-shadows -type f -name "*.ts" -o -name "*.tsx" | head -10
    echo "Shadow directory structure:"
    tree .chopstack-shadows || ls -la .chopstack-shadows
else
    echo "No .chopstack-shadows directory found"
fi

echo ""
echo "📝 File contents in main repo:"
echo "=== src/index.ts ==="
cat src/index.ts 2>/dev/null || echo "File not found"
echo ""
echo "=== src/ComponentA.tsx ==="
cat src/ComponentA.tsx 2>/dev/null || echo "File not found"
echo ""
echo "=== src/ComponentB.tsx ==="
cat src/ComponentB.tsx 2>/dev/null || echo "File not found"

echo ""
echo "📈 Git commit history:"
git log --oneline --graph --all --decorate

echo ""
echo "🧪 Test completed!"
echo "📍 Test artifacts available at: $TEST_DIR"
echo ""
echo "Key questions to investigate:"
echo "1. Were worktrees created during execution?"
echo "2. Were commits made in the worktrees?"
echo "3. Were changes promoted back to main repo branches?"
echo "4. What's the current state of file changes?"

# Keep the test directory for manual inspection
echo ""
echo "💡 To explore further:"
echo "cd $TEST_DIR"
echo "git worktree list"
echo "git log --oneline --all --graph"