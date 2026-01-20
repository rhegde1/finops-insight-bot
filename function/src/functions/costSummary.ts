import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getCostClient, CostSummaryRequest } from '../lib/costClient.js';

/**
 * Cost Summary Endpoint
 * POST /api/cost/summary
 * 
 * Returns a summary of Azure costs for the subscription,
 * optionally grouped by dimension.
 */
export async function costSummary(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Cost summary request received');

  try {
    // Parse request body
    const body = await request.json() as CostSummaryRequest;
    
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

    // Query costs
    const client = getCostClient();
    const result = await client.queryCosts(
      body.timeframe,
      body.from,
      body.to,
      body.groupBy,
      undefined,
      context
    );

    return {
      status: 200,
      jsonBody: result
    };

  } catch (error) {
    context.error('Error querying cost summary:', error);
    
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to query cost summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

app.http('costSummary', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cost/summary',
  handler: costSummary
});
