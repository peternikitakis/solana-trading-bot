// stats.ts
/**
 * Module for calculating and logging performance metrics for the Solana trading bot.
 * Provides functions to track latency, throughput, success rate, and total value for competition readiness.
 */
export function calculateAverageTradeLatency(latencies) {
    if (latencies.length === 0)
        return 0;
    return Math.round(latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length);
}
/**
 * Calculate average API calls per trade based on total trades and API calls.
 */
export function calculateApiCallsPerTrade(totalTrades, apiCallCount) {
    return totalTrades > 0 ? Math.round(apiCallCount / totalTrades) : 0;
}
/**
 * Calculate throughput (trades per second) based on timestamps array.
 */
export function calculateThroughput(timestamps) {
    if (timestamps.length < 2)
        return 0;
    const durationMs = timestamps[timestamps.length - 1] - timestamps[0];
    const trades = timestamps.length;
    return Math.round((trades / (durationMs / 1000)) * 100) / 100; // Trades/second, rounded to 2 decimals
}
/**
 * Calculate success rate (%) based on total and successful trades.
 */
export function calculateSuccessRate(totalTrades, successfulTrades) {
    return totalTrades > 0 ? Math.round((successfulTrades / totalTrades) * 100) : 0;
}
/**
 * Calculate total value of bot balances in SOL (simplified mock for performance, assuming 6-decimal PUMP tokens).
 * @param balances Map of token mints to balances (in token units, 6 decimals for PUMP tokens).
 * @param connection Solana connection for potential price queries (mocked here for simplicity).
 */
export async function calculateTotalValue(balances, connection) {
    let totalValue = 0;
    for (const [mint, balance] of balances) {
        if (mint === "So11111111111111111111111111111111111111112") { // SOL (in SOL units, not lamports for simplicity)
            totalValue += balance; // Already in SOL (adjust if in lamports by dividing by 1,000,000,000)
        }
        else {
            try {
                // Mock price: assume 0.001 SOL per unit for PUMP tokens (adjust based on real pricing if needed)
                const quote = balance * 0.001; // Value in SOL, assuming 6 decimals
                totalValue += quote; // Add to total in SOL
            }
            catch (error) {
                console.warn(`⚠️ Error estimating value for ${mint}: ${error}`);
                continue;
            }
        }
    }
    return Math.round(totalValue * 100) / 100; // Round to 2 decimals
}
/**
 * Log performance metrics on process exit or as needed, accepting state as parameters.
 * @param tradeCount Total number of trades executed.
 * @param metrics Object containing performance metrics.
 * @param debug Whether to include detailed debug logs.
 */
export function logPerformanceMetrics(tradeCount, metrics, debug = false) {
    console.log(`📊 Final API Fetch Count | Trades: ${tradeCount} | Calls: ${metrics.apiCallCount} | Avg Trade Latency: ${calculateAverageTradeLatency(metrics.latencies)}ms | Calls/Trade: ${calculateApiCallsPerTrade(metrics.totalTrades, metrics.apiCallCount)} | Throughput: ${calculateThroughput(metrics.timestamps)} trades/second | Success Rate: ${calculateSuccessRate(metrics.totalTrades, metrics.successfulTrades)}%`);
    if (debug) {
        console.log(`DEBUG: Detailed Metrics - Trade Latencies: ${JSON.stringify(metrics.latencies)} | Timestamps: ${JSON.stringify(metrics.timestamps)}`);
    }
}
/**
 * Reset metrics for a new session, returning a fresh state object.
 * Useful for testing or restarting metrics tracking.
 */
export function resetMetrics() {
    return {
        latencies: [],
        timestamps: [],
        successfulTrades: 0,
        totalTrades: 0,
        apiCallCount: 0,
    };
}
/**
 * Update performance metrics in real-time, returning the updated state.
 * @param tradeCount Current trade count.
 * @param latency Latency of the latest trade (in ms).
 * @param timestamp Timestamp of the latest trade (in ms).
 * @param success Whether the latest trade was successful.
 * @param currentMetrics Current metrics state.
 */
export function updatePerformanceMetrics(tradeCount, latency, timestamp, success, currentMetrics) {
    return {
        latencies: [...currentMetrics.latencies, latency],
        timestamps: [...currentMetrics.timestamps, timestamp],
        successfulTrades: currentMetrics.successfulTrades + (success ? 1 : 0),
        totalTrades: currentMetrics.totalTrades + 1,
        apiCallCount: currentMetrics.apiCallCount,
    };
}
