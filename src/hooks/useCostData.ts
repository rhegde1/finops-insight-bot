/**
 * Cost Data Hooks
 * 
 * React Query hooks for fetching cost data with polling support.
 * Implements real-time updates via configurable polling intervals.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCostSummary,
  getTopCosts,
  getCostsByTag,
  getCostDelta,
  getCostHealth,
  getHealth,
  CostSummaryParams,
  CostTopParams,
  CostByTagParams,
  CostDeltaParams,
  CostResponse,
  CostDeltaResponse,
  CostHealthResponse,
  HealthResponse,
  CostApiError,
} from '@/lib/costApi';
import { useCallback, useEffect, useRef, useState } from 'react';

// Default polling interval (30 seconds)
const DEFAULT_POLL_INTERVAL = 30 * 1000;

// Exponential backoff configuration
const MAX_BACKOFF_INTERVAL = 5 * 60 * 1000; // 5 minutes max
const BACKOFF_MULTIPLIER = 2;

interface UseCostDataOptions {
  enabled?: boolean;
  refetchInterval?: number | false;
  onError?: (error: CostApiError) => void;
  onSuccess?: (data: CostResponse) => void;
}

interface UseCostDataResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: CostApiError | null;
  lastUpdated: Date | null;
  refetch: () => void;
  isStale: boolean;
}

// Track last successful fetch for each query
const lastSuccessMap = new Map<string, Date>();

/**
 * Hook for fetching cost summary with real-time polling
 */
export function useCostSummary(
  params: CostSummaryParams,
  options: UseCostDataOptions = {}
): UseCostDataResult<CostResponse> {
  const queryKey = ['cost-summary', params];
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentInterval, setCurrentInterval] = useState(options.refetchInterval ?? DEFAULT_POLL_INTERVAL);
  const errorCountRef = useRef(0);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      console.log('[useCostSummary] Fetching cost summary', { params, timestamp: new Date().toISOString() });
      const data = await getCostSummary(params);
      errorCountRef.current = 0;
      setCurrentInterval(options.refetchInterval ?? DEFAULT_POLL_INTERVAL);
      setLastUpdated(new Date());
      lastSuccessMap.set(JSON.stringify(queryKey), new Date());
      options.onSuccess?.(data);
      return data;
    },
    enabled: options.enabled !== false,
    refetchInterval: currentInterval || false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  // Implement exponential backoff on errors
  useEffect(() => {
    if (query.error) {
      errorCountRef.current++;
      const baseInterval = typeof options.refetchInterval === 'number' ? options.refetchInterval : DEFAULT_POLL_INTERVAL;
      const newInterval = Math.min(
        baseInterval * (BACKOFF_MULTIPLIER ** errorCountRef.current),
        MAX_BACKOFF_INTERVAL
      );
      setCurrentInterval(newInterval);
      console.log('[useCostSummary] Error occurred, backing off', { 
        errorCount: errorCountRef.current, 
        newInterval 
      });
      options.onError?.(query.error as CostApiError);
    }
  }, [query.error, options]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as CostApiError | null,
    lastUpdated,
    refetch: query.refetch,
    isStale: query.isStale,
  };
}

/**
 * Hook for fetching top costs
 */
export function useTopCosts(
  params: CostTopParams,
  options: UseCostDataOptions = {}
): UseCostDataResult<CostResponse> {
  const queryKey = ['cost-top', params];
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      console.log('[useTopCosts] Fetching top costs', { params, timestamp: new Date().toISOString() });
      const data = await getTopCosts(params);
      setLastUpdated(new Date());
      options.onSuccess?.(data);
      return data;
    },
    enabled: options.enabled !== false,
    refetchInterval: options.refetchInterval ?? DEFAULT_POLL_INTERVAL,
    retry: 3,
    staleTime: 10000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as CostApiError | null,
    lastUpdated,
    refetch: query.refetch,
    isStale: query.isStale,
  };
}

/**
 * Hook for fetching costs by tag
 */
export function useCostsByTag(
  params: CostByTagParams,
  options: UseCostDataOptions = {}
): UseCostDataResult<CostResponse> {
  const queryKey = ['cost-by-tag', params];
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      console.log('[useCostsByTag] Fetching costs by tag', { params, timestamp: new Date().toISOString() });
      const data = await getCostsByTag(params);
      setLastUpdated(new Date());
      options.onSuccess?.(data);
      return data;
    },
    enabled: options.enabled !== false,
    refetchInterval: options.refetchInterval ?? DEFAULT_POLL_INTERVAL,
    retry: 3,
    staleTime: 10000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as CostApiError | null,
    lastUpdated,
    refetch: query.refetch,
    isStale: query.isStale,
  };
}

/**
 * Hook for fetching cost delta (comparison)
 */
export function useCostDelta(
  params: CostDeltaParams,
  options: Omit<UseCostDataOptions, 'onSuccess'> & { onSuccess?: (data: CostDeltaResponse) => void } = {}
): UseCostDataResult<CostDeltaResponse> {
  const queryKey = ['cost-delta', params];
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      console.log('[useCostDelta] Fetching cost delta', { params, timestamp: new Date().toISOString() });
      const data = await getCostDelta(params);
      setLastUpdated(new Date());
      options.onSuccess?.(data);
      return data;
    },
    enabled: options.enabled !== false,
    refetchInterval: options.refetchInterval ?? DEFAULT_POLL_INTERVAL,
    retry: 3,
    staleTime: 10000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as CostApiError | null,
    lastUpdated,
    refetch: query.refetch,
    isStale: query.isStale,
  };
}

/**
 * Hook for checking cost API health
 */
export function useCostHealth(
  options: { enabled?: boolean; refetchInterval?: number } = {}
): UseCostDataResult<CostHealthResponse> {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery({
    queryKey: ['cost-health'],
    queryFn: async () => {
      console.log('[useCostHealth] Checking cost health', { timestamp: new Date().toISOString() });
      const data = await getCostHealth();
      setLastUpdated(new Date());
      return data;
    },
    enabled: options.enabled !== false,
    refetchInterval: options.refetchInterval ?? 60000, // Check health every minute
    retry: 1,
    staleTime: 30000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as CostApiError | null,
    lastUpdated,
    refetch: query.refetch,
    isStale: query.isStale,
  };
}

/**
 * Hook for basic health check
 */
export function useHealth(
  options: { enabled?: boolean } = {}
): UseCostDataResult<HealthResponse> {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      console.log('[useHealth] Checking API health', { timestamp: new Date().toISOString() });
      const data = await getHealth();
      setLastUpdated(new Date());
      return data;
    },
    enabled: options.enabled !== false,
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as CostApiError | null,
    lastUpdated,
    refetch: query.refetch,
    isStale: query.isStale,
  };
}

/**
 * Hook to manually invalidate all cost queries
 */
export function useInvalidateCostQueries() {
  const queryClient = useQueryClient();
  
  return useCallback(() => {
    console.log('[useInvalidateCostQueries] Invalidating all cost queries');
    queryClient.invalidateQueries({ queryKey: ['cost-summary'] });
    queryClient.invalidateQueries({ queryKey: ['cost-top'] });
    queryClient.invalidateQueries({ queryKey: ['cost-by-tag'] });
    queryClient.invalidateQueries({ queryKey: ['cost-delta'] });
    queryClient.invalidateQueries({ queryKey: ['cost-health'] });
  }, [queryClient]);
}

/**
 * Hook to get real-time status info
 */
export function useRealTimeStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  
  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    setIsConnected(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updateLastPollTime = useCallback(() => {
    setLastPollTime(new Date());
  }, []);

  return {
    isConnected,
    lastPollTime,
    updateLastPollTime,
  };
}
