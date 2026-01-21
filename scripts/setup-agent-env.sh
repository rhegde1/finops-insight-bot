#!/usr/bin/env bash
# Quick setup script for Azure AI Agent deployment

set -euo pipefail

echo "🔧 Setting up Azure AI Agent deployment environment..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.8+"
    exit 1
fi

echo "✅ Python found: $(python3 --version)"

# Check pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 not found. Please install pip"
    exit 1
fi

# Install requirements
echo "📦 Installing Python dependencies..."
pip3 install -r "$(dirname "$0")/requirements-agent.txt"

echo ""
echo "✅ Setup complete!"
echo ""
echo "To deploy the agent, run:"
echo "  cd scripts"
echo "  python3 deploy-agent.py"
