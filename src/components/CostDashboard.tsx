/**
 * Cost Dashboard Component
 * 
 * Main dashboard displaying real-time cost data with polling updates.
 * Shows current costs, trends, and health status.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  Clock,
  DollarSign,
  Wifi,
  WifiOff,
  Activity
} from 'lucide-react';
import { 
  useCostSummary, 
  useTopCosts, 
  useCostDelta, 
  useCostHealth,
  useRealTimeStatus,
  useInvalidateCostQueries
} from '@/hooks/useCostData';
import { TimeframeType, CostApiError } from '@/lib/costApi';
import { cn } from '@/lib/utils';
import { ChatBot } from '@/components/ChatBot';

// Polling intervals
const SUMMARY_POLL_INTERVAL = 30000; // 30 seconds
const DELTA_POLL_INTERVAL = 60000; // 1 minute

interface CostCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

function CostCard({ title, value, subtitle, trend, trendValue, isLoading, icon }: CostCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-32 mb-1" />
            <Skeleton className="h-4 w-24" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {(subtitle || trendValue) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {trend === 'up' && <TrendingUp className="h-3 w-3 text-destructive" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3 text-success" />}
                {trendValue && <span className={cn(
                  trend === 'up' && 'text-destructive',
                  trend === 'down' && 'text-success'
                )}>{trendValue}</span>}
                {subtitle && <span>{subtitle}</span>}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ErrorStateProps {
  error: CostApiError | null;
  lastSuccessAt?: Date | null;
  onRetry: () => void;
}

function ErrorState({ error, lastSuccessAt, onRetry }: ErrorStateProps) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>No Live Data</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          <strong>Reason:</strong> {error?.message || 'Failed to fetch cost data'}
          {error?.status && ` (HTTP ${error.status})`}
        </p>
        {error?.requestId && (
          <p className="text-xs font-mono">Request ID: {error.requestId}</p>
        )}
        {lastSuccessAt && (
          <p className="text-xs">
            Last successful update: {lastSuccessAt.toLocaleString()}
          </p>
        )}
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

interface HealthIndicatorProps {
  isConnected: boolean;
  lastUpdated: Date | null;
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
}

function HealthIndicator({ isConnected, lastUpdated, isLoading, isError, onRefresh }: HealthIndicatorProps) {
  const [timeSinceUpdate, setTimeSinceUpdate] = useState<string>('');

  useEffect(() => {
    if (!lastUpdated) return;
    
    const updateTime = () => {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 60) {
        setTimeSinceUpdate(`${seconds}s ago`);
      } else {
        setTimeSinceUpdate(`${Math.floor(seconds / 60)}m ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Wifi className="h-4 w-4 text-success" />
        ) : (
          <WifiOff className="h-4 w-4 text-destructive" />
        )}
        <span className={isConnected ? 'text-success' : 'text-destructive'}>
          {isConnected ? 'Connected' : 'Offline'}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Activity className={cn(
          "h-4 w-4",
          isLoading && "animate-pulse text-primary",
          isError && "text-destructive",
          !isLoading && !isError && "text-muted-foreground"
        )} />
        <span className="text-muted-foreground">
          {isLoading ? 'Updating...' : lastUpdated ? `Updated ${timeSinceUpdate}` : 'Never updated'}
        </span>
      </div>

      <Button 
        variant="ghost" 
        size="sm" 
        onClick={onRefresh}
        disabled={isLoading}
      >
        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
      </Button>
    </div>
  );
}

interface TopResourcesTableProps {
  data: Array<{ name: string; cost: number; currency: string; percentage?: number }>;
  isLoading: boolean;
}

function TopResourcesTable({ data, isLoading }: TopResourcesTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!data.length) {
    return <p className="text-muted-foreground text-sm">No cost data available</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={index} className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground w-5">{index + 1}.</span>
            <span className="text-sm truncate max-w-[200px]" title={item.name}>
              {item.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {item.currency} {item.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {item.percentage !== undefined && (
              <Badge variant="secondary" className="text-xs">
                {item.percentage.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CostDashboard() {
  const [timeframe, setTimeframe] = useState<TimeframeType>('Last7Days');
  const { isConnected } = useRealTimeStatus();
  const invalidateAll = useInvalidateCostQueries();

  // Cost summary with polling
  const {
    data: summaryData,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErrorDetails,
    lastUpdated: summaryLastUpdated,
    refetch: refetchSummary,
  } = useCostSummary(
    { timeframe, groupBy: 'ServiceName' },
    { refetchInterval: SUMMARY_POLL_INTERVAL }
  );

  // Top costs with polling
  const {
    data: topData,
    isLoading: topLoading,
    isError: topError,
    error: topErrorDetails,
    refetch: refetchTop,
  } = useTopCosts(
    { timeframe, groupBy: 'Resource', top: 5 },
    { refetchInterval: SUMMARY_POLL_INTERVAL }
  );

  // Cost delta with polling
  const {
    data: deltaData,
    isLoading: deltaLoading,
    isError: deltaError,
    error: deltaErrorDetails,
    refetch: refetchDelta,
  } = useCostDelta(
    { currentPeriod: 'Last7Days', comparisonPeriod: 'Previous7Days', groupBy: 'ServiceName' },
    { refetchInterval: DELTA_POLL_INTERVAL }
  );

  // Health check
  const {
    data: healthData,
    isLoading: healthLoading,
    isError: healthError,
  } = useCostHealth({ refetchInterval: 60000 });

  const handleRefreshAll = () => {
    console.log('[CostDashboard] Manual refresh triggered');
    invalidateAll();
  };

  const isAnyLoading = summaryLoading || topLoading || deltaLoading;
  const isAnyError = summaryError || topError || deltaError;

  // Format currency value
  const formatCurrency = (amount: number | undefined, currency: string = 'USD') => {
    if (amount === undefined) return '-';
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Calculate delta percentage
  const deltaPercentage = deltaData?.delta?.percentage;
  const deltaDirection = deltaData?.delta?.direction;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">FinOps Cost Dashboard</h1>
          <p className="text-muted-foreground">Real-time Azure cost monitoring</p>
        </div>
        <HealthIndicator
          isConnected={isConnected}
          lastUpdated={summaryLastUpdated}
          isLoading={isAnyLoading}
          isError={isAnyError}
          onRefresh={handleRefreshAll}
        />
      </div>

      {/* Health Status Banner */}
      {healthData && !healthData.ok && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cost API Health Issue</AlertTitle>
          <AlertDescription>
            {healthData.lastError || 'Unable to connect to Azure Cost Management'}
            {healthData.lastSuccessAt && (
              <span className="block text-xs mt-1">
                Last successful query: {new Date(healthData.lastSuccessAt).toLocaleString()}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Error State */}
      {isAnyError && !isAnyLoading && (
        <ErrorState
          error={summaryErrorDetails || topErrorDetails || deltaErrorDetails}
          lastSuccessAt={summaryLastUpdated}
          onRetry={handleRefreshAll}
        />
      )}

      {/* Time Range Tabs */}
      <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as TimeframeType)}>
        <TabsList>
          <TabsTrigger value="Last7Days">Last 7 Days</TabsTrigger>
          <TabsTrigger value="Last30Days">Last 30 Days</TabsTrigger>
          <TabsTrigger value="MonthToDate">Month to Date</TabsTrigger>
          <TabsTrigger value="PreviousMonth">Previous Month</TabsTrigger>
        </TabsList>

        <TabsContent value={timeframe} className="space-y-6 mt-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <CostCard
              title="Total Cost"
              value={formatCurrency(summaryData?.total?.cost, summaryData?.total?.currency)}
              subtitle={summaryData?.timeframe ? `${summaryData.timeframe.from} - ${summaryData.timeframe.to}` : undefined}
              isLoading={summaryLoading}
              icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
            />
            <CostCard
              title="Cost Change"
              value={deltaData?.delta ? `${deltaData.delta.absolute >= 0 ? '+' : ''}${formatCurrency(deltaData.delta.absolute, deltaData.currentPeriod.currency)}` : '-'}
              trend={deltaDirection === 'increase' ? 'up' : deltaDirection === 'decrease' ? 'down' : 'neutral'}
              trendValue={deltaPercentage !== undefined ? `${deltaPercentage.toFixed(1)}% vs previous period` : undefined}
              isLoading={deltaLoading}
              icon={deltaDirection === 'increase' ? 
                <TrendingUp className="h-4 w-4 text-destructive" /> : 
                <TrendingDown className="h-4 w-4 text-success" />
              }
            />
            <CostCard
              title="Resources Tracked"
              value={topData?.breakdown?.length?.toString() || '0'}
              subtitle="Active resources"
              isLoading={topLoading}
              icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            />
            <CostCard
              title="Last Updated"
              value={summaryLastUpdated ? summaryLastUpdated.toLocaleTimeString() : 'Never'}
              subtitle={summaryLastUpdated ? summaryLastUpdated.toLocaleDateString() : 'Waiting for data'}
              isLoading={summaryLoading && !summaryLastUpdated}
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          {/* Detailed View + Chat */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: Dashboard panels */}
            <div className="lg:col-span-2 space-y-6">
              {/* Top Resources */}
              <Card>
                <CardHeader>
                  <CardTitle>Top 5 Most Expensive Resources</CardTitle>
                  <CardDescription>Highest cost resources in the selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  <TopResourcesTable
                    data={topData?.breakdown || []}
                    isLoading={topLoading}
                  />
                </CardContent>
              </Card>

              {/* Cost by Service */}
              <Card>
                <CardHeader>
                  <CardTitle>Cost by Service</CardTitle>
                  <CardDescription>Breakdown by Azure service type</CardDescription>
                </CardHeader>
                <CardContent>
                  <TopResourcesTable
                    data={summaryData?.breakdown?.slice(0, 5) || []}
                    isLoading={summaryLoading}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right: Chat */}
            <div>
              <ChatBot />
            </div>
          </div>

          {/* API Health Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                API Health Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    {healthData?.ok ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="font-medium text-success">Healthy</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <span className="font-medium text-destructive">Unhealthy</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Data Source</p>
                  <p className="font-medium">{healthData?.dataSource || 'Azure Cost Management'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Latency</p>
                  <p className="font-medium">{healthData?.latencyMs ? `${healthData.latencyMs}ms` : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subscription</p>
                  <p className="font-medium font-mono text-xs truncate" title={healthData?.subscriptionId}>
                    {healthData?.subscriptionId || '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CostDashboard;
