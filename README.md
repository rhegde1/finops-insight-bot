# Azure AI Foundry FinOps Cost Agent

A complete, runnable demo that uses Terraform to provision Azure infrastructure and a serverless FinOps Cost Chatbot that queries Azure Cost Management using Azure OpenAI with function calling.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Deployment Steps](#deployment-steps)
- [Testing](#testing)
- [Chat API](#chat-api)
- [Cost API Endpoints](#cost-api-endpoints)
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
- **Cost Management**: Cost Management Reader (assigned by Terraform)

## 🚀 Quick Start

```bash
# 1. Clone and configure
git clone <this-repo>
cd finops-insight-bot
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

# 4. Deploy Function App
cd ..
npm install
./scripts/deploy-function.sh

# 5. Test the chatbot
FUNC_URL=$(cd terraform && terraform output -raw function_app_url)
curl -X POST "$FUNC_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What were my costs last month?"}'
```

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Azure Subscription                        │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Key Vault   │  │   Storage    │  │  App Insights       │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Azure Functions (Node.js)                  │  │
│  │                                                         │  │
│  │  POST /api/chat ──► Azure OpenAI (gpt-4o-mini)         │  │
│  │       │                    │                            │  │
│  │       │              Tool calls (in-process)            │  │
│  │       │                    │                            │  │
│  │       ▼                    ▼                            │  │
│  │  CostClient ──────► Azure Cost Management API          │  │
│  │                                                         │  │
│  │  Also: /api/health, /api/cost/summary, /top, etc.      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Azure AI Services (gpt-4o-mini deployment)             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  React Frontend (Dashboard + Chat UI)                   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Key design**: The `/api/chat` endpoint handles the full AI tool-call loop **in-process**. When the model wants cost data, it calls the CostClient directly — no external HTTP hops, no broken orchestration, no hallucination.

## 📦 Deployment Steps

### Step 1: Configure Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your `subscription_id` and `tenant_id`.

### Step 2: Deploy Infrastructure

```bash
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

This creates: Resource Group, AI Services, Function App, Key Vault, Storage, RBAC assignments, and the gpt-4o-mini model deployment.

### Step 3: Deploy Function App

```bash
cd ..
npm install
./scripts/deploy-function.sh
```

### Step 4: Test

```bash
# Health check
FUNC_URL=$(cd terraform && terraform output -raw function_app_url)
curl "$FUNC_URL/api/health"

# Chat with the agent
curl -X POST "$FUNC_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What did we spend last month?"}'

# Or run the test script
pip install requests
python scripts/test-chat.py
```

## 💬 Chat API

### POST /api/chat

Send natural language questions about your Azure costs.

**Request:**
```json
{
  "message": "What were my costs last month?",
  "history": [
    {"role": "user", "content": "previous message"},
    {"role": "assistant", "content": "previous response"}
  ]
}
```

**Response:**
```json
{
  "reply": "Your total Azure costs for the previous month were **$142.57 USD**...",
  "usage": {
    "prompt_tokens": 450,
    "completion_tokens": 180,
    "total_tokens": 630
  }
}
```

### Example Prompts

| Prompt | What happens |
|--------|-------------|
| "What did we spend last month?" | Calls `get_cost_summary` with PreviousMonth |
| "Show me top 5 most expensive resources" | Calls `get_top_costs` with top=5 |
| "Compare this week to last week" | Calls `get_cost_delta` |
| "Break down costs by environment tag" | Calls `get_costs_by_tag` with tagKey=environment |
| "Which services cost the most this month?" | Calls `get_cost_summary` with groupBy=ServiceName |

## 📊 Cost API Endpoints

Direct cost query endpoints (also used internally by `/api/chat`):

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Service health check |
| POST | `/api/cost/summary` | Cost summary with optional grouping |
| POST | `/api/cost/top` | Top N most expensive items |
| POST | `/api/cost/byTag` | Costs grouped by tag key |
| POST | `/api/cost/delta` | Period-over-period comparison |

## 🔒 Hardening for Production

- Enable private endpoints (`enable_private_endpoints = true`)
- Restrict IPs (`allowed_ip_ranges = ["203.0.113.0/24"]`)
- Enable function-level auth keys
- Enable Key Vault purge protection
- Add Azure Monitor alerts

## ⚠️ Limitations

- **Subscription scope only** — resource group/management group scopes require code changes
- **~24h data delay** — Azure Cost Management data is not real-time
- **Tag gaps** — untagged resources appear as "Unknown"
- **Single currency** — assumes USD

## 🧹 Cleanup

```bash
cd terraform
terraform destroy
```

## 📁 Repository Structure

```
finops-insight-bot/
├── src/                          # React frontend (Vite + Tailwind)
│   ├── components/
│   │   ├── CostDashboard.tsx     # Main dashboard with metrics
│   │   └── ChatBot.tsx           # Chat interface for AI agent
│   ├── hooks/useCostData.ts      # React Query hooks
│   └── lib/costApi.ts            # API client
├── function/                     # Azure Functions backend (Node.js)
│   ├── src/
│   │   ├── functions/
│   │   │   ├── chat.ts           # AI chat endpoint (OpenAI + function calling)
│   │   │   ├── health.ts         # Health check
│   │   │   ├── costSummary.ts    # Cost summary
│   │   │   ├── costTop.ts        # Top costs
│   │   │   ├── costByTag.ts      # Costs by tag
│   │   │   └── costDelta.ts      # Period comparison
│   │   └── lib/costClient.ts     # Azure Cost Management client
│   └── openapi.json              # API specification
├── terraform/                    # Infrastructure as Code
│   ├── main.tf                   # All Azure resources
│   ├── variables.tf              # Input variables
│   ├── outputs.tf                # Terraform outputs
│   └── terraform.tfvars.example  # Configuration template
├── scripts/
│   ├── deploy-function.sh        # Deploy Function App
│   ├── create-zip.cjs            # ZIP utility for deployment
│   └── test-chat.py              # Test the chat endpoint
└── README.md
```

## 📄 License

MIT License
