import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getCostClient } from '../lib/costClient.js';

/**
 * Cost Health Endpoint
 * GET /api/health/cost
 * 
 * Returns the health status of the cost query system,
 * including last successful query time and any errors.
 */

interface HealthState {
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  successCount: number;
  errorCount: number;
}

// In-memory health state (resets on cold start)
const healthState: HealthState = {
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
  successCount: 0,
  errorCount: 0,
};

export function updateHealthState(success: boolean, error?: string) {
  if (success) {
    healthState.lastSuccessAt = new Date().toISOString();
    healthState.successCount++;
    healthState.lastError = null;
    healthState.lastErrorAt = null;
  } else {
    healthState.lastError = error || 'Unknown error';
    healthState.lastErrorAt = new Date().toISOString();
    healthState.errorCount++;
  }
}

export async function healthCost(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Cost health check received');
  
  const startTime = Date.now();
  let latencyMs = 0;
  let isOk = false;
  let testError: string | null = null;
  let subscriptionId = process.env.SUBSCRIPTION_ID || 'unknown';

  try {
    // Perform a lightweight test query
    const client = getCostClient();
    await client.queryCosts(
      'Last7Days',
      undefined,
      undefined,
      undefined,
      undefined,
      context
    );
    
    latencyMs = Date.now() - startTime;
    isOk = true;
    updateHealthState(true);
    
    context.log(`Cost health check passed in ${latencyMs}ms`);
  } catch (error) {
    latencyMs = Date.now() - startTime;
    testError = error instanceof Error ? error.message : 'Unknown error';
    updateHealthState(false, testError);
    
    context.error(`Cost health check failed: ${testError}`);
  }

  return {
    status: isOk ? 200 : 503,
    jsonBody: {
      ok: isOk,
      lastSuccessAt: healthState.lastSuccessAt,
      lastError: healthState.lastError,
      lastErrorAt: healthState.lastErrorAt,
      dataSource: 'Azure Cost Management API',
      latencyMs,
      subscriptionId,
      stats: {
        successCount: healthState.successCount,
        errorCount: healthState.errorCount,
        uptime: process.uptime(),
      },
      timestamp: new Date().toISOString(),
    },
  };
}

app.http('healthCost', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health/cost',
  handler: healthCost,
});
