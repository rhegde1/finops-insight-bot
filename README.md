# Azure AI Foundry FinOps Cost Agent

A complete, runnable demo that uses Terraform to provision Azure AI Foundry infrastructure and a serverless FinOps Cost Agent that queries Azure Cost Management.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Deployment Steps](#deployment-steps)
- [Testing the API](#testing-the-api)
- [Test Chat Examples](#test-chat-examples)
- [Hardening for Production](#hardening-for-production)
- [Limitations](#limitations)
- [Cleanup](#cleanup)

## 🔧 Prerequisites

### Required Tools
- **Terraform** >= 1.6.0
- **Azure CLI** >= 2.55.0
- **Node.js** >= 20.0.0
- **jq** (for script parsing)

### Required Azure Permissions
- **Subscription**: Owner or Contributor + User Access Administrator
- **Azure AD**: Ability to create service principals (for Terraform)
- **Cost Management**: Cost Management Reader (assigned by Terraform)

### Install Prerequisites

```bash
# macOS
brew install terraform azure-cli node jq

# Ubuntu/Debian
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
sudo apt update && sudo apt install terraform
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs jq

# Windows (PowerShell as Admin)
winget install Hashicorp.Terraform
winget install Microsoft.AzureCLI
winget install OpenJS.NodeJS
winget install stedolan.jq
```

## 🚀 Quick Start

```bash
# 1. Clone and configure
git clone <this-repo>
cd azure-ai-foundry-finops
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit terraform/terraform.tfvars with your subscription_id and tenant_id

# 2. Login to Azure
az login
az account set --subscription "<your-subscription-id>"

# 3. Deploy infrastructure
cd terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# 4. Deploy model and function
cd ..
chmod +x scripts/*.sh
./scripts/deploy-model.sh
./scripts/deploy-function.sh
./scripts/create-agent.sh

# 5. Test the API
FUNC_URL=$(cd terraform && terraform output -raw function_app_url)
curl "$FUNC_URL/api/health"
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Azure Subscription                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Resource Group                               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   Key Vault  │  │   Storage    │  │ App Insights │              │   │
│  │  │   (Secrets)  │  │  (Artifacts) │  │ (Telemetry)  │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Azure AI Foundry Hub                        │ │   │
│  │  │  ┌──────────────────────────────────────────────────────────┐ │ │   │
│  │  │  │                 AI Foundry Project                       │ │ │   │
│  │  │  │  ┌────────────────┐    ┌─────────────────────────────┐  │ │ │   │
│  │  │  │  │  gpt-4o-mini   │───▶│   FinOps Cost Agent         │  │ │ │   │
│  │  │  │  │  (Deployment)  │    │   (System Instructions)     │  │ │ │   │
│  │  │  │  └────────────────┘    └─────────────────────────────┘  │ │ │   │
│  │  │  └──────────────────────────────────────────────────────────┘ │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                    │                                 │   │
│  │                                    │ Tool Calls                      │   │
│  │                                    ▼                                 │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │              Azure Functions (Consumption Plan)                 │ │   │
│  │  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │ │   │
│  │  │  │  /health   │ │  /summary  │ │   /top     │ │  /byTag    │   │ │   │
│  │  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │ │   │
│  │  │  ┌────────────┐                                                │ │   │
│  │  │  │   /delta   │  ◀─── Managed Identity (User Assigned)         │ │   │
│  │  │  └────────────┘                                                │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                    │                                 │   │
│  └────────────────────────────────────│─────────────────────────────────┘   │
│                                       │                                      │
│                                       ▼                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    Azure Cost Management API                           │ │
│  │                    (Subscription Scope Query)                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Resource Summary

| Resource | Managed By | Purpose |
|----------|------------|---------|
| Resource Group | Terraform | Container for all resources |
| Log Analytics Workspace | Terraform | Centralized logging |
| Application Insights | Terraform | Function telemetry |
| Storage Account (main) | Terraform | AI Foundry artifacts |
| Storage Account (func) | Terraform | Function App runtime |
| Key Vault | Terraform | Secrets management |
| User Assigned Identity | Terraform | Function App identity |
| Azure AI Services | Terraform | OpenAI model hosting |
| AI Foundry Hub | Terraform (AzAPI) | AI workspace container |
| AI Foundry Project | Terraform (AzAPI) | Project workspace |
| Model Deployment | Script | gpt-4o-mini deployment |
| Function App | Terraform | Cost query endpoints |
| App Service Plan | Terraform | Consumption plan |
| RBAC Assignments | Terraform | Cost Management Reader |
| AI Agent | Manual/Script | FinOps assistant |

## 📦 Deployment Steps

### Step 1: Configure Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
subscription_id = "your-subscription-id"
tenant_id       = "your-tenant-id"
location        = "eastus2"
prefix          = "finops"
```

### Step 2: Initialize and Apply Terraform

```bash
# Initialize providers
terraform init

# Review the plan
terraform plan -out=tfplan

# Apply the infrastructure
terraform apply tfplan

# View outputs
terraform output
```

### Step 3: Deploy the AI Model

```bash
cd ..
./scripts/deploy-model.sh
```

This deploys `gpt-4o-mini` to Azure AI Services.

### Step 4: Deploy Function App Code

```bash
./scripts/deploy-function.sh
```

This builds and deploys the TypeScript functions.

### Step 5: Create the AI Agent

```bash
./scripts/create-agent.sh
```

This outputs instructions for creating the agent in Azure AI Foundry portal.

## 🧪 Testing the API

### Get Function URL

```bash
FUNC_URL=$(cd terraform && terraform output -raw function_app_url)
echo "Function URL: $FUNC_URL"
```

### Health Check

```bash
curl "$FUNC_URL/api/health" | jq
```

### Cost Summary (Last 7 Days by Service)

```bash
curl -X POST "$FUNC_URL/api/cost/summary" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": "Last7Days",
    "groupBy": "ServiceName"
  }' | jq
```

### Top 5 Most Expensive Resources

```bash
curl -X POST "$FUNC_URL/api/cost/top" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": "MonthToDate",
    "groupBy": "Resource",
    "top": 5
  }' | jq
```

### Costs by Environment Tag

```bash
curl -X POST "$FUNC_URL/api/cost/byTag" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": "Last30Days",
    "tagKey": "environment"
  }' | jq
```

### Week-over-Week Cost Delta

```bash
curl -X POST "$FUNC_URL/api/cost/delta" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPeriod": "Last7Days",
    "comparisonPeriod": "Previous7Days",
    "groupBy": "ServiceName"
  }' | jq
```

## 💬 Test Chat Examples

Once the agent is configured in Azure AI Foundry, try these prompts:

### Basic Cost Queries

1. **"What did we spend last month?"**
   - Agent calls `get_cost_summary` with `PreviousMonth`
   - Returns total and breakdown by default dimension

2. **"Show me the top 5 most expensive resources this month"**
   - Agent calls `get_top_costs` with `MonthToDate`, `top=5`
   - Returns ranked list of resources

3. **"Break down our costs by resource group for the past 30 days"**
   - Agent calls `get_cost_summary` with `Last30Days`, `groupBy=ResourceGroup`

### Tag-Based Analysis

4. **"What's the cost breakdown by environment tag?"**
   - Agent calls `get_costs_by_tag` with `tagKey=environment`
   - Shows costs per environment (dev, staging, prod)

5. **"Show me costs for the 'costcenter' tag last month"**
   - Agent calls `get_costs_by_tag` with `PreviousMonth`, `tagKey=costcenter`

### Trend Analysis

6. **"How do this week's costs compare to last week?"**
   - Agent calls `get_cost_delta` with `Last7Days` vs `Previous7Days`
   - Shows absolute and percentage change

7. **"What changed in our spending this month compared to last month?"**
   - Agent calls `get_cost_delta` with `MonthToDate` vs `PreviousMonth`
   - Highlights increases and decreases

8. **"Which services had the biggest cost increase this week?"**
   - Agent calls `get_cost_delta` with `groupBy=ServiceName`
   - Sorts by delta to show biggest movers

## 🔒 Hardening for Production

### 1. Enable Private Endpoints

```hcl
# In terraform.tfvars
enable_private_endpoints = true
```

Requires:
- Virtual Network with subnets
- Private DNS zones
- VNet integration for Function App

### 2. Restrict Network Access

```hcl
# In terraform.tfvars
allowed_ip_ranges = ["203.0.113.0/24", "198.51.100.0/24"]
```

### 3. Enable Function Authentication

Update `host.json` to require function keys:
```json
{
  "extensions": {
    "http": {
      "authLevel": "function"
    }
  }
}
```

### 4. Enable Key Vault Purge Protection

```hcl
# In main.tf, update azurerm_key_vault
purge_protection_enabled = true
```

### 5. Add Azure Monitor Alerts

```hcl
resource "azurerm_monitor_metric_alert" "high_cost" {
  name                = "high-cost-alert"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = ["/subscriptions/${var.subscription_id}"]
  # ... alert configuration
}
```

## ⚠️ Limitations / Known Gaps

### Current Limitations

1. **Subscription Scope Only**: The cost API queries are limited to subscription scope. Resource group or management group scopes require code changes.

2. **Agent Manual Setup**: Azure AI Foundry Agents are in preview and require manual configuration through the portal or SDK.

3. **No Real-time Data**: Azure Cost Management data has a delay of up to 24 hours.

4. **Model Deployment via CLI**: The AI model deployment uses Azure CLI as azurerm doesn't fully support Azure AI Services deployments.

5. **Public Endpoints**: Demo uses public endpoints. Production should use private endpoints.

### Known Issues

- **Tag Query Limitations**: Not all resources have tags; untagged resources appear as "Unknown"
- **Currency**: Assumes single currency (USD). Multi-currency subscriptions may show unexpected results
- **Rate Limiting**: Cost Management API has rate limits; high-frequency queries may be throttled

### Future Improvements

- [ ] Add management group scope support
- [ ] Implement anomaly detection
- [ ] Add reservation recommendations
- [ ] Support budget alerts integration
- [ ] Add Savings Plan analysis

## 🧹 Cleanup

```bash
# Destroy all resources
cd terraform
terraform destroy

# Or destroy specific resources
terraform destroy -target=azurerm_linux_function_app.main
```

## 📁 Repository Structure

```
azure-ai-foundry-finops/
├── terraform/
│   ├── providers.tf          # Provider configuration
│   ├── versions.tf           # Terraform/provider versions
│   ├── variables.tf          # Input variables + locals
│   ├── main.tf               # Main infrastructure
│   ├── outputs.tf            # Output values
│   └── terraform.tfvars.example
├── function/
│   ├── package.json          # Node.js dependencies
│   ├── tsconfig.json         # TypeScript config
│   ├── host.json             # Function App settings
│   ├── local.settings.json   # Local dev settings
│   └── src/
│       ├── index.ts          # Function exports
│       ├── lib/
│       │   └── costClient.ts # Cost Management client
│       └── functions/
│           ├── health.ts     # Health check endpoint
│           ├── costSummary.ts
│           ├── costTop.ts
│           ├── costByTag.ts
│           └── costDelta.ts
├── scripts/
│   ├── deploy-model.sh       # Deploy AI model
│   ├── deploy-function.sh    # Deploy Function App
│   └── create-agent.sh       # Configure AI Agent
└── README.md
```

## 📚 Model Choice Justification

**gpt-4o-mini** was selected for this FinOps agent because:

1. **Cost-Effective**: Lower cost per token compared to gpt-4o, appropriate for a cost-focused demo
2. **Fast Response**: Optimized for quick responses, good for interactive chat
3. **Sufficient Capability**: Handles structured data (cost breakdowns, tables) well
4. **Tool Calling Support**: Full support for function/tool calling required by the agent

For production with complex analysis needs, consider upgrading to `gpt-4o` or `gpt-4-turbo`.

## 📄 License

MIT License - See LICENSE file for details.
