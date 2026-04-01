import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { DefaultAzureCredential, ManagedIdentityCredential, getBearerTokenProvider } from '@azure/identity';
import { getCostClient } from '../lib/costClient.js';

const SYSTEM_PROMPT = `You are a FinOps Cost Analyst assistant. You answer questions about Azure cloud spending using ONLY data from your available tools.

CRITICAL RULES:
1. NEVER fabricate, estimate, or guess cost numbers. Every dollar amount you state MUST come from a tool call result in this conversation.
2. ALWAYS call a tool before answering any cost-related question. Do not rely on memory or prior knowledge.
3. If a tool call fails or returns an error, tell the user honestly. Do not make up alternative numbers.
4. Present the exact numbers returned by tools. Do not round unless the user specifically asks you to.
5. If the user asks something unrelated to Azure costs, politely redirect to cost topics.
6. You may call multiple tools in a single turn to provide comprehensive answers.

AVAILABLE TIME RANGES:
- Last7Days, Last30Days, MonthToDate, PreviousMonth
- Custom (requires from/to dates in YYYY-MM-DD format)

GROUPING OPTIONS:
- ResourceGroup, ServiceName, Resource

RESPONSE FORMAT:
- State the time period clearly
- Show total cost prominently
- Use markdown tables for breakdowns
- Highlight changes >10%
- Offer one follow-up suggestion`;

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_cost_summary',
      description: 'Get total Azure costs for a time period, optionally grouped by dimension. Use this for general cost questions.',
      parameters: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['Last7Days', 'Last30Days', 'MonthToDate', 'PreviousMonth', 'Custom'],
            description: 'Time range for the query',
          },
          from: { type: 'string', description: 'Start date (YYYY-MM-DD) — required when timeframe is Custom' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD) — required when timeframe is Custom' },
          groupBy: {
            type: 'string',
            enum: ['ResourceGroup', 'ServiceName', 'Resource'],
            description: 'Dimension to group costs by',
          },
        },
        required: ['timeframe'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_top_costs',
      description: 'Get the top N most expensive resources or services. Use when the user asks about biggest spenders or most expensive items.',
      parameters: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['Last7Days', 'Last30Days', 'MonthToDate', 'PreviousMonth', 'Custom'],
            description: 'Time range for the query',
          },
          from: { type: 'string', description: 'Start date (YYYY-MM-DD) — required when timeframe is Custom' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD) — required when timeframe is Custom' },
          groupBy: {
            type: 'string',
            enum: ['ResourceGroup', 'ServiceName', 'Resource'],
            description: 'What to rank by (default: Resource)',
          },
          top: { type: 'number', description: 'Number of results (default: 10, max: 100)' },
        },
        required: ['timeframe'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_costs_by_tag',
      description: 'Get costs grouped by a specific Azure resource tag. Use when users ask about costs by environment, team, project, etc.',
      parameters: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['Last7Days', 'Last30Days', 'MonthToDate', 'PreviousMonth', 'Custom'],
            description: 'Time range for the query',
          },
          from: { type: 'string', description: 'Start date (YYYY-MM-DD) — required when timeframe is Custom' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD) — required when timeframe is Custom' },
          tagKey: { type: 'string', description: 'Tag key to group by (e.g. environment, costcenter, owner)' },
        },
        required: ['timeframe', 'tagKey'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_cost_delta',
      description: 'Compare costs between two time periods. Use when users ask about cost trends, changes, or week-over-week / month-over-month comparisons.',
      parameters: {
        type: 'object',
        properties: {
          currentPeriod: {
            type: 'string',
            enum: ['Last7Days', 'Last30Days', 'MonthToDate'],
            description: 'The recent period to analyze',
          },
          comparisonPeriod: {
            type: 'string',
            enum: ['Previous7Days', 'Previous30Days', 'PreviousMonth'],
            description: 'The historical period to compare against',
          },
          groupBy: {
            type: 'string',
            enum: ['ResourceGroup', 'ServiceName', 'Resource'],
            description: 'Dimension to compare',
          },
        },
        required: ['currentPeriod', 'comparisonPeriod'],
      },
    },
  },
];

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

interface ChatRequest {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

/**
 * Execute a tool call by invoking the CostClient directly (in-process).
 */
async function executeTool(
  name: string,
  args: Record<string, any>,
  context: InvocationContext
): Promise<any> {
  const client = getCostClient();
  context.log(`Executing tool: ${name} with args: ${JSON.stringify(args)}`);

  switch (name) {
    case 'get_cost_summary':
      return await client.queryCosts(
        args.timeframe,
        args.from,
        args.to,
        args.groupBy,
        undefined,
        context
      );

    case 'get_top_costs':
      return await client.queryTopCosts(
        args.timeframe,
        args.from,
        args.to,
        args.groupBy || 'Resource',
        args.top || 10,
        context
      );

    case 'get_costs_by_tag':
      return await client.queryCostsByTag(
        args.timeframe,
        args.tagKey,
        args.from,
        args.to,
        context
      );

    case 'get_cost_delta':
      return await client.queryCostDelta(
        args.currentPeriod,
        args.comparisonPeriod,
        args.groupBy,
        context
      );

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Chat endpoint — handles user messages with Azure OpenAI function calling.
 * POST /api/chat
 */
export async function chat(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Chat request received');

  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.message || body.message.trim() === '') {
      return {
        status: 400,
        jsonBody: { error: 'Missing required field: message' },
      };
    }

    // Azure OpenAI configuration
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'finops-chat';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

    if (!endpoint) {
      return {
        status: 500,
        jsonBody: { error: 'AZURE_OPENAI_ENDPOINT not configured' },
      };
    }

    // Get auth token for Azure OpenAI
    const clientId = process.env.AZURE_CLIENT_ID;
    const credential = clientId
      ? new ManagedIdentityCredential(clientId)
      : new DefaultAzureCredential();
    const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');

    // Build message history
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add conversation history if provided (cap at 50 messages to stay within token limits)
    if (body.history && Array.isArray(body.history)) {
      const recentHistory = body.history.slice(-50);
      for (const msg of recentHistory) {
        if ((msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: body.message });

    const chatUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    // Tool-call loop: keep going until the model produces a final text response
    const MAX_TOOL_ROUNDS = 5;
    let toolRound = 0;

    while (toolRound < MAX_TOOL_ROUNDS) {
      const chatResponse = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenResponse.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 2048,
        }),
      });

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        context.error(`Azure OpenAI error: ${chatResponse.status} - ${errorText}`);
        return {
          status: 502,
          jsonBody: {
            error: 'Failed to get response from AI model',
            details: chatResponse.status,
          },
        };
      }

      const completion = await chatResponse.json() as any;
      const choice = completion.choices?.[0];

      if (!choice || !choice.message) {
        context.error(`Invalid OpenAI response structure: ${JSON.stringify(completion)}`);
        return {
          status: 502,
          jsonBody: { error: 'Invalid response from AI model' },
        };
      }

      const assistantMessage = choice.message;

      // If the model wants to call tools
      if (choice.finish_reason === 'tool_calls' || assistantMessage.tool_calls?.length > 0) {
        toolRound++;
        context.log(`Tool call round ${toolRound}: ${assistantMessage.tool_calls.length} tool(s)`);

        // Add assistant message with tool calls to history
        messages.push({
          role: 'assistant',
          content: assistantMessage.content,
          tool_calls: assistantMessage.tool_calls,
        });

        // Execute each tool call and add results
        for (const toolCall of assistantMessage.tool_calls) {
          let args: Record<string, any>;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (parseError) {
            context.error(`Failed to parse arguments for ${toolCall.function.name}: ${toolCall.function.arguments}`);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Invalid arguments for ${toolCall.function.name}` }),
            });
            continue;
          }

          try {
            const result = await executeTool(toolCall.function.name, args, context);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (toolError) {
            context.error(`Tool execution error (${toolCall.function.name}): ${toolError}`);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: `Tool execution failed: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
              }),
            });
          }
        }

        // Continue the loop — let the model process tool results
        continue;
      }

      // Model produced a final text response
      return {
        status: 200,
        jsonBody: {
          reply: assistantMessage.content || 'No response generated.',
          usage: completion.usage,
        },
      };
    }

    // If we hit the tool-call limit
    return {
      status: 200,
      jsonBody: {
        reply: 'I called several tools but could not produce a final answer. Please try a simpler question.',
      },
    };
  } catch (error) {
    context.error('Chat endpoint error:', error);
    return {
      status: 500,
      jsonBody: {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: chat,
});
