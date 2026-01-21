#!/usr/bin/env python3
"""
Deploy Azure AI Agent using Azure AI Agent Service SDK
Requires: azure-ai-projects SDK
"""

import os
import json
import sys
from typing import Dict, Any

try:
    from azure.ai.projects import AIProjectClient
    from azure.ai.projects.models import (
        FunctionTool,
        ToolSet
    )
    from azure.identity import DefaultAzureCredential
except ImportError:
    print("ERROR: Required packages not installed.")
    print("Install with: pip install azure-ai-projects azure-identity")
    sys.exit(1)


def load_terraform_outputs() -> Dict[str, Any]:
    """Load configuration from Terraform outputs."""
    import subprocess
    
    print("📋 Loading Terraform outputs...")
    try:
        result = subprocess.run(
            ["terraform", "output", "-json", "script_variables"],
            cwd="../terraform",
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to get Terraform outputs: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("ERROR: terraform command not found. Install Terraform.")
        sys.exit(1)


def load_agent_config() -> Dict[str, Any]:
    """Load agent configuration from agent-config.json."""
    print("📄 Loading agent configuration...")
    config_path = "../agent-config.json"
    
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: {config_path} not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in {config_path}: {e}")
        sys.exit(1)


def create_function_tools(agent_config: Dict[str, Any]) -> list:
    """Create function tool definitions from agent config."""
    tools = []
    
    for tool_def in agent_config.get("tools", []):
        if tool_def["type"] == "function":
            func = tool_def["function"]
            # Create tool definition as dict matching OpenAI function format
            tools.append({
                "type": "function",
                "function": {
                    "name": func["name"],
                    "description": func["description"],
                    "parameters": func["parameters"]
                }
            })
    
    return tools


def deploy_agent(
    project_endpoint: str,
    subscription_id: str,
    resource_group: str,
    project_name: str,
    agent_config: Dict[str, Any],
    model_deployment: str,
    connection_id: str
) -> str:
    """Deploy the agent to Azure AI Agent Service."""
    
    print(f"\n🚀 Deploying agent to Azure AI Project...")
    print(f"   Project: {project_name}")
    print(f"   Model: {model_deployment}")
    print(f"   Endpoint: {project_endpoint}")
    
    # Initialize credential
    credential = DefaultAzureCredential()
    
    # Create AI Project client using endpoint
    try:
        client = AIProjectClient(
            endpoint=project_endpoint,
            credential=credential,
            subscription_id=subscription_id,
            resource_group_name=resource_group,
            project_name=project_name
        )
        
        # Create function tools
        tools = create_function_tools(agent_config)
        
        print(f"   Tools: {len(tools)} function(s)")
        
        # Create the agent
        agent = client.agents.create_agent(
            model=model_deployment,
            name=agent_config["name"],
            description=agent_config["description"],
            instructions=agent_config["instructions"],
            tools=tools,
            # Metadata
            metadata=agent_config.get("metadata", {})
        )
        
        print(f"\n✅ Agent created successfully!")
        print(f"   Agent ID: {agent.id}")
        print(f"   Name: {agent.name}")
        
        # Save agent ID for later use
        agent_info = {
            "agent_id": agent.id,
            "agent_name": agent.name,
            "model": agent.model,
            "created_at": str(agent.created_at) if hasattr(agent, 'created_at') else None
        }
        
        with open("../agent-deployment.json", "w") as f:
            json.dump(agent_info, f, indent=2)
        
        print(f"\n💾 Agent details saved to: agent-deployment.json")
        
        return agent.id
        
    except Exception as e:
        print(f"\n❌ Error deploying agent: {e}")
        sys.exit(1)


def test_agent(client: AIProjectClient, agent_id: str):
    """Test the deployed agent with a simple query."""
    
    print(f"\n🧪 Testing agent...")
    
    try:
        # Create a thread
        thread = client.agents.create_thread()
        print(f"   Created thread: {thread.id}")
        
        # Send a test message
        message = client.agents.create_message(
            thread_id=thread.id,
            role="user",
            content="What's your purpose? Please describe what you can help me with."
        )
        
        # Run the agent
        run = client.agents.create_run(
            thread_id=thread.id,
            assistant_id=agent_id
        )
        
        # Wait for completion
        import time
        max_wait = 30
        elapsed = 0
        
        while run.status in ["queued", "in_progress"] and elapsed < max_wait:
            time.sleep(2)
            elapsed += 2
            run = client.agents.get_run(
                thread_id=thread.id,
                run_id=run.id
            )
            print(f"   Status: {run.status}...")
        
        if run.status == "completed":
            # Get messages
            messages = client.agents.list_messages(thread_id=thread.id)
            
            # Find assistant's response
            for msg in messages.data:
                if msg.role == "assistant":
                    print(f"\n💬 Agent response:")
                    for content in msg.content:
                        if hasattr(content, 'text'):
                            print(f"   {content.text.value}")
                    break
            
            print(f"\n✅ Agent test successful!")
        else:
            print(f"\n⚠️  Agent run ended with status: {run.status}")
            
    except Exception as e:
        print(f"\n⚠️  Test failed (agent is deployed but test couldn't complete): {e}")


def main():
    """Main deployment flow."""
    
    print("=" * 80)
    print("Azure AI Agent Deployment")
    print("=" * 80)
    
    # Load configuration
    tf_outputs = load_terraform_outputs()
    agent_config = load_agent_config()

    # Extract required values
    subscription_id = tf_outputs["subscription_id"]
    resource_group = tf_outputs["resource_group"]
    project_name = tf_outputs["project_name"]
    model_deployment = tf_outputs["deployment_name"]
    location = tf_outputs["location"]

    # Build connection ID for the OpenAI connection
    # Format: <project_resource_id>/connections/<connection_name>
    # Project resource id from Terraform output ai_project_id
    project_resource_id = None
    try:
        # Use terraform output directly
        import subprocess, json
        res = subprocess.run(["terraform", "output", "-raw", "ai_project_id"], cwd="../terraform", capture_output=True, text=True)
        if res.returncode == 0:
            project_resource_id = res.stdout.strip()
    except Exception:
        project_resource_id = None

    if not project_resource_id:
        # Fallback: construct using subscription/rg/project
        project_resource_id = f"/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.MachineLearningServices/workspaces/{project_name}"

    connection_id = f"{project_resource_id}/connections/ai-services-connection"
    
    # Construct project endpoint - Azure ML workspace discovery endpoint
    # Format: https://<region>.api.azureml.ms/discovery/workspace/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.MachineLearningServices/workspaces/<workspace>
    project_endpoint = f"https://{location}.api.azureml.ms"
    
    print(f"\n📊 Configuration:")
    print(f"   Subscription: {subscription_id}")
    print(f"   Resource Group: {resource_group}")
    print(f"   Project: {project_name}")
    print(f"   Location: {location}")
    print(f"   Model Deployment: {model_deployment}")
    print(f"   Connection ID: {connection_id}")
    
    # Deploy agent
    agent_id = deploy_agent(
        project_endpoint=project_endpoint,
        subscription_id=subscription_id,
        resource_group=resource_group,
        project_name=project_name,
        agent_config=agent_config,
        model_deployment=model_deployment,
        connection_id=connection_id
    )
    
    print(f"\n" + "=" * 80)
    print("Next Steps:")
    print("=" * 80)
    print(f"1. Test agent in Azure AI Foundry Portal:")
    print(f"   https://ai.azure.com/build/agent/{agent_id}")
    print(f"\n2. Integrate agent into your application using the Agent ID:")
    print(f"   {agent_id}")
    print(f"\n3. Use the Python SDK to interact with the agent:")
    print(f"   See: https://learn.microsoft.com/azure/ai-services/agents/")
    print("=" * 80)


if __name__ == "__main__":
    main()
