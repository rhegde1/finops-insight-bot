#!/usr/bin/env python3
"""
Quick test of the agent with function tools
"""

import os
import json
import sys
from typing import Dict, Any

from azure.ai.agents.models import AgentThreadCreationOptions, ThreadMessageOptions

try:
    from azure.ai.projects import AIProjectClient
    from azure.identity import DefaultAzureCredential
except ImportError:
    print("ERROR: Required packages not installed.")
    sys.exit(1)


def load_terraform_outputs() -> Dict[str, Any]:
    import subprocess
    try:
        result = subprocess.run(
            ["terraform", "output", "-json", "script_variables"],
            cwd="../terraform",
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)
    except:
        print("ERROR: Failed to get Terraform outputs")
        sys.exit(1)


def load_agent_deployment() -> Dict[str, Any]:
    try:
        with open("../agent-deployment.json", 'r') as f:
            return json.load(f)
    except:
        print("ERROR: agent-deployment.json not found")
        sys.exit(1)


def quick_test():
    """Quick test of the agent."""
    
    print("=" * 80)
    print("Quick Agent Test")
    print("=" * 80)
    
    tf_outputs = load_terraform_outputs()
    agent_info = load_agent_deployment()
    
    subscription_id = tf_outputs["subscription_id"]
    resource_group = tf_outputs["resource_group"]
    project_name = tf_outputs["project_name"]
    location = tf_outputs["location"]
    
    agent_id = agent_info["agent_id"]
    project_endpoint = f"https://{location}.api.azureml.ms"
    
    print(f"\nAgent ID: {agent_id}")
    print(f"Tools: {agent_info.get('tools', 'N/A')}")
    
    credential = DefaultAzureCredential()
    
    try:
        client = AIProjectClient(
            endpoint=project_endpoint,
            credential=credential,
            subscription_id=subscription_id,
            resource_group_name=resource_group,
            project_name=project_name
        )
        
        print(f"\nâœ… Connected to Azure AI Project")
        print(f"\nTesting with simple question...")
        
        # Create thread and run in one call (current SDK)
        run = client.agents.create_thread_and_run(
            agent_id=agent_id,
            thread=AgentThreadCreationOptions(
                messages=[
                    ThreadMessageOptions(
                        role="user",
                        content="What were my costs for the last 30 days? Just give me the dollar amount, nothing else.",
                    )
                ]
            ),
        )
        thread_id = run.thread_id
        
        import time
        max_attempts = 30  # 60 seconds max
        attempts = 0
        
        while run.status in ["queued", "in_progress"] and attempts < max_attempts:
            time.sleep(2)
            attempts += 1
            run = client.agents.get_run(thread_id=thread_id, run_id=run.id)
        
        if run.status == "completed":
            messages = client.agents.list_messages(thread_id=thread_id)
            for msg in messages.data:
                if msg.role == "assistant":
                    for content in msg.content:
                        response_text = content.text.value if hasattr(content, 'text') else str(content)
                        print(f"\nðŸ’¬ Agent Response:")
                        print(f"{response_text}")
                        
                        # Check if it's real or hallucinated
                        if "$" in response_text:
                            if "$2500" in response_text or "$2,500" in response_text:
                                print("\nâŒ HALLUCINATING - still returning $2500")
                            elif "$11" in response_text or "$12" in response_text:
                                print("\nâœ… SUCCESS - returning correct data (~$11)")
                            else:
                                print(f"\nâœ… Data returned - verify amount is correct for your subscription")
                    break
        else:
            print(f"Run status: {run.status}")
            if run.status == "failed":
                print(f"Error: {run.last_error}")
            elif run.status == "requires_action":
                print("Note: Agent tried to call functions (good sign!)")
        
    except Exception as e:
        print(f"\nERROR: {e}")


if __name__ == "__main__":
    quick_test()
