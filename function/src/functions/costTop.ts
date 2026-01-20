import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getCostClient, CostTopRequest } from '../lib/costClient.js';

/**
 * Top Costs Endpoint
 * POST /api/cost/top
 * 
 * Returns the top N most expensive resources or groups.
 */
export async function costTop(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Top costs request received');

  try {
    // Parse request body
    const body = await request.json() as CostTopRequest;
    
    // Validate required fields
    if (!body.timeframe) {
      return {
        status: 400,
        jsonBody: {
          error: 'Missing required field: timeframe',
          validValues: ['Last7Days', 'Last30Days', 'MonthToDate', 'PreviousMonth', 'Custom']
        }
      };
    }

    // Validate Custom timeframe has from/to
    if (body.timeframe === 'Custom' && (!body.from || !body.to)) {
      return {
        status: 400,
        jsonBody: {
          error: 'Custom timeframe requires from and to dates in YYYY-MM-DD format'
        }
      };
    }

    // Set defaults
    const groupBy = body.groupBy || 'Resource';
    const top = body.top || 10;

    // Validate top parameter
    if (top < 1 || top > 100) {
      return {
        status: 400,
        jsonBody: {
          error: 'top parameter must be between 1 and 100'
        }
      };
    }

    // Query top costs
    const client = getCostClient();
    const result = await client.queryTopCosts(
      body.timeframe,
      body.from,
      body.to,
      groupBy,
      top,
      context
    );

    // Add top metadata
    return {
      status: 200,
      jsonBody: {
        ...result,
        limit: top
      }
    };

  } catch (error) {
    context.error('Error querying top costs:', error);
    
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to query top costs',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

app.http('costTop', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cost/top',
  handler: costTop
});
