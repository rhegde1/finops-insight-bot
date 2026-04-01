import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';
import { InvocationContext } from '@azure/functions';

/**
 * Timeframe options for cost queries
 */
export type TimeframeType = 
  | 'Last7Days' 
  | 'Last30Days' 
  | 'MonthToDate' 
  | 'PreviousMonth' 
  | 'Custom';

/**
 * Grouping dimensions for cost breakdown
 */
export type GroupByType = 
  | 'ResourceGroup' 
  | 'ServiceName' 
  | 'Resource' 
  | 'Tag';

/**
 * Request body for cost summary endpoint
 */
export interface CostSummaryRequest {
  timeframe: TimeframeType;
  from?: string;
  to?: string;
  groupBy?: GroupByType;
}

/**
 * Request body for top costs endpoint
 */
export interface CostTopRequest {
  timeframe: TimeframeType;
  from?: string;
  to?: string;
  groupBy?: GroupByType;
  top?: number;
}

/**
 * Request body for costs by tag endpoint
 */
export interface CostByTagRequest {
  timeframe: TimeframeType;
  from?: string;
  to?: string;
  tagKey: string;
}

/**
 * Request body for cost delta endpoint
 */
export interface CostDeltaRequest {
  currentPeriod: 'Last7Days' | 'Last30Days' | 'MonthToDate';
  comparisonPeriod: 'Previous7Days' | 'Previous30Days' | 'PreviousMonth';
  groupBy?: GroupByType;
}

/**
 * Individual cost breakdown row
 */
export interface CostRow {
  name: string;
  cost: number;
  currency: string;
}

/**
 * Standard response format for cost queries
 */
export interface CostResponse {
  success: boolean;
  timeframe: {
    type: TimeframeType | string;
    from: string;
    to: string;
  };
  scope: string;
  total: {
    cost: number;
    currency: string;
  };
  breakdown: CostRow[];
  groupedBy?: string;
  metadata?: {
    query_time_ms: number;
    row_count: number;
  };
}

/**
 * Cost delta response format
 */
export interface CostDeltaResponse {
  success: boolean;
  currentPeriod: {
    from: string;
    to: string;
    total: number;
  };
  comparisonPeriod: {
    from: string;
    to: string;
    total: number;
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
    percentageChange: number;
  }>;
  currency: string;
  groupedBy?: string;
}

/**
 * Azure Cost Management Query API client
 */
export class CostManagementClient {
  private subscriptionId: string;
  private apiVersion: string;
  private credential: DefaultAzureCredential | ManagedIdentityCredential;

  constructor() {
    this.subscriptionId = process.env.SUBSCRIPTION_ID || '';
    this.apiVersion = process.env.COST_API_VERSION || '2023-11-01';

    // Use Managed Identity if AZURE_CLIENT_ID is set, otherwise use DefaultAzureCredential
    const clientId = process.env.AZURE_CLIENT_ID;
    if (clientId) {
      this.credential = new ManagedIdentityCredential(clientId);
    } else {
      this.credential = new DefaultAzureCredential();
    }
  }

  /**
   * Get the subscription scope for queries
   */
  private getScope(): string {
    return `/subscriptions/${this.subscriptionId}`;
  }

  /**
   * Get an access token for the Azure Resource Manager API
   */
  private async getAccessToken(): Promise<string> {
    const tokenResponse = await this.credential.getToken('https://management.azure.com/.default');
    return tokenResponse.token;
  }

  /**
   * Calculate date range based on timeframe
   */
  public getDateRange(timeframe: TimeframeType, from?: string, to?: string): { from: string; to: string } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeframe) {
      case 'Last7Days': {
        const start = new Date(today);
        start.setDate(start.getDate() - 7);
        return {
          from: start.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
      }
      case 'Last30Days': {
        const start = new Date(today);
        start.setDate(start.getDate() - 30);
        return {
          from: start.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
      }
      case 'MonthToDate': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          from: start.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
      }
      case 'PreviousMonth': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          from: start.toISOString().split('T')[0],
          to: end.toISOString().split('T')[0]
        };
      }
      case 'Custom': {
        if (!from || !to) {
          throw new Error('Custom timeframe requires from and to dates');
        }
        return { from, to };
      }
      default:
        throw new Error(`Unknown timeframe: ${timeframe}`);
    }
  }

  /**
   * Map groupBy type to Cost Management API dimension
   */
  private mapGroupByToDimension(groupBy?: GroupByType): string | undefined {
    const mapping: Record<GroupByType, string> = {
      'ResourceGroup': 'ResourceGroup',
      'ServiceName': 'ServiceName',
      'Resource': 'ResourceId',
      'Tag': 'Tag' // Special handling required
    };
    return groupBy ? mapping[groupBy] : undefined;
  }

  /**
   * Execute a cost query against Azure Cost Management API
   */
  async queryCosts(
    timeframe: TimeframeType,
    from?: string,
    to?: string,
    groupBy?: GroupByType,
    tagKey?: string,
    context?: InvocationContext
  ): Promise<CostResponse> {
    const startTime = Date.now();
    const dateRange = this.getDateRange(timeframe, from, to);
    
    context?.log(`Querying costs: ${dateRange.from} to ${dateRange.to}, groupBy: ${groupBy || 'none'}`);

    // Build the query payload
    const query: any = {
      type: 'ActualCost',
      timeframe: 'Custom',
      timePeriod: {
        from: dateRange.from,
        to: dateRange.to
      },
      dataset: {
        granularity: 'None',
        aggregation: {
          totalCost: {
            name: 'Cost',
            function: 'Sum'
          }
        }
      }
    };

    // Add grouping if specified
    if (groupBy) {
      const dimension = this.mapGroupByToDimension(groupBy);
      if (groupBy === 'Tag' && tagKey) {
        query.dataset.grouping = [{
          type: 'TagKey',
          name: tagKey
        }];
      } else if (dimension) {
        query.dataset.grouping = [{
          type: 'Dimension',
          name: dimension
        }];
      }
    }

    // Make the API call
    const token = await this.getAccessToken();
    const url = `https://management.azure.com${this.getScope()}/providers/Microsoft.CostManagement/query?api-version=${this.apiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      context?.error(`Cost API error: ${response.status} - ${errorBody}`);
      throw new Error(`Cost Management API error: ${response.status}`);
    }

    const result = await response.json();
    const endTime = Date.now();

    // Parse the response
    const columns = result.properties?.columns || [];
    const rows = result.properties?.rows || [];

    // Find column indices
    const costIndex = columns.findIndex((c: any) => c.name === 'Cost');
    const currencyIndex = columns.findIndex((c: any) => c.name === 'Currency');
    const groupIndex = groupBy
      ? columns.findIndex((c: any) =>
          c.name === groupBy ||
          c.name === 'ResourceGroup' ||
          c.name === 'ServiceName' ||
          c.name === 'ResourceId' ||
          c.name === 'TagKey' ||
          c.name === 'TagValue' ||
          (c.type === 'string' && c.name !== 'Currency')
        )
      : -1;

    // Calculate total and build breakdown
    let totalCost = 0;
    const breakdown: CostRow[] = [];
    const currency = rows[0]?.[currencyIndex] || 'USD';

    for (const row of rows) {
      const cost = row[costIndex] || 0;
      totalCost += cost;

      if (groupBy && groupIndex >= 0) {
        breakdown.push({
          name: row[groupIndex] || 'Unknown',
          cost: cost,
          currency: row[currencyIndex] || currency
        });
      }
    }

    // Sort breakdown by cost descending
    breakdown.sort((a, b) => b.cost - a.cost);

    return {
      success: true,
      timeframe: {
        type: timeframe,
        from: dateRange.from,
        to: dateRange.to
      },
      scope: this.getScope(),
      total: {
        cost: Math.round(totalCost * 100) / 100,
        currency
      },
      breakdown,
      groupedBy: groupBy,
      metadata: {
        query_time_ms: endTime - startTime,
        row_count: rows.length
      }
    };
  }

  /**
   * Get top N costs by a dimension
   */
  async queryTopCosts(
    timeframe: TimeframeType,
    from?: string,
    to?: string,
    groupBy: GroupByType = 'Resource',
    top: number = 10,
    context?: InvocationContext
  ): Promise<CostResponse> {
    const result = await this.queryCosts(timeframe, from, to, groupBy, undefined, context);
    
    // Limit to top N
    result.breakdown = result.breakdown.slice(0, top);
    
    return result;
  }

  /**
   * Get costs grouped by a specific tag
   */
  async queryCostsByTag(
    timeframe: TimeframeType,
    tagKey: string,
    from?: string,
    to?: string,
    context?: InvocationContext
  ): Promise<CostResponse> {
    return this.queryCosts(timeframe, from, to, 'Tag', tagKey, context);
  }

  /**
   * Compare costs between two periods
   */
  async queryCostDelta(
    currentPeriod: 'Last7Days' | 'Last30Days' | 'MonthToDate',
    comparisonPeriod: 'Previous7Days' | 'Previous30Days' | 'PreviousMonth',
    groupBy?: GroupByType,
    context?: InvocationContext
  ): Promise<CostDeltaResponse> {
    // Get current period dates
    const currentRange = this.getDateRange(currentPeriod);
    
    // Calculate comparison period dates
    let comparisonRange: { from: string; to: string };
    const currentFrom = new Date(currentRange.from);
    const currentTo = new Date(currentRange.to);
    const daysDiff = Math.ceil((currentTo.getTime() - currentFrom.getTime()) / (1000 * 60 * 60 * 24));

    switch (comparisonPeriod) {
      case 'Previous7Days': {
        const end = new Date(currentFrom);
        end.setDate(end.getDate() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        comparisonRange = {
          from: start.toISOString().split('T')[0],
          to: end.toISOString().split('T')[0]
        };
        break;
      }
      case 'Previous30Days': {
        const end = new Date(currentFrom);
        end.setDate(end.getDate() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 29);
        comparisonRange = {
          from: start.toISOString().split('T')[0],
          to: end.toISOString().split('T')[0]
        };
        break;
      }
      case 'PreviousMonth': {
        const now = new Date();
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
        comparisonRange = {
          from: prevMonthStart.toISOString().split('T')[0],
          to: prevMonthEnd.toISOString().split('T')[0]
        };
        break;
      }
      default:
        throw new Error(`Unknown comparison period: ${comparisonPeriod}`);
    }

    // Query both periods
    const [currentResult, comparisonResult] = await Promise.all([
      this.queryCosts(currentPeriod, undefined, undefined, groupBy, undefined, context),
      this.queryCosts('Custom', comparisonRange.from, comparisonRange.to, groupBy, undefined, context)
    ]);

    // Calculate deltas
    const absoluteDelta = currentResult.total.cost - comparisonResult.total.cost;
    const percentageDelta = comparisonResult.total.cost !== 0
      ? ((absoluteDelta / comparisonResult.total.cost) * 100)
      : (absoluteDelta > 0 ? 100 : 0);

    // Build breakdown comparison
    const breakdownMap = new Map<string, { current: number; previous: number }>();
    
    for (const item of currentResult.breakdown) {
      breakdownMap.set(item.name, { current: item.cost, previous: 0 });
    }
    
    for (const item of comparisonResult.breakdown) {
      const existing = breakdownMap.get(item.name);
      if (existing) {
        existing.previous = item.cost;
      } else {
        breakdownMap.set(item.name, { current: 0, previous: item.cost });
      }
    }

    const breakdown = Array.from(breakdownMap.entries())
      .map(([name, data]) => ({
        name,
        current: Math.round(data.current * 100) / 100,
        previous: Math.round(data.previous * 100) / 100,
        delta: Math.round((data.current - data.previous) * 100) / 100,
        percentageChange: data.previous !== 0
          ? Math.round(((data.current - data.previous) / data.previous) * 10000) / 100
          : (data.current > 0 ? 100 : 0)
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return {
      success: true,
      currentPeriod: {
        from: currentRange.from,
        to: currentRange.to,
        total: currentResult.total.cost
      },
      comparisonPeriod: {
        from: comparisonRange.from,
        to: comparisonRange.to,
        total: comparisonResult.total.cost
      },
      delta: {
        absolute: Math.round(absoluteDelta * 100) / 100,
        percentage: Math.round(percentageDelta * 100) / 100,
        direction: absoluteDelta > 0.01 ? 'increase' : (absoluteDelta < -0.01 ? 'decrease' : 'unchanged')
      },
      breakdown,
      currency: currentResult.total.currency,
      groupedBy: groupBy
    };
  }
}

// Singleton instance
let clientInstance: CostManagementClient | null = null;

export function getCostClient(): CostManagementClient {
  if (!clientInstance) {
    clientInstance = new CostManagementClient();
  }
  return clientInstance;
}
