import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

/**
 * Health check endpoint
 * GET /api/health
 */
export async function health(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Health check requested');

  const subscriptionId = process.env.SUBSCRIPTION_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;

  return {
    status: 200,
    jsonBody: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      config: {
        subscriptionConfigured: !!subscriptionId,
        tenantConfigured: !!tenantId,
        identityConfigured: !!clientId,
        apiVersion: process.env.COST_API_VERSION || '2023-11-01'
      },
      endpoints: [
        'GET  /api/health',
        'POST /api/cost/summary',
        'POST /api/cost/top',
        'POST /api/cost/byTag',
        'POST /api/cost/delta'
      ]
    }
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: health
});
