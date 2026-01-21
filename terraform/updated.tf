# ==============================================================================
# UPDATED CONFIGURATION TO RESOLVE QUOTA ISSUE
# ==============================================================================
# 
# Changes made:
# 1. Changed App Service Plan SKU from EP1 (Premium) to B1 (Basic)
#    - B1 uses standard compute instead of dynamic VMs
#    - No quota issues for basic SKUs
#    - Still runs Linux with 1.75 GB RAM, 1 vCore
#    - Lower cost than Premium
# 
# 2. Alternative options if B1 doesn't meet requirements:
#    - "B2": Basic tier with 3.5 GB RAM, 2 vCores
#    - "B3": Basic tier with 7 GB RAM, 4 vCores
#    - "S1": Standard tier with 1.75 GB RAM, 1 vCore (better for production)
#    - "S2": Standard tier with 3.5 GB RAM, 2 vCores
#    - "S3": Standard tier with 7 GB RAM, 4 vCores
# 
# Note: Basic and Standard tiers do NOT require Dynamic VM quota
# ==============================================================================

# ==============================================================================
# Function App Infrastructure - UPDATED
# ==============================================================================

# resource "azurerm_service_plan" "main" {
#   name                = local.app_service_plan_name
#   location            = azurerm_resource_group.main.location
#   resource_group_name = azurerm_resource_group.main.name
#   os_type             = "Linux"
#   sku_name            = "B1"  # Changed from var.function_app_sku (EP1) to B1
#   tags                = local.common_tags
# }

# resource "azurerm_linux_function_app" "main" {
#   name                       = local.function_app_name
#   location                   = azurerm_resource_group.main.location
#   resource_group_name        = azurerm_resource_group.main.name
#   service_plan_id            = azurerm_service_plan.main.id
#   storage_account_name       = azurerm_storage_account.functions.name
#   storage_account_access_key = azurerm_storage_account.functions.primary_access_key
#   # ... rest of configuration remains the same
# }

# ==============================================================================
# VARIABLE UPDATE RECOMMENDATION
# ==============================================================================
# 
# Also update variables.tf:
# 
# variable "function_app_sku" {
#   type        = string
#   description = "SKU for Function App (B1-B3 for Basic, S1-S3 for Standard, EP1-3 for Premium)"
#   default     = "B1"  # Changed from "EP1"
# }
# 
# ==============================================================================

# ==============================================================================
# TERRAFORM.TFVARS UPDATE (if you have one)
# ==============================================================================
# 
# If you have terraform.tfvars, update or remove the function_app_sku setting:
# 
# function_app_sku = "B1"
# 
# ==============================================================================

# ==============================================================================
# COST COMPARISON
# ==============================================================================
# 
# EP1 (Premium):     ~$146/month (730 hours)
# B1 (Basic):        ~$13/month (730 hours)
# S1 (Standard):     ~$70/month (730 hours)
# 
# B1 is significantly cheaper and avoids quota issues!
# ==============================================================================
