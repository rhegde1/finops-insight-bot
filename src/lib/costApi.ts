/**
 * Cost API Service
 * 
 * Handles all communication with the Azure Functions cost endpoints.
 * Provides typed responses, error handling, and request instrumentation.
 */

// API Configuration - set via environment or defaults for demo
const API_BASE_URL = import.meta.env.VITE_FUNCTION_APP_URL || '';
const API_KEY = import.meta.env.VITE_FUNCTION_APP_KEY || '';

// Types matching the Azure Function response schema
export type TimeframeType = 'Last7Days' | 'Last30Days' | 'MonthToDate' | 'PreviousMonth' | 'Custom';
export type GroupByType = 'ResourceGroup' | 'ServiceName' | 'Resource' | 'Tag';

export interface CostRow {
  name: string;
  cost: number;
  currency: string;
  percentage?: number;
}

export interface CostResponse {
  timeframe: {
    type: TimeframeType;
    from: string;
    to: string;
  };
  scope: string;
  total: {
    cost: number;
    currency: string;
  };
  breakdown: CostRow[];
  groupedBy?: GroupByType;
  metadata: {
    generatedAt: string;
    rowCount: number;
  };
}

export interface CostDeltaResponse {
  currentPeriod: {
    type: string;
    from: string;
    to: string;
    total: number;
    currency: string;
  };
  previousPeriod: {
    type: string;
    from: string;
    to: string;
    total: number;
    currency: string;
  };
  delta: {
    absolute: number;
    percentage: number;
    direction: 'increase' | 'decrease' | 'unchanged';
  };
  breakdown: Array<{
    name: string;
    current: number;
    previous: number;
    delta: number;
    deltaPercentage: number;
    currency: string;
  }>;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  environment: string;
  checks?: {
    costManagement: {
      status: string;
      latencyMs?: number;
      lastError?: string;
    };
  };
}

export interface CostHealthResponse {
  ok: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  dataSource: string;
  latencyMs: number;
  subscriptionId: string;
}

export interface ApiError {
  error: string;
  message?: string;
  validValues?: string[];
}

// Request tracking for instrumentation
let requestCounter = 0;

function generateRequestId(): string {
  return `req-${Date.now()}-${++requestCounter}`;
}

// Instrumented fetch wrapper
async function instrumentedFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T; latencyMs: number; requestId: string }> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  console.log(`[CostAPI] ${requestId} - Starting request to ${endpoint}`, {
    method: options.method || 'GET',
    timestamp: new Date().toISOString()
  });

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    ...(API_KEY && { 'x-functions-key': API_KEY }),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const latencyMs = Math.round(performance.now() - startTime);
    
    console.log(`[CostAPI] ${requestId} - Response received`, {
      status: response.status,
      latencyMs,
      timestamp: new Date().toISOString()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      console.error(`[CostAPI] ${requestId} - Request failed`, {
        status: response.status,
        error: errorData,
        latencyMs
      });
      throw new CostApiError(
        errorData.error || errorData.message || `HTTP ${response.status}`,
        response.status,
        requestId,
        errorData
      );
    }

    const data = await response.json() as T;
    
    console.log(`[CostAPI] ${requestId} - Data parsed successfully`, {
      latencyMs,
      dataKeys: Object.keys(data as object)
    });

    return { data, latencyMs, requestId };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    
    if (error instanceof CostApiError) {
      throw error;
    }

    console.error(`[CostAPI] ${requestId} - Network/parse error`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs
    });

    throw new CostApiError(
      error instanceof Error ? error.message : 'Network error',
      0,
      requestId
    );
  }
}

// Custom error class for API errors
export class CostApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId: string,
    public details?: ApiError
  ) {
    super(message);
    this.name = 'CostApiError';
  }
}

// API Methods

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await instrumentedFetch<HealthResponse>('/api/health');
  return data;
}

export async function getCostHealth(): Promise<CostHealthResponse> {
  const startTime = performance.now();
  
  try {
    // Test by making an actual cost query
    const { data, latencyMs } = await instrumentedFetch<CostResponse>('/api/cost/summary', {
      method: 'POST',
      body: JSON.stringify({ timeframe: 'Last7Days' })
    });

    return {
      ok: true,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      dataSource: 'Azure Cost Management API',
      latencyMs,
      subscriptionId: data.scope.split('/').pop() || 'unknown'
    };
  } catch (error) {
    return {
      ok: false,
      lastSuccessAt: null,
      lastError: error instanceof Error ? error.message : 'Unknown error',
      dataSource: 'Azure Cost Management API',
      latencyMs: Math.round(performance.now() - startTime),
      subscriptionId: 'unknown'
    };
  }
}

export interface CostSummaryParams {
  timeframe: TimeframeType;
  from?: string;
  to?: string;
  groupBy?: GroupByType;
}

export async function getCostSummary(params: CostSummaryParams): Promise<CostResponse> {
  const { data } = await instrumentedFetch<CostResponse>('/api/cost/summary', {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return data;
}

export interface CostTopParams {
  timeframe: TimeframeType;
  from?: string;
  to?: string;
  groupBy?: GroupByType;
  top?: number;
}

export async function getTopCosts(params: CostTopParams): Promise<CostResponse> {
  const { data } = await instrumentedFetch<CostResponse>('/api/cost/top', {
    method: 'POST',
    body: JSON.stringify({ top: 10, groupBy: 'Resource', ...params })
  });
  return data;
}

export interface CostByTagParams {
  timeframe: TimeframeType;
  tagKey: string;
  from?: string;
  to?: string;
}

export async function getCostsByTag(params: CostByTagParams): Promise<CostResponse> {
  const { data } = await instrumentedFetch<CostResponse>('/api/cost/byTag', {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return data;
}

export interface CostDeltaParams {
  currentPeriod: TimeframeType;
  comparisonPeriod: string;
  groupBy?: GroupByType;
}

export async function getCostDelta(params: CostDeltaParams): Promise<CostDeltaResponse> {
  const { data } = await instrumentedFetch<CostDeltaResponse>('/api/cost/delta', {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return data;
}

// Export for testing
export { instrumentedFetch };
