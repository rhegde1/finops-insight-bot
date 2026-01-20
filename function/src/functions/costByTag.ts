import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getCostClient, CostByTagRequest } from '../lib/costClient.js';

/**
 * Costs by Tag Endpoint
 * POST /api/cost/byTag
 * 
 * Returns costs grouped by a specific tag key.
 */
export async function costByTag(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Costs by tag request received');

  try {
    // Parse request body
    const body = await request.json() as CostByTagRequest;
    
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

    if (!body.tagKey) {
      return {
        status: 400,
        jsonBody: {
          error: 'Missing required field: tagKey',
          example: 'environment, costcenter, owner, project'
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

    // Query costs by tag
    const client = getCostClient();
    const result = await client.queryCostsByTag(
      body.timeframe,
      body.tagKey,
      body.from,
      body.to,
      context
    );

    // Add tag metadata
    return {
      status: 200,
      jsonBody: {
        ...result,
        tagKey: body.tagKey
      }
    };

  } catch (error) {
    context.error('Error querying costs by tag:', error);
    
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to query costs by tag',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

app.http('costByTag', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cost/byTag',
  handler: costByTag
});
