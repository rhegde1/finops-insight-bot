# Azure AI Agent Deployment Guide

This directory contains scripts to programmatically deploy your FinOps Cost Agent to Azure AI Agent Service using the Azure AI Projects SDK.

## Prerequisites

1. **Python 3.8+** installed
2. **Azure CLI** logged in (`az login`)
3. **Terraform applied** (infrastructure deployed)
4. **Model deployed** (run `./deploy-model.sh`)
5. **Function App deployed** (run `./deploy-function.sh`)

## Installation

Install Python dependencies:

```bash
pip install -r scripts/requirements-agent.txt
```

Or install directly:

```bash
pip install azure-ai-projects azure-identity
```

## Usage

### Deploy Agent

Run the Python deployment script:

```bash
cd scripts
python deploy-agent.py
```

The script will:
1. Load configuration from Terraform outputs
2. Read agent definition from `agent-config.json`
3. Create the agent in Azure AI Agent Service
4. Save agent details to `agent-deployment.json`
5. Provide a test URL to verify deployment

### Configuration

The agent configuration is defined in `agent-config.json` with:
- **Name & Description**: Agent identity
- **Instructions**: System prompt defining behavior
- **Tools**: Function definitions for cost queries
- **Model**: Deployment name to use

### Verify Deployment

After deployment, you can:

1. **Test in Azure Portal**:
   - Visit the URL provided by the script
   - Try queries like "What did we spend last month?"

2. **Use the Agent ID**:
   - Agent ID is saved in `agent-deployment.json`
   - Use it to integrate the agent into your applications

## Integration Example

```python
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

# Load agent ID from deployment
import json
with open("../agent-deployment.json") as f:
    agent_info = json.load(f)

agent_id = agent_info["agent_id"]

# Connect to project
credential = DefaultAzureCredential()
client = AIProjectClient.from_connection_string(
    credential=credential,
    conn_str="<your-project-connection-string>"
)

# Create a conversation thread
thread = client.agents.create_thread()

# Send a message
client.agents.create_message(
    thread_id=thread.id,
    role="user",
    content="Show me costs for last 7 days"
)

# Run the agent
run = client.agents.create_run(
    thread_id=thread.id,
    assistant_id=agent_id
)

# Poll for completion and get response
while run.status in ["queued", "in_progress"]:
    run = client.agents.get_run(thread_id=thread.id, run_id=run.id)
    time.sleep(1)

# Get messages
messages = client.agents.list_messages(thread_id=thread.id)
for msg in messages.data:
    if msg.role == "assistant":
        print(msg.content[0].text.value)
```

## Troubleshooting

### Authentication Issues
```bash
# Ensure you're logged in
az login

# Verify subscription
az account show
```

### SDK Not Found
```bash
# Install/upgrade SDK
pip install --upgrade azure-ai-projects azure-identity
```

### Permission Errors
- Ensure you have **Cognitive Services OpenAI Contributor** role
- Check RBAC assignments in Terraform outputs

### Agent Not Responding
- Verify model deployment: `az cognitiveservices account deployment list`
- Check Function App endpoints are accessible
- Review agent instructions in `agent-config.json`

## Updating the Agent

To update an existing agent, modify `agent-config.json` and re-run:

```bash
python deploy-agent.py
```

The script will create a new version. To update an existing agent:

```python
# Use the update method instead of create
client.agents.update_agent(
    assistant_id=agent_id,
    instructions=new_instructions,
    tools=new_tools
)
```

## Files

- `deploy-agent.py` - Main deployment script
- `requirements-agent.txt` - Python dependencies
- `../agent-config.json` - Agent configuration
- `../agent-deployment.json` - Deployment output (created by script)

## Resources

- [Azure AI Agent Service Docs](https://learn.microsoft.com/azure/ai-services/agents/)
- [Azure AI Projects SDK](https://learn.microsoft.com/python/api/overview/azure/ai-projects-readme)
- [Function Tools Guide](https://learn.microsoft.com/azure/ai-services/agents/how-to/tools-functions)
