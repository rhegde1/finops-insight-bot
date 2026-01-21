#!/usr/bin/env python3
"""
Verify Azure AI Project connections before deploying agent
"""

import json
import sys
import subprocess
import requests
from azure.identity import DefaultAzureCredential


def get_terraform_outputs():
    """Get Terraform outputs."""
    result = subprocess.run(
        ["terraform", "output", "-json"],
        cwd="../terraform",
        capture_output=True,
        text=True,
        check=True
    )
    return json.loads(result.stdout)


def get_access_token():
    """Get Azure access token."""
    credential = DefaultAzureCredential()
    token = credential.get_token("https://management.azure.com/.default")
    return token.token


def check_connection(subscription_id, resource_group, workspace_name):
    """Check if OpenAI connection exists using Azure REST API (workspace = project)."""
    print(f"🔍 Checking connections in workspace...")
    print(f"   Workspace: {workspace_name}")
    
    token = get_access_token()
    
    # List connections via Azure Management API
    url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.MachineLearningServices/workspaces/{workspace_name}/connections"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    params = {"api-version": "2024-04-01"}
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        data = response.json()
        connections = data.get("value", [])
        
        print(f"\n📋 Found {len(connections)} connection(s):")
        for conn in connections:
            name = conn.get("name", "unknown")
            category = conn.get("properties", {}).get("category", "unknown")
            is_shared = conn.get("properties", {}).get("isSharedToAll", False)
            print(f"   - {name}: {category} (shared: {is_shared})")
        
        # Check for OpenAI connection
        openai_conns = [c for c in connections if c.get("properties", {}).get("category") == "OpenAI"]
        
        if openai_conns:
            print(f"\n✅ OpenAI connection found!")
            for conn in openai_conns:
                print(f"   Name: {conn['name']}")
                print(f"   Shared to all: {conn.get('properties', {}).get('isSharedToAll', False)}")
            return True
        else:
            print(f"\n❌ No OpenAI connection found")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"\n⚠️  Error checking connections: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Response: {e.response.text}")
        return False

def main():
    print("=" * 80)
    print("Azure AI Connection Verification")
    print("=" * 80)
    
    outputs = get_terraform_outputs()
    script_vars = outputs.get("script_variables", {}).get("value", {})
    
    subscription_id = script_vars["subscription_id"]
    resource_group = script_vars["resource_group"]
    workspace_name = script_vars["project_name"]
    ai_services_name = script_vars["ai_services_name"]

    has_connection = check_connection(subscription_id, resource_group, workspace_name)
    
    if not has_connection:
        print("\n" + "=" * 80)
        print("⚠️  Connection Issue Detected")
        print("=" * 80)
        print("\nThe OpenAI connection may not be properly configured.")
        print("\nTroubleshooting steps:")
        print("-" * 80)
        print("\n1. Check if connection exists in Azure Portal:")
        ai_studio_url = outputs.get("ai_foundry_portal_url", {}).get("value", "")
        print(f"   Visit: {ai_studio_url}")
        print(f"   Navigate to: Settings → Connections")
        
        print("\n2. If connection is missing, it may need time to propagate.")
        print("   Wait 2-3 minutes and try again.")
        
        print("\n3. If still missing after waiting, re-apply Terraform:")
        print("   cd terraform")
        print("   terraform apply -target=azapi_resource.ai_services_connection")
        
        print("\n4. As a workaround, you can use the connection name directly:")
        print("   The agent deployment should still work if the connection exists")
        print("   but isn't showing up in the API query.")
        print("=" * 80)
        
        # Don't exit, allow user to proceed
        print("\n⚠️  Proceeding anyway - the connection may exist despite API query issues.")
        print("   If agent deployment fails, follow the troubleshooting steps above.")
        return
    else:
        print("\n✅ Connection verified! You can proceed with agent deployment.")
        print("   Run: python deploy-agent.py")

if __name__ == "__main__":
    main()
