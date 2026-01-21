# ==============================================================================
# Azure AI Foundry Demo Baseline - Main Infrastructure
# ==============================================================================
# This Terraform configuration provisions the foundational Azure resources
# required for an Azure AI Foundry demo with a FinOps Cost Agent.
#
# TERRAFORM-MANAGED RESOURCES:
#   - Resource Group
#   - Log Analytics Workspace
#   - Application Insights
#   - Storage Accounts (artifacts + functions)
#   - Key Vault
#   - User Assigned Managed Identity
#   - Azure AI Services (for Foundry)
#   - Azure AI Foundry Hub (via AzAPI)
#   - Azure AI Foundry Project (via AzAPI)
#   - Function App + App Service Plan
#   - RBAC Assignments
#
# SCRIPT-MANAGED RESOURCES (see /scripts/):
#   - Model Deployment (gpt-4o-mini)
#   - Agent Configuration
#   - Tool Registration
# ==============================================================================

data "azurerm_client_config" "current" {}

# ==============================================================================
# Resource Group
# ==============================================================================

resource "azurerm_resource_group" "main" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.common_tags
}

# ==============================================================================
# Monitoring: Log Analytics + Application Insights
# ==============================================================================

resource "azurerm_log_analytics_workspace" "main" {
  name                = local.log_analytics_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

resource "azurerm_application_insights" "main" {
  name                = local.app_insights_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  tags                = local.common_tags
}

# ==============================================================================
# Storage Accounts
# ==============================================================================

# Storage for demo artifacts and AI Foundry
resource "azurerm_storage_account" "main" {
  name                     = local.storage_account_name
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"

  blob_properties {
    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD", "POST", "PUT"]
      allowed_origins    = ["https://mlworkspace.azure.ai", "https://ml.azure.com"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 3600
    }
  }

  tags = local.common_tags
}

# Storage container for AI Foundry
resource "azurerm_storage_container" "foundry" {
  name                  = "foundry"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Storage for Azure Functions runtime
resource "azurerm_storage_account" "functions" {
  name                     = local.func_storage_name
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  tags                     = local.common_tags
}

# ==============================================================================
# Key Vault
# ==============================================================================

resource "azurerm_key_vault" "main" {
  name                       = local.key_vault_name
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false # Demo only - enable for production
  enable_rbac_authorization  = true  # Using RBAC instead of access policies

  # Network rules - public for demo
  network_acls {
    default_action = "Allow"
    bypass         = "AzureServices"
  }

  tags = local.common_tags
}

# ==============================================================================
# Managed Identity for Function App
# ==============================================================================

resource "azurerm_user_assigned_identity" "function" {
  name                = local.managed_identity_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags
}

# ==============================================================================
# Azure AI Services (Required for Foundry)
# ==============================================================================

resource "azurerm_cognitive_account" "ai_services" {
  name                  = local.ai_services_name
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = local.ai_services_name

  identity {
    type = "SystemAssigned"
  }

  tags = local.common_tags
}

# Store AI Services API key in Key Vault
resource "azurerm_key_vault_secret" "ai_services_key" {
  name         = "ai-services-api-key"
  value        = azurerm_cognitive_account.ai_services.primary_access_key
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_role_assignment.current_user_keyvault,
    azurerm_cognitive_account.ai_services
  ]
}

# ==============================================================================
# Azure AI Foundry Hub (via AzAPI - not fully supported in azurerm)
# ==============================================================================

resource "azapi_resource" "ai_hub" {
  type      = "Microsoft.MachineLearningServices/workspaces@2024-04-01-preview"
  name      = local.foundry_hub_name
  location  = azurerm_resource_group.main.location
  parent_id = azurerm_resource_group.main.id

  identity {
    type = "SystemAssigned"
  }

  body = jsonencode({
    kind = "Hub"
    properties = {
      friendlyName        = "${var.prefix} AI Foundry Hub"
      description         = "Azure AI Foundry Hub for FinOps Cost Agent demo"
      storageAccount      = azurerm_storage_account.main.id
      keyVault            = azurerm_key_vault.main.id
      applicationInsights = azurerm_application_insights.main.id
      publicNetworkAccess = "Enabled"
      v1LegacyMode        = false
      managedNetwork = {
        isolationMode = "Disabled" # Demo - use AllowInternetOutbound for production
      }
    }
    sku = {
      name = "Basic"
      tier = "Basic"
    }
  })

  tags = local.common_tags

  depends_on = [
    azurerm_key_vault.main,
    azurerm_storage_account.main,
    azurerm_application_insights.main
  ]
}

# ==============================================================================
# Azure AI Foundry Project (via AzAPI)
# ==============================================================================

resource "azapi_resource" "ai_project" {
  type      = "Microsoft.MachineLearningServices/workspaces@2024-04-01-preview"
  name      = local.foundry_project_name
  location  = azurerm_resource_group.main.location
  parent_id = azurerm_resource_group.main.id

  identity {
    type = "SystemAssigned"
  }

  body = jsonencode({
    kind = "Project"
    properties = {
      friendlyName        = "${var.prefix} FinOps Project"
      description         = "Azure AI Foundry Project for FinOps Cost Agent"
      hubResourceId       = azapi_resource.ai_hub.id
      publicNetworkAccess = "Enabled"
    }
    sku = {
      name = "Basic"
      tier = "Basic"
    }
  })

  tags = local.common_tags

  depends_on = [azapi_resource.ai_hub]
}

# ==============================================================================
# AI Services Connection to Hub
# ==============================================================================

# Read AI Services API key from Key Vault
data "azurerm_key_vault_secret" "ai_services_key" {
  name         = "ai-services-api-key"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_key_vault_secret.ai_services_key
  ]
}

resource "azapi_resource" "ai_services_connection" {
  type      = "Microsoft.MachineLearningServices/workspaces/connections@2024-04-01-preview"
  name      = "ai-services-connection"
  parent_id = azapi_resource.ai_hub.id

  body = jsonencode({
    properties = {
      category      = "OpenAI"
      target        = azurerm_cognitive_account.ai_services.endpoint
      authType      = "ApiKey"
      isSharedToAll = true
      credentials = {
        key = data.azurerm_key_vault_secret.ai_services_key.value
      }
      metadata = {
        ApiType    = "Azure"
        ResourceId = azurerm_cognitive_account.ai_services.id
      }
    }
  })

  depends_on = [
    azapi_resource.ai_hub,
    azurerm_cognitive_account.ai_services,
    data.azurerm_key_vault_secret.ai_services_key
  ]
}

# ==============================================================================
# Function App Infrastructure
# ==============================================================================

resource "azurerm_service_plan" "main" {
  name                = local.app_service_plan_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = "B2" # Basic tier with 3.5 GB RAM, 2 vCores
  tags                = local.common_tags
}

resource "azurerm_linux_function_app" "main" {
  name                       = local.function_app_name
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  service_plan_id            = azurerm_service_plan.main.id
  storage_account_name       = azurerm_storage_account.functions.name
  storage_account_access_key = azurerm_storage_account.functions.primary_access_key

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.function.id]
  }

  site_config {
    application_stack {
      node_version = var.node_version
    }

    cors {
      allowed_origins     = ["*"] # Demo - restrict in production
      support_credentials = false
    }

    application_insights_key               = azurerm_application_insights.main.instrumentation_key
    application_insights_connection_string = azurerm_application_insights.main.connection_string
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME"       = "node"
    "WEBSITE_NODE_DEFAULT_VERSION"   = "~${var.node_version}"
    "SUBSCRIPTION_ID"                = var.subscription_id
    "AZURE_TENANT_ID"                = var.tenant_id
    "AZURE_CLIENT_ID"                = azurerm_user_assigned_identity.function.client_id
    "COST_API_VERSION"               = "2023-11-01"
    "ALLOWED_ORIGINS"                = "*"
    "SCM_DO_BUILD_DURING_DEPLOYMENT" = "true"
    "ENABLE_ORYX_BUILD"              = "true"

    # Key Vault reference for function key (if needed)
    # "FUNCTION_APP_KEY" = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/function-app-key/)"
  }

  tags = local.common_tags

  depends_on = [
    azurerm_user_assigned_identity.function,
    azurerm_application_insights.main
  ]
}

# ==============================================================================
# RBAC Assignments
# ==============================================================================

# Function App identity -> Cost Management Reader at subscription scope
resource "azurerm_role_assignment" "function_cost_reader" {
  scope                = "/subscriptions/${var.subscription_id}"
  role_definition_name = "Cost Management Reader"
  principal_id         = azurerm_user_assigned_identity.function.principal_id

  lifecycle {
    prevent_destroy = true
  }
}

# Function App identity -> Reader at subscription scope
resource "azurerm_role_assignment" "function_reader" {
  scope                = "/subscriptions/${var.subscription_id}"
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.function.principal_id

  lifecycle {
    prevent_destroy = true
  }
}

# Function App identity -> Key Vault Secrets User
resource "azurerm_role_assignment" "function_keyvault" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.function.principal_id

  lifecycle {
    prevent_destroy = true
  }
}

# Current user -> Key Vault Administrator (for managing secrets)
resource "azurerm_role_assignment" "current_user_keyvault" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}

# AI Hub System Identity -> Storage Blob Data Contributor
resource "azurerm_role_assignment" "hub_storage" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azapi_resource.ai_hub.identity[0].principal_id
}

# AI Hub System Identity -> Key Vault Secrets User
resource "azurerm_role_assignment" "hub_keyvault" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azapi_resource.ai_hub.identity[0].principal_id
}

# AI Services -> Cognitive Services OpenAI User for Hub
resource "azurerm_role_assignment" "hub_openai" {
  scope                = azurerm_cognitive_account.ai_services.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = azapi_resource.ai_hub.identity[0].principal_id
}

# Current user -> Cognitive Services OpenAI Contributor (for model deployment)
resource "azurerm_role_assignment" "current_user_openai" {
  scope                = azurerm_cognitive_account.ai_services.id
  role_definition_name = "Cognitive Services OpenAI Contributor"
  principal_id         = data.azurerm_client_config.current.object_id
}
