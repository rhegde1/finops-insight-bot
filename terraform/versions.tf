terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100.0"
    }
    azapi = {
      source  = "Azure/azapi"
      version = ">= 1.14.0, < 2.0.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6.0"
    }
  }

  # Remote state stored in Azure Storage (configure via terraform init -backend-config)
  backend "azurerm" {
    resource_group_name  = "tf-aks-demo-rg"
    storage_account_name = "tfstatetfaksdemo"
    container_name       = "tfstatecontainer"
    key                  = "terraform.finops.tfstate"
  }
}
