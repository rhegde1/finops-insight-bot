#!/usr/bin/env bash
# ==============================================================================
# Deploy AI Model to Azure AI Services
# ==============================================================================
# This script deploys a chat model (gpt-4o-mini) to Azure AI Services.
# Run this after Terraform apply completes.
#
# Usage: ./scripts/deploy-model.sh
#
# Prerequisites:
#   - Azure CLI installed and logged in
#   - Terraform outputs available
#   - Cognitive Services OpenAI Contributor role on AI Services
# ==============================================================================

set -Eeuo pipefail
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ==============================================================================
# Configuration from Terraform outputs
# ==============================================================================

cd "$(dirname "$0")/../terraform"

log_info "Reading configuration from Terraform outputs..."

SCRIPT_VARS=$(terraform output -json script_variables)

SUBSCRIPTION_ID=$(echo "$SCRIPT_VARS" | jq -r '.subscription_id')
RESOURCE_GROUP=$(echo "$SCRIPT_VARS" | jq -r '.resource_group')
AI_SERVICES_NAME=$(echo "$SCRIPT_VARS" | jq -r '.ai_services_name')
MODEL_NAME=$(echo "$SCRIPT_VARS" | jq -r '.model_name')
DEPLOYMENT_NAME=$(echo "$SCRIPT_VARS" | jq -r '.deployment_name')
MODEL_VERSION=$(echo "$SCRIPT_VARS" | jq -r '.model_version')

log_info "Configuration:"
echo "  Subscription: $SUBSCRIPTION_ID"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  AI Services: $AI_SERVICES_NAME"
echo "  Model: $MODEL_NAME"
echo "  Deployment: $DEPLOYMENT_NAME"
echo "  Version: $MODEL_VERSION"

# ==============================================================================
# Set Azure subscription
# ==============================================================================

log_info "Setting Azure subscription..."
az account set --subscription "$SUBSCRIPTION_ID"

# ==============================================================================
# Check if deployment already exists
# ==============================================================================

log_info "Checking for existing deployment..."

EXISTING=$(az cognitiveservices account deployment list \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AI_SERVICES_NAME" \
  --query "[?name=='$DEPLOYMENT_NAME'].name" \
  -o tsv 2>/dev/null || echo "")

if [ -n "$EXISTING" ]; then
  log_warn "Deployment '$DEPLOYMENT_NAME' already exists. Skipping creation."
  log_info "To update, delete the deployment first:"
  echo "  az cognitiveservices account deployment delete \\"
  echo "    --resource-group $RESOURCE_GROUP \\"
  echo "    --name $AI_SERVICES_NAME \\"
  echo "    --deployment-name $DEPLOYMENT_NAME"
  exit 0
fi

# ==============================================================================
# Deploy the model
# ==============================================================================

log_info "Deploying model '$MODEL_NAME' as '$DEPLOYMENT_NAME'..."

# Create the deployment
az cognitiveservices account deployment create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AI_SERVICES_NAME" \
  --deployment-name "$DEPLOYMENT_NAME" \
  --model-name "$MODEL_NAME" \
  --model-version "$MODEL_VERSION" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name Standard

log_info "Waiting for deployment to complete..."
sleep 10

# ==============================================================================
# Verify deployment
# ==============================================================================

log_info "Verifying deployment..."

DEPLOYMENT_STATUS=$(az cognitiveservices account deployment show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AI_SERVICES_NAME" \
  --deployment-name "$DEPLOYMENT_NAME" \
  --query "properties.provisioningState" \
  -o tsv)

if [ "$DEPLOYMENT_STATUS" = "Succeeded" ]; then
  log_info "✅ Model deployment successful!"
  
  # Get endpoint
  ENDPOINT=$(az cognitiveservices account show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$AI_SERVICES_NAME" \
    --query "properties.endpoint" \
    -o tsv)
  
  echo ""
  echo "Deployment Details:"
  echo "  Endpoint: $ENDPOINT"
  echo "  Model: $MODEL_NAME"
  echo "  Deployment Name: $DEPLOYMENT_NAME"
  echo ""
  echo "Test with:"
  echo "  curl \"${ENDPOINT}openai/deployments/${DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview\" \\"
  echo "    -H \"api-key: \$(az cognitiveservices account keys list -g $RESOURCE_GROUP -n $AI_SERVICES_NAME --query key1 -o tsv)\" \\"
  echo "    -H \"Content-Type: application/json\" \\"
  echo "    -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Hello!\"}]}'"
else
  log_error "Deployment status: $DEPLOYMENT_STATUS"
  log_error "Check Azure portal for details"
  exit 1
fi

log_info "Model deployment complete! Next step: ./scripts/create-agent.sh"
