import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getCostClient, CostDeltaRequest } from '../lib/costClient.js';

/**
 * Cost Delta Endpoint
 * POST /api/cost/delta
 * 
 * Compares costs between two periods to identify changes.
 */
export async function costDelta(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Cost delta request received');

  try {
    // Parse request body
    const body = await request.json() as CostDeltaRequest;
    
    // Validate required fields
    if (!body.currentPeriod) {
      return {
        status: 400,
        jsonBody: {
          error: 'Missing required field: currentPeriod',
          validValues: ['Last7Days', 'Last30Days', 'MonthToDate']
        }
      };
    }

    if (!body.comparisonPeriod) {
      return {
        status: 400,
        jsonBody: {
          error: 'Missing required field: comparisonPeriod',
          validValues: ['Previous7Days', 'Previous30Days', 'PreviousMonth']
        }
      };
    }

    // Validate current period
    const validCurrentPeriods = ['Last7Days', 'Last30Days', 'MonthToDate'];
    if (!validCurrentPeriods.includes(body.currentPeriod)) {
      return {
        status: 400,
        jsonBody: {
          error: `Invalid currentPeriod: ${body.currentPeriod}`,
          validValues: validCurrentPeriods
        }
      };
    }

    // Validate comparison period
    const validComparisonPeriods = ['Previous7Days', 'Previous30Days', 'PreviousMonth'];
    if (!validComparisonPeriods.includes(body.comparisonPeriod)) {
      return {
        status: 400,
        jsonBody: {
          error: `Invalid comparisonPeriod: ${body.comparisonPeriod}`,
          validValues: validComparisonPeriods
        }
      };
    }

    // Query cost delta
    const client = getCostClient();
    const result = await client.queryCostDelta(
      body.currentPeriod,
      body.comparisonPeriod,
      body.groupBy,
      context
    );

    return {
      status: 200,
      jsonBody: result
    };

  } catch (error) {
    context.error('Error querying cost delta:', error);
    
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to query cost delta',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

app.http('costDelta', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cost/delta',
  handler: costDelta
});
