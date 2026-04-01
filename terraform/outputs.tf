# ==============================================================================
# Terraform Outputs - Azure AI Foundry FinOps Demo
# ==============================================================================

# ==============================================================================
# Core Resource Identifiers
# ==============================================================================

output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "resource_group_id" {
  description = "Resource ID of the resource group"
  value       = azurerm_resource_group.main.id
}

# ==============================================================================
# Monitoring
# ==============================================================================

output "log_analytics_workspace_id" {
  description = "Resource ID of the Log Analytics Workspace"
  value       = azurerm_log_analytics_workspace.main.id
}

output "log_analytics_workspace_name" {
  description = "Name of the Log Analytics Workspace"
  value       = azurerm_log_analytics_workspace.main.name
}

output "application_insights_id" {
  description = "Resource ID of Application Insights"
  value       = azurerm_application_insights.main.id
}

output "application_insights_instrumentation_key" {
  description = "Instrumentation key for Application Insights"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "application_insights_connection_string" {
  description = "Connection string for Application Insights"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

# ==============================================================================
# Storage
# ==============================================================================

output "storage_account_name" {
  description = "Name of the main storage account"
  value       = azurerm_storage_account.main.name
}

output "storage_account_id" {
  description = "Resource ID of the main storage account"
  value       = azurerm_storage_account.main.id
}

output "function_storage_account_name" {
  description = "Name of the Function App storage account"
  value       = azurerm_storage_account.functions.name
}

# ==============================================================================
# Key Vault
# ==============================================================================

output "key_vault_name" {
  description = "Name of the Key Vault"
  value       = azurerm_key_vault.main.name
}

output "key_vault_id" {
  description = "Resource ID of the Key Vault"
  value       = azurerm_key_vault.main.id
}

output "key_vault_uri" {
  description = "URI of the Key Vault"
  value       = azurerm_key_vault.main.vault_uri
}

# ==============================================================================
# Managed Identity
# ==============================================================================

output "function_identity_id" {
  description = "Resource ID of the Function App managed identity"
  value       = azurerm_user_assigned_identity.function.id
}

output "function_identity_client_id" {
  description = "Client ID of the Function App managed identity"
  value       = azurerm_user_assigned_identity.function.client_id
}

output "function_identity_principal_id" {
  description = "Principal ID of the Function App managed identity"
  value       = azurerm_user_assigned_identity.function.principal_id
}

# ==============================================================================
# Azure AI Services
# ==============================================================================

output "ai_services_id" {
  description = "Resource ID of Azure AI Services"
  value       = azurerm_cognitive_account.ai_services.id
}

output "ai_services_endpoint" {
  description = "Endpoint of Azure AI Services"
  value       = azurerm_cognitive_account.ai_services.endpoint
}

output "ai_services_name" {
  description = "Name of Azure AI Services"
  value       = azurerm_cognitive_account.ai_services.name
}

# ==============================================================================
# Azure AI Foundry
# ==============================================================================

output "ai_hub_id" {
  description = "Resource ID of the AI Foundry Hub"
  value       = azapi_resource.ai_hub.id
}

output "ai_hub_name" {
  description = "Name of the AI Foundry Hub"
  value       = azapi_resource.ai_hub.name
}

output "ai_project_id" {
  description = "Resource ID of the AI Foundry Project"
  value       = azapi_resource.ai_project.id
}

output "ai_project_name" {
  description = "Name of the AI Foundry Project"
  value       = azapi_resource.ai_project.name
}

output "ai_foundry_portal_url" {
  description = "URL to access AI Foundry in Azure Portal"
  value       = "https://ai.azure.com/build/overview?wsid=${azapi_resource.ai_project.id}"
}

# ==============================================================================
# Function App
# ==============================================================================

output "function_app_id" {
  description = "Resource ID of the Function App"
  value       = azurerm_linux_function_app.main.id
}

output "function_app_name" {
  description = "Name of the Function App"
  value       = azurerm_linux_function_app.main.name
}

output "function_app_default_hostname" {
  description = "Default hostname of the Function App"
  value       = azurerm_linux_function_app.main.default_hostname
}

output "function_app_url" {
  description = "Base URL of the Function App"
  value       = "https://${azurerm_linux_function_app.main.default_hostname}"
}

# ==============================================================================
# Endpoints for Testing
# ==============================================================================

output "cost_api_endpoints" {
  description = "Available Cost API endpoints"
  value = {
    health  = "https://${azurerm_linux_function_app.main.default_hostname}/api/health"
    chat    = "https://${azurerm_linux_function_app.main.default_hostname}/api/chat"
    summary = "https://${azurerm_linux_function_app.main.default_hostname}/api/cost/summary"
    top     = "https://${azurerm_linux_function_app.main.default_hostname}/api/cost/top"
    by_tag  = "https://${azurerm_linux_function_app.main.default_hostname}/api/cost/byTag"
    delta   = "https://${azurerm_linux_function_app.main.default_hostname}/api/cost/delta"
  }
}

# ==============================================================================
# Script Variables (for use in shell scripts)
# ==============================================================================

output "script_variables" {
  description = "Variables for use in deployment scripts"
  value = {
    subscription_id   = var.subscription_id
    resource_group    = azurerm_resource_group.main.name
    location          = var.location
    ai_services_name  = azurerm_cognitive_account.ai_services.name
    hub_name          = azapi_resource.ai_hub.name
    project_name      = azapi_resource.ai_project.name
    function_app_name = azurerm_linux_function_app.main.name
    function_app_url  = "https://${azurerm_linux_function_app.main.default_hostname}"
    model_name        = var.foundry_model_name
    deployment_name   = var.foundry_deployment_name
    model_version     = var.foundry_model_version
  }
}

# ==============================================================================
# Hardening Notes
# ==============================================================================

output "hardening_notes" {
  description = "Notes for production hardening"
  value       = <<-EOT
    
    ================================================================================
    PRODUCTION HARDENING RECOMMENDATIONS
    ================================================================================
    
    This demo uses PUBLIC ENDPOINTS for simplicity. For production, consider:
    
    1. NETWORK SECURITY:
       - Enable private endpoints for: Storage, Key Vault, AI Services, Function App
       - Use VNet integration for Function App
       - Set up Azure Firewall or NSG rules
       - Configure Key Vault network ACLs
    
    2. AUTHENTICATION:
       - Enable Azure AD authentication on Function App
       - Use API Management for additional security layer
       - Implement rate limiting
    
    3. MONITORING:
       - Set up Azure Monitor alerts
       - Enable diagnostic settings for all resources
       - Configure Azure Sentinel for security monitoring
    
    4. SECRETS:
       - Enable Key Vault purge protection
       - Use Key Vault references in Function App settings
       - Rotate secrets regularly
    
    5. COMPLIANCE:
       - Enable Azure Policy for governance
       - Configure resource locks
       - Set up Azure Backup for critical data
    
    To enable private endpoints, set:
       enable_private_endpoints = true
    
    And ensure you have:
       - A VNet with appropriate subnets
       - Private DNS zones configured
       - Network connectivity from your client
    
    ================================================================================
  EOT
}
