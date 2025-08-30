#!/bin/bash

echo "🧪 Testing chopstack CLI..."
echo ""

# Build first
echo "📦 Building project..."
pnpm run build
echo ""

# Test help
echo "📖 Testing --help:"
node dist/bin/chopstack.js --help
echo ""

# Test version
echo "🏷️  Testing --version:"
node dist/bin/chopstack.js --version
echo ""

# Test decompose with mock
echo "🔧 Testing decompose with mock agent:"
node dist/bin/chopstack.js decompose --spec test-spec.md --agent mock --verbose
echo ""

# Test output to file
echo "💾 Testing output to file:"
node dist/bin/chopstack.js decompose --spec test-spec.md --agent mock --output test-output.yaml
echo "Output saved to test-output.yaml"
cat test-output.yaml
echo ""

echo "✅ All tests completed!"