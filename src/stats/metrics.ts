import { Connection } from "@solana/web3.js"; 

/**
 * Calculate the average trade latency (in milliseconds) based on an array of latency values.
 * Returns 0 if no trades are recorded.
 */
export function calculateAverageTradeLatency(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  return Math.round(latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length);
}

/**
 * Calculate the average number of API calls per trade based on total trades and API calls.
 * Returns 0 if no trades have occurred.
 */
export function calculateApiCallsPerTrade(totalTrades: number, apiCallCount: number): number {
  return totalTrades > 0 ? Math.round(apiCallCount / totalTrades) : 0;
}

/**
 * Calculate the success rate (in percentage) of trades based on total and successful trades.
 * Returns 0 if no trades have occurred.
 */
export function calculateSuccessRate(totalTrades: number, successfulTrades: number): number {
  return totalTrades > 0 ? Math.round((successfulTrades / totalTrades) * 100) : 0;
}

/**
 * Update performance metrics in real-time, returning the updated state.
 * Tracks only latency, success rate, and API calls, excluding throughput and total value.
 * @param tradeCount Current trade count.
 * @param latency Latency of the latest trade (in ms).
 * @param success Whether the latest trade was successful.
 * @param currentMetrics Current metrics state.
 */
export function updatePerformanceMetrics(
  tradeCount: number,
  latency: number,
  success: boolean,
  currentMetrics: {
    latencies: number[];
    successfulTrades: number;
    totalTrades: number;
    apiCallCount: number;
  }
): {
  latencies: number[];
  successfulTrades: number;
  totalTrades: number;
  apiCallCount: number;
} {
  return {
    latencies: [...currentMetrics.latencies, latency],
    successfulTrades: currentMetrics.successfulTrades + (success ? 1 : 0),
    totalTrades: currentMetrics.totalTrades + 1,
    apiCallCount: currentMetrics.apiCallCount,
  };
}

/**
 * Log performance metrics on process exit or as needed, focusing on latency, success rate, and API calls.
 * @param tradeCount Total number of trades executed.
 * @param metrics Object containing performance metrics.
 * @param debug Whether to include detailed debug logs.
 */
export function logPerformanceMetrics(
  tradeCount: number,
  metrics: {
    latencies: number[];
    successfulTrades: number;
    totalTrades: number;
    apiCallCount: number;
  },
  debug: boolean = false
): void {
  console.log(
    `📊 Final API Fetch Count | Trades: ${tradeCount} | Calls: ${metrics.apiCallCount} | Avg Trade Latency: ${calculateAverageTradeLatency(metrics.latencies)}ms | Calls/Trade: ${calculateApiCallsPerTrade(metrics.totalTrades, metrics.apiCallCount)} | Success Rate: ${calculateSuccessRate(metrics.totalTrades, metrics.successfulTrades)}%`
  );
  if (debug) {
    console.log(`DEBUG: Detailed Metrics - Trade Latencies: ${JSON.stringify(metrics.latencies)}`);
  }
}

/**
 * Reset metrics for a new session, returning a fresh state object.
 * Useful for testing or restarting metrics tracking, excluding throughput and total value.
 */
export function resetMetrics(): {
  latencies: number[];
  successfulTrades: number;
  totalTrades: number;
  apiCallCount: number;
} {
  return {
    latencies: [],
    successfulTrades: 0,
    totalTrades: 0,
    apiCallCount: 0,
  };
}