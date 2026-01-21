#!/usr/bin/env python3
"""
Deploy FinOps Agent with Python-based function tools.

Creates an agent with callable Python wrappers that invoke the Azure Functions
backend. Use the SDK (e.g., test-agent.py) to execute tools reliably.
"""

import os
import json
import sys
from typing import Dict, Any
import requests

try:
    from azure.ai.projects import AIProjectClient
    from azure.ai.projects.models import FunctionTool, ToolSet
    from azure.identity import DefaultAzureCredential
except ImportError:
    print("ERROR: Required packages not installed.")
    print("Install with: pip install azure-ai-projects azure-identity requests")
    sys.exit(1)


def load_terraform_outputs() -> Dict[str, Any]:
    """Load configuration from Terraform outputs."""
    import subprocess

    print("Loading Terraform outputs...")
    try:
        result = subprocess.run(
            ["terraform", "output", "-json", "script_variables"],
            cwd="../terraform",
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to get Terraform outputs: {e}")
        sys.exit(1)


def load_agent_config() -> Dict[str, Any]:
    """Load agent configuration from agent-config.json."""
    print("Loading agent configuration...")
    config_path = "../agent-config.json"

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: {config_path} not found")
        sys.exit(1)


def get_cost_summary(timeframe: str, groupBy: str = None, from_date: str = None, to_date: str = None) -> Dict:
    """Get a summary of Azure costs."""
    function_url = os.environ.get("FUNCTION_APP_URL")
    payload = {"timeframe": timeframe}
    if groupBy:
        payload["groupBy"] = groupBy
    if from_date:
        payload["from"] = from_date
    if to_date:
        payload["to"] = to_date

    response = requests.post(f"{function_url}/api/cost/summary", json=payload, timeout=30)
    return response.json() if response.ok else {"error": response.text}


def get_top_costs(timeframe: str, groupBy: str = "Resource", top: int = 10, from_date: str = None, to_date: str = None) -> Dict:
    """Get top N most expensive resources."""
    function_url = os.environ.get("FUNCTION_APP_URL")
    payload = {
        "timeframe": timeframe,
        "groupBy": groupBy,
        "top": top,
    }
    if from_date:
        payload["from"] = from_date
    if to_date:
        payload["to"] = to_date

    response = requests.post(f"{function_url}/api/cost/top", json=payload, timeout=30)
    return response.json() if response.ok else {"error": response.text}


def get_costs_by_tag(timeframe: str, tagKey: str, from_date: str = None, to_date: str = None) -> Dict:
    """Get costs grouped by a specific tag."""
    function_url = os.environ.get("FUNCTION_APP_URL")
    payload = {
        "timeframe": timeframe,
        "tagKey": tagKey,
    }
    if from_date:
        payload["from"] = from_date
    if to_date:
        payload["to"] = to_date

    response = requests.post(f"{function_url}/api/cost/byTag", json=payload, timeout=30)
    return response.json() if response.ok else {"error": response.text}


def get_cost_delta(currentPeriod: str, comparisonPeriod: str, groupBy: str = None) -> Dict:
    """Compare costs between two periods."""
    function_url = os.environ.get("FUNCTION_APP_URL")
    payload = {
        "currentPeriod": currentPeriod,
        "comparisonPeriod": comparisonPeriod,
    }
    if groupBy:
        payload["groupBy"] = groupBy

    response = requests.post(f"{function_url}/api/cost/delta", json=payload, timeout=30)
    return response.json() if response.ok else {"error": response.text}


def main():
    """Main deployment flow."""

    print("=" * 80)
    print("Azure AI Agent Deployment (server-side HTTP tools)")
    print("=" * 80)

    tf_outputs = load_terraform_outputs()
    agent_config = load_agent_config()

    subscription_id = tf_outputs["subscription_id"]
    resource_group = tf_outputs["resource_group"]
    project_name = tf_outputs["project_name"]
    model_deployment = tf_outputs["deployment_name"]
    location = tf_outputs["location"]
    function_app_url = tf_outputs.get("function_app_url")

    project_endpoint = f"https://{location}.api.azureml.ms"

    print("\nConfiguration:")
    print(f"  Subscription: {subscription_id}")
    print(f"  Resource Group: {resource_group}")
    print(f"  Project: {project_name}")
    print(f"  Location: {location}")
    print(f"  Model Deployment: {model_deployment}")
    if function_app_url:
        print(f"  Function App URL: {function_app_url}")

    credential = DefaultAzureCredential()

    try:
        client = AIProjectClient(
            endpoint=project_endpoint,
            credential=credential,
            subscription_id=subscription_id,
            resource_group_name=resource_group,
            project_name=project_name,
        )

        print("\nConnected to Azure AI Project")

        # Create function tools using ToolSet
        print("\nDeploying agent with Python function tools...")
        functions_tool = FunctionTool([
            get_cost_summary,
            get_top_costs,
            get_costs_by_tag,
            get_cost_delta,
        ])

        toolset = ToolSet()
        toolset.add(functions_tool)

        agent = client.agents.create_agent(
            model=model_deployment,
            name=agent_config["name"],
            description=agent_config["description"],
            instructions=agent_config["instructions"],
            toolset=toolset,
        )

        print("\nAgent created successfully!")
        print(f"  Agent ID: {agent.id}")
        print(f"  Name: {agent.name}")

        agent_info = {
            "agent_id": agent.id,
            "agent_name": agent.name,
            "model": agent.model,
            "created_at": str(agent.created_at) if hasattr(agent, "created_at") else None,
            "tools": "Server-side HTTP function tools",
        }

        with open("../agent-deployment.json", "w", encoding="utf-8") as f:
            json.dump(agent_info, f, indent=2)

        print("\nAgent details saved to: agent-deployment.json")
        print("\n" + "=" * 80)
        print("Next Steps:")
        print("=" * 80)
        print("1) Test in Azure AI Foundry portal (Agent management).")
        print("2) Test programmatically: python test-agent.py")
        print("3) Verify costs match Azure Cost Management (no hallucinations).")
        print("=" * 80)

    except Exception as e:
        print(f"\nError deploying agent: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
