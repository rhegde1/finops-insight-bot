# ==============================================================================
# Required Variables
# ==============================================================================

variable "subscription_id" {
  type        = string
  description = "Azure Subscription ID where resources will be deployed"
}

variable "tenant_id" {
  type        = string
  description = "Azure Tenant ID"
}

# ==============================================================================
# Optional Variables with Defaults
# ==============================================================================

variable "location" {
  type        = string
  description = "Azure region for resource deployment"
  default     = "eastus2"
}

variable "prefix" {
  type        = string
  description = "Prefix for all resource names (lowercase, alphanumeric)"
  default     = "finops"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,10}$", var.prefix))
    error_message = "Prefix must be 3-11 lowercase alphanumeric characters starting with a letter."
  }
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources"
  default = {
    Environment = "demo"
    Project     = "azure-ai-foundry-finops"
    ManagedBy   = "terraform"
  }
}

# ==============================================================================
# AI Foundry Configuration
# ==============================================================================

variable "foundry_model_name" {
  type        = string
  description = "AI model to deploy in Foundry (e.g., gpt-4o, gpt-4o-mini)"
  default     = "gpt-4o-mini"
}

variable "foundry_deployment_name" {
  type        = string
  description = "Name for the model deployment"
  default     = "finops-chat"
}

variable "foundry_model_version" {
  type        = string
  description = "Model version to deploy"
  default     = "2024-07-18"
}

# ==============================================================================
# Function App Configuration
# ==============================================================================

variable "function_app_sku" {
  type        = string
  description = "SKU for Function App (Y1 for Consumption, EP1-3 for Premium)"
  default     = "Y1"
}

variable "function_runtime_version" {
  type        = string
  description = "Azure Functions runtime version"
  default     = "~4"
}

variable "node_version" {
  type        = string
  description = "Node.js version for the Function App"
  default     = "20"
}

# ==============================================================================
# Security Configuration
# ==============================================================================

variable "allowed_ip_ranges" {
  type        = list(string)
  description = "IP ranges allowed to access Function App (empty = public access)"
  default     = []
}

variable "enable_private_endpoints" {
  type        = bool
  description = "Enable private endpoints for resources (requires additional networking setup)"
  default     = false
}

# ==============================================================================
# Local Variables
# ==============================================================================

locals {
  # Generate unique suffix for globally unique names
  resource_suffix = random_string.suffix.result

  # Standard resource naming
  resource_group_name     = "${var.prefix}-rg-${local.resource_suffix}"
  log_analytics_name      = "${var.prefix}-log-${local.resource_suffix}"
  app_insights_name       = "${var.prefix}-appi-${local.resource_suffix}"
  storage_account_name    = "${var.prefix}st${local.resource_suffix}"
  func_storage_name       = "${var.prefix}stfunc${local.resource_suffix}"
  key_vault_name          = "${var.prefix}-kv-${local.resource_suffix}"
  managed_identity_name   = "${var.prefix}-id-func-${local.resource_suffix}"
  function_app_name       = "${var.prefix}-func-${local.resource_suffix}"
  app_service_plan_name   = "${var.prefix}-asp-${local.resource_suffix}"
  ai_services_name        = "${var.prefix}-ai-${local.resource_suffix}"
  foundry_hub_name        = "${var.prefix}-hub-${local.resource_suffix}"
  foundry_project_name    = "${var.prefix}-project-${local.resource_suffix}"

  # Common tags
  common_tags = merge(var.tags, {
    CreatedAt = timestamp()
  })
}

resource "random_string" "suffix" {
  length  = 6
  lower   = true
  upper   = false
  numeric = true
  special = false
}
