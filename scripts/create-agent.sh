#!/bin/bash
# ==============================================================================
# Create FinOps Cost Agent in Azure AI Foundry
# ==============================================================================
# This script creates an AI Agent in Azure AI Foundry with tools configured
# to query Azure Cost Management.
#
# Usage: ./scripts/create-agent.sh
#
# Prerequisites:
#   - Azure CLI installed and logged in
#   - Terraform apply completed
#   - Model deployed (run deploy-model.sh first)
#   - Function App deployed with cost endpoints
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
# Configuration from Terraform outputs
# ==============================================================================

cd "$(dirname "$0")/../terraform"

log_info "Reading configuration from Terraform outputs..."

SCRIPT_VARS=$(terraform output -json script_variables)

SUBSCRIPTION_ID=$(echo "$SCRIPT_VARS" | jq -r '.subscription_id')
RESOURCE_GROUP=$(echo "$SCRIPT_VARS" | jq -r '.resource_group')
PROJECT_NAME=$(echo "$SCRIPT_VARS" | jq -r '.project_name')
FUNCTION_APP_URL=$(echo "$SCRIPT_VARS" | jq -r '.function_app_url')
DEPLOYMENT_NAME=$(echo "$SCRIPT_VARS" | jq -r '.deployment_name')
AI_SERVICES_NAME=$(echo "$SCRIPT_VARS" | jq -r '.ai_services_name')

# Agent configuration
AGENT_NAME="${PROJECT_NAME}-finops-agent"

log_info "Configuration:"
echo "  Subscription: $SUBSCRIPTION_ID"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Project: $PROJECT_NAME"
echo "  Function App URL: $FUNCTION_APP_URL"
echo "  Model Deployment: $DEPLOYMENT_NAME"
echo "  Agent Name: $AGENT_NAME"

# ==============================================================================
# System Instructions for the Agent
# ==============================================================================

SYSTEM_INSTRUCTIONS=$(cat <<'EOF'
You are a FinOps Cost Agent specialized in Azure cost management and optimization. Your role is to help users understand, analyze, and optimize their Azure spending.

## Core Responsibilities:
1. Query and present Azure cost data accurately
2. Identify cost trends and anomalies
3. Provide actionable recommendations for cost optimization
4. Explain cost breakdowns by resource group, service, resource, or tag

## Behavior Guidelines:
- **Be concise and structured**: Present data in tables or bullet points when appropriate
- **Ask clarifying questions** if the user doesn't specify:
  - Time range (default to last 7 days if not specified)
  - Grouping preference (resource group, service, resource, or tag)
  - Number of results for "top" queries (default to 10)
- **Never invent numbers**: Only respond with actual data from the cost tools
- **Provide context**: Compare costs to previous periods when relevant
- **Suggest optimizations**: Based on the data, recommend potential savings

## Available Time Ranges:
- Last7Days: Past 7 days from today
- Last30Days: Past 30 days from today  
- MonthToDate: Current month so far
- PreviousMonth: Complete previous month
- Custom: Specify exact from/to dates (YYYY-MM-DD format)

## Grouping Options:
- ResourceGroup: Group costs by Azure resource group
- ServiceName: Group by Azure service type (e.g., Virtual Machines, Storage)
- Resource: Individual resource level breakdown
- Tag: Group by a specific tag key (requires tagKey parameter)

## Response Format:
When presenting cost data:
1. State the time period and scope clearly
2. Show total cost first
3. Present breakdown in a table or list
4. Highlight significant changes or anomalies
5. Offer follow-up suggestions

## Example Interactions:
User: "What did we spend last month?"
→ Use cost/summary with PreviousMonth, then offer to drill down

User: "Show me top 5 most expensive resources"
→ Use cost/top with top=5

User: "Compare this week to last week"
→ Use cost/delta to show changes

User: "Break down costs by environment tag"
→ Use cost/byTag with tagKey="environment"
EOF
)

# ==============================================================================
# Tool Definitions (OpenAI function calling format)
# ==============================================================================

TOOLS_JSON=$(cat <<EOF
[
  {
    "type": "function",
    "function": {
      "name": "get_cost_summary",
      "description": "Get a summary of Azure costs for the subscription, optionally grouped by dimension",
      "parameters": {
        "type": "object",
        "properties": {
          "timeframe": {
            "type": "string",
            "enum": ["Last7Days", "Last30Days", "MonthToDate", "PreviousMonth", "Custom"],
            "description": "Predefined time range for the cost query"
          },
          "from": {
            "type": "string",
            "description": "Start date for Custom timeframe (YYYY-MM-DD format)"
          },
          "to": {
            "type": "string",
            "description": "End date for Custom timeframe (YYYY-MM-DD format)"
          },
          "groupBy": {
            "type": "string",
            "enum": ["ResourceGroup", "ServiceName", "Resource", "Tag"],
            "description": "Dimension to group costs by"
          }
        },
        "required": ["timeframe"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_top_costs",
      "description": "Get the top N most expensive resources or groups",
      "parameters": {
        "type": "object",
        "properties": {
          "timeframe": {
            "type": "string",
            "enum": ["Last7Days", "Last30Days", "MonthToDate", "PreviousMonth", "Custom"],
            "description": "Predefined time range"
          },
          "from": {
            "type": "string",
            "description": "Start date for Custom timeframe"
          },
          "to": {
            "type": "string",
            "description": "End date for Custom timeframe"
          },
          "groupBy": {
            "type": "string",
            "enum": ["ResourceGroup", "ServiceName", "Resource"],
            "description": "What to rank by"
          },
          "top": {
            "type": "integer",
            "description": "Number of results to return (default: 10)",
            "default": 10
          }
        },
        "required": ["timeframe"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_costs_by_tag",
      "description": "Get costs grouped by a specific tag key",
      "parameters": {
        "type": "object",
        "properties": {
          "timeframe": {
            "type": "string",
            "enum": ["Last7Days", "Last30Days", "MonthToDate", "PreviousMonth", "Custom"],
            "description": "Predefined time range"
          },
          "from": {
            "type": "string",
            "description": "Start date for Custom timeframe"
          },
          "to": {
            "type": "string",
            "description": "End date for Custom timeframe"
          },
          "tagKey": {
            "type": "string",
            "description": "The tag key to group costs by (e.g., 'environment', 'costcenter', 'owner')"
          }
        },
        "required": ["timeframe", "tagKey"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_cost_delta",
      "description": "Compare costs between two periods to identify changes",
      "parameters": {
        "type": "object",
        "properties": {
          "currentPeriod": {
            "type": "string",
            "enum": ["Last7Days", "Last30Days", "MonthToDate"],
            "description": "The current/recent period to analyze"
          },
          "comparisonPeriod": {
            "type": "string",
            "enum": ["Previous7Days", "Previous30Days", "PreviousMonth"],
            "description": "The historical period to compare against"
          },
          "groupBy": {
            "type": "string",
            "enum": ["ResourceGroup", "ServiceName", "Resource"],
            "description": "What dimension to compare"
          }
        },
        "required": ["currentPeriod", "comparisonPeriod"]
      }
    }
  }
]
EOF
)

# ==============================================================================
# Get Function App key for tool authentication
# ==============================================================================

log_step "Retrieving Function App key..."

FUNCTION_KEY=$(az functionapp keys list \
  --resource-group "$RESOURCE_GROUP" \
  --name "$(echo "$SCRIPT_VARS" | jq -r '.function_app_name')" \
  --query "functionKeys.default" \
  -o tsv 2>/dev/null || echo "")

if [ -z "$FUNCTION_KEY" ]; then
  log_warn "Could not retrieve function key. Tools will use anonymous access."
  log_warn "For production, configure function-level authentication."
  FUNCTION_KEY="anonymous"
fi

# ==============================================================================
# Store function key in Key Vault (optional)
# ==============================================================================

KEY_VAULT_NAME=$(terraform output -raw key_vault_name)

if [ "$FUNCTION_KEY" != "anonymous" ]; then
  log_step "Storing function key in Key Vault..."
  
  az keyvault secret set \
    --vault-name "$KEY_VAULT_NAME" \
    --name "finops-function-key" \
    --value "$FUNCTION_KEY" \
    --description "Function App key for FinOps Cost Agent" \
    > /dev/null 2>&1 || log_warn "Could not store key in Key Vault"
fi

# ==============================================================================
# Create Agent Configuration File
# ==============================================================================

log_step "Creating agent configuration..."

AGENT_CONFIG=$(cat <<EOF
{
  "name": "$AGENT_NAME",
  "description": "Azure FinOps Cost Agent for subscription cost analysis and optimization",
  "model": "$DEPLOYMENT_NAME",
  "instructions": $(echo "$SYSTEM_INSTRUCTIONS" | jq -Rs .),
  "tools": $TOOLS_JSON,
  "tool_resources": {
    "function_endpoints": {
      "base_url": "$FUNCTION_APP_URL/api",
      "endpoints": {
        "get_cost_summary": "/cost/summary",
        "get_top_costs": "/cost/top",
        "get_costs_by_tag": "/cost/byTag",
        "get_cost_delta": "/cost/delta"
      },
      "authentication": {
        "type": "api_key",
        "header": "x-functions-key",
        "key_vault_secret": "finops-function-key"
      }
    }
  },
  "metadata": {
    "created_by": "terraform-finops-demo",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "version": "1.0.0"
  }
}
EOF
)

# Save agent configuration
AGENT_CONFIG_FILE="../agent-config.json"
echo "$AGENT_CONFIG" | jq . > "$AGENT_CONFIG_FILE"
log_info "Agent configuration saved to: $AGENT_CONFIG_FILE"

# ==============================================================================
# Azure AI Foundry Agent Creation
# ==============================================================================

log_step "Creating agent in Azure AI Foundry..."

cat <<EOF

================================================================================
MANUAL STEPS REQUIRED - Azure AI Foundry Agent Setup
================================================================================

Azure AI Foundry Agents are currently in preview and require manual setup via
the Azure AI Foundry portal or the Azure AI Agent Service SDK.

1. Open Azure AI Foundry:
   $(terraform output -raw ai_foundry_portal_url)

2. Navigate to: Agents > Create Agent

3. Configure the agent with these settings:

   Name: $AGENT_NAME
   
   Model: $DEPLOYMENT_NAME
   
   System Instructions: (copy from agent-config.json)
   
   Tools: Add the following function tools:
   - get_cost_summary
   - get_top_costs  
   - get_costs_by_tag
   - get_cost_delta

4. For each tool, configure the endpoint:
   Base URL: $FUNCTION_APP_URL/api
   
   Endpoints:
   - /cost/summary   (POST) - for get_cost_summary
   - /cost/top       (POST) - for get_top_costs
   - /cost/byTag     (POST) - for get_costs_by_tag
   - /cost/delta     (POST) - for get_cost_delta

5. Save the agent and test with example prompts

================================================================================
ALTERNATIVE: Programmatic Agent Creation (Preview)
================================================================================

If using the Azure AI Agent Service SDK, you can use the configuration file:
   cat $AGENT_CONFIG_FILE

Python SDK example:
   from azure.ai.projects import AIProjectClient
   from azure.identity import DefaultAzureCredential
   
   client = AIProjectClient(
       credential=DefaultAzureCredential(),
       subscription_id="$SUBSCRIPTION_ID",
       resource_group_name="$RESOURCE_GROUP",
       project_name="$PROJECT_NAME"
   )
   
   # Create agent with tools
   agent = client.agents.create_agent(
       model="$DEPLOYMENT_NAME",
       name="$AGENT_NAME",
       instructions=system_instructions,
       tools=tools_definition
   )

================================================================================
EOF

log_info "Agent configuration complete!"
log_info "Next step: Deploy the Function App code with: ./scripts/deploy-function.sh"
