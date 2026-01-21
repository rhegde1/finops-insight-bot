# ==============================================================================
# Terraform Variables - Example Configuration
# ==============================================================================
# Copy this file to terraform.tfvars and update with your values:
#   cp terraform.tfvars.example terraform.tfvars
# ==============================================================================

# Required: Your Azure subscription and tenant
subscription_id = "151761fe-10ae-4c1c-9241-2e45cc18bd68"
tenant_id       = "fa8daedc-a5d4-4da1-acdc-f0a9532b687d"

# Optional: Customize the deployment
location = "eastus2"
prefix   = "finops"

# Optional: Custom tags
tags = {
  Environment = "demo"
  Project     = "azure-ai-foundry-finops"
  ManagedBy   = "terraform"
  Owner       = "cloudwithritesh"
}

# Optional: AI Model configuration
foundry_model_name      = "gpt-4o-mini"
foundry_deployment_name = "finops-chat"
foundry_model_version   = "2024-07-18"

# Optional: Function App configuration
function_app_sku         = "Y1" # Y1 = Consumption, EP1-3 = Premium
function_runtime_version = "~4"
node_version             = "20"

# Optional: Security settings (for production)
# allowed_ip_ranges      = ["203.0.113.0/24"]  # Restrict access
# enable_private_endpoints = true              # Requires VNet setup
