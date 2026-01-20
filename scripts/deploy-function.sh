#!/bin/bash
# ==============================================================================
# Deploy Azure Function App Code
# ==============================================================================
# This script builds and deploys the FinOps cost query functions to Azure.
#
# Usage: ./scripts/deploy-function.sh
#
# Prerequisites:
#   - Azure CLI installed and logged in
#   - Node.js 20+ installed
#   - Terraform apply completed
# ==============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# ==============================================================================
# Configuration
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FUNCTION_DIR="$SCRIPT_DIR/../function"
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"

cd "$TERRAFORM_DIR"

log_info "Reading configuration from Terraform outputs..."

SCRIPT_VARS=$(terraform output -json script_variables)
RESOURCE_GROUP=$(echo "$SCRIPT_VARS" | jq -r '.resource_group')
FUNCTION_APP_NAME=$(echo "$SCRIPT_VARS" | jq -r '.function_app_name')
FUNCTION_APP_URL=$(echo "$SCRIPT_VARS" | jq -r '.function_app_url')

log_info "Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Function App: $FUNCTION_APP_NAME"
echo "  URL: $FUNCTION_APP_URL"

# ==============================================================================
# Build Function App
# ==============================================================================

log_step "Building Function App..."

cd "$FUNCTION_DIR"

# Install dependencies
log_info "Installing dependencies..."
npm ci

# Build TypeScript
log_info "Compiling TypeScript..."
npm run build

# ==============================================================================
# Deploy to Azure
# ==============================================================================

log_step "Deploying to Azure Functions..."

# Create deployment package
log_info "Creating deployment package..."
DEPLOY_DIR=$(mktemp -d)
DEPLOY_ZIP="$DEPLOY_DIR/function.zip"

# Copy necessary files
cp -r dist "$DEPLOY_DIR/"
cp -r node_modules "$DEPLOY_DIR/"
cp host.json "$DEPLOY_DIR/"
cp package.json "$DEPLOY_DIR/"

# Create zip
cd "$DEPLOY_DIR"
zip -r "$DEPLOY_ZIP" . > /dev/null

# Deploy using Azure CLI
log_info "Uploading to Azure..."
az functionapp deployment source config-zip \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP_NAME" \
  --src "$DEPLOY_ZIP"

# Cleanup
rm -rf "$DEPLOY_DIR"

# ==============================================================================
# Verify Deployment
# ==============================================================================

log_step "Verifying deployment..."

# Wait for deployment to complete
sleep 10

# Test health endpoint
HEALTH_URL="$FUNCTION_APP_URL/api/health"
log_info "Testing health endpoint: $HEALTH_URL"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  log_info "✅ Function App deployed successfully!"
  
  HEALTH_RESPONSE=$(curl -s "$HEALTH_URL")
  echo ""
  echo "Health check response:"
  echo "$HEALTH_RESPONSE" | jq .
  echo ""
else
  log_warn "Health check returned HTTP $HTTP_CODE"
  log_warn "The function may still be starting up. Try again in a few moments."
fi

# ==============================================================================
# Display Test Commands
# ==============================================================================

cat <<EOF

================================================================================
DEPLOYMENT COMPLETE
================================================================================

Function App URL: $FUNCTION_APP_URL

Test the endpoints with these curl commands:

1. Health Check:
   curl "$FUNCTION_APP_URL/api/health"

2. Cost Summary (Last 7 Days):
   curl -X POST "$FUNCTION_APP_URL/api/cost/summary" \\
     -H "Content-Type: application/json" \\
     -d '{"timeframe": "Last7Days", "groupBy": "ServiceName"}'

3. Top 5 Resources:
   curl -X POST "$FUNCTION_APP_URL/api/cost/top" \\
     -H "Content-Type: application/json" \\
     -d '{"timeframe": "MonthToDate", "groupBy": "Resource", "top": 5}'

4. Costs by Tag:
   curl -X POST "$FUNCTION_APP_URL/api/cost/byTag" \\
     -H "Content-Type: application/json" \\
     -d '{"timeframe": "Last30Days", "tagKey": "environment"}'

5. Cost Delta (Week over Week):
   curl -X POST "$FUNCTION_APP_URL/api/cost/delta" \\
     -H "Content-Type: application/json" \\
     -d '{"currentPeriod": "Last7Days", "comparisonPeriod": "Previous7Days", "groupBy": "ServiceName"}'

================================================================================
EOF

log_info "Deployment complete! Run ./scripts/create-agent.sh to set up the AI agent."
