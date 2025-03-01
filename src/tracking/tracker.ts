import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { executeSwapBuy, executeSwapSell, SwapResult } from "../trading/trader.js";
import { config } from "../config/config.js"; // Ensure this matches your file extension and path
import { sendWalletNotification, sendBotNotification } from "../notifications/notify.js";
import { 
  updatePerformanceMetrics, 
  logPerformanceMetrics, 
  resetMetrics 
} from "../stats/metrics.js";
import dotenv from "dotenv";

dotenv.config();

// Load environment variables first
const { HELIUS_RPC_URL, HELIUS_RPC_WS_URL, HELIUS_API_KEY, WALLET_TO_TRACK } =
  process.env;

if (!WALLET_TO_TRACK) {
  console.error("❌ WALLET_TO_TRACK is not defined in .env");
  process.exit(1);
}

const TRACKED_WALLET = WALLET_TO_TRACK.trim();
const heliusApiKey = HELIUS_API_KEY || "f180c745-6609-43bc-9aeb-3e5682228b5d"; // Use .env value or hardcoded fallback
const HELIUS_RPC_URL_FALLBACK = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
const HELIUS_RPC_WS_URL_FALLBACK = `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

const solMint = "So11111111111111111111111111111111111111112";
const TRADE_AMOUNT_LAMPORTS = Number(config.TRADE_AMOUNT_SOL) * 1_000_000_000;

const botKeypair = loadKeypair();
const botWallet = botKeypair.publicKey.toBase58();
const connection = new Connection(
  config.HELIUS_RPC_URL || HELIUS_RPC_URL_FALLBACK,
  {
    commitment: "processed",
    wsEndpoint: config.HELIUS_RPC_WS_URL || HELIUS_RPC_WS_URL_FALLBACK,
  }
);

console.log(
  `🌟 Solana Trading Bot Initialized\n` +
    `🌐 RPC: ${config.HELIUS_RPC_URL || HELIUS_RPC_URL_FALLBACK}\n` +
    `🌐 WS: ${config.HELIUS_RPC_WS_URL || HELIUS_RPC_WS_URL_FALLBACK}\n` +
    `💰 Trade Amount: ${config.TRADE_AMOUNT_SOL} SOL\n` +
    `👛 Bot Wallet: ${botWallet}\n` +
    `👛 Tracked Wallet: ${TRACKED_WALLET}`
);

if (!HELIUS_API_KEY) {
  console.error(
    "❌ HELIUS_API_KEY is missing in .env. Using fallback URL without API key."
  );
}

// Global state and utility functions
let previousBalances: Map<string, number> = new Map();
let botBalances: Map<string, number> = new Map(); // Initialized on startup with on-chain balances
const processedSignatures = new Set<string>();
let apiCallCount = 0;
let tradeCount = 0;
let lastBalanceCheck = 0;
let metrics = resetMetrics();
const MIN_CHECK_INTERVAL = 50; // 50ms debounce for balance checks

// Add trackedWalletSignatures as a global variable
const trackedWalletSignatures = new Map<string, string>(); // Map of token -> signature for tracked wallet transactions

// Load bot wallet and initialize connection
function loadKeypair(): Keypair {
  try {
    const parsedKey = JSON.parse(process.env.PRIVATE_KEY!);
    if (!Array.isArray(parsedKey))
      throw new Error("Invalid private key format.");
    return Keypair.fromSecretKey(Uint8Array.from(parsedKey));
  } catch (error) {
    console.error("❌ Failed to parse PRIVATE_KEY:", error);
    process.exit(1);
  }
}

function persistBotBalances() {
  if (process.env.DEBUG === "true") {
    console.log(
      `DEBUG: Persisting botBalances: ${JSON.stringify([...botBalances])}`
    );
  }
  // No disk persistence, in-memory only (updated via on-chain fetch on startup)
}

async function getWalletTokenBalances(
  walletAddress: string
): Promise<Map<string, number>> {
  apiCallCount++;
  try {
    const publicKey = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      publicKey,
      {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }
    );

    const tokenBalances = new Map<string, number>();
    for (const account of tokenAccounts.value) {
      const mint = account.account.data.parsed.info.mint;
      const balance = parseFloat(
        account.account.data.parsed.info.tokenAmount.uiAmountString
      );
      if (balance > 0) tokenBalances.set(mint, balance); // Already in UI units (scaled for decimals)
    }
    return tokenBalances;
  } catch (error) {
    console.log(
      `❌ Balance Fetch Error for wallet ${walletAddress} | ${error}`
    );
    return new Map();
  }
}

async function compareBalances(
  walletAddress: string,
  oldBalances: Map<string, number>,
  newBalances: Map<string, number>
) {
  apiCallCount++;
  if (process.env.DEBUG === "true") {
    console.log(
      `DEBUG: Comparing balances for wallet ${walletAddress} - oldBalances: ${JSON.stringify(
        [...oldBalances]
      )}, newBalances: ${JSON.stringify([...newBalances])}`
    );
  }
  const oldTokens = new Set(oldBalances.keys());
  const newTokens = new Set(newBalances.keys());

  const tradePromises = Array.from(newTokens).map(async (token) => {
    const newBalance = newBalances.get(token) || 0; // Already in UI units (scaled for 6 decimals)
    const oldBalance = oldBalances.get(token) || 0; // Already in UI units (scaled for 6 decimals)

    // Initial Buy
    if (
      newBalance > oldBalance &&
      !botBalances.has(token) &&
      !previousBalances.has(token)
    ) {
      console.log(
        `🟢 Tracking: Buy Detected | Token: ${token} | Wallet: ${walletAddress} | Amount: ${newBalance} UI units`
      );
      tradeCount++;
      const buyStart = Date.now();
      const result: SwapResult = await executeSwapBuy(
        solMint,
        token,
        TRADE_AMOUNT_LAMPORTS
      );
      const buyEnd = Date.now();
      const latency = buyEnd - buyStart;
      const success = result.success;
      if (result.success && result.outAmount) {
        botBalances.set(token, result.outAmount);
        persistBotBalances();
        console.log(
          `✅ Buy Executed | Token: ${token} | Amount: ${config.TRADE_AMOUNT_SOL} SOL | Signature: ${result.signature}`
        );
        // Use tokenDecimals = 6 (confirmed)
        const tokenDecimals = 6;
        const tokensBought = result.outAmount / Math.pow(10, tokenDecimals); // Bot’s tokens bought in UI units (e.g., 600.952259)
        const walletTokensBought = newBalance - oldBalance; // Tracked wallet’s tokens bought in UI units (e.g., 1,189.763635, no scaling needed)
        await sendBotNotification(
          "BUY",
          botWallet,
          token,
          tokensBought, // Pass in UI units (e.g., 600.952259) for bot
          latency,
          TRADE_AMOUNT_LAMPORTS,
          result.signature,
          result.dex
        );
        await sendWalletNotification(
          "BUY",
          walletAddress,
          token,
          walletTokensBought, // Pass tracked wallet’s tokens bought as details (e.g., 1,189.763635)
          latency,
          TRADE_AMOUNT_LAMPORTS,
          trackedWalletSignatures.get(token), // Pass tracked wallet’s signature for Solscan link
          "Jupiter Aggregator"
        );
        console.log(`⏱ Execution Time | Buy: ${latency}ms`);

        // After latency and success determination
        metrics = updatePerformanceMetrics(tradeCount, latency, success, metrics);
      } else {
        console.log(
          `❌ Buy Failed | Token: ${token} | No successful swap result`
        );
      }

      // Increase in Stake
    } else if (newBalance > oldBalance) {
      console.log(
        `📈 Tracking: Balance Increased | Token: ${token} | Tracked Wallet: +${newBalance - oldBalance} UI units`
      );
      const previousBalance = previousBalances.get(token) || 0;
      const currentIncrease = newBalance - oldBalance;
      const accumulatedBalance = (previousBalances.get(token) || 0) + (newBalance - (oldBalance || 0)); 
      previousBalances.set(token, accumulatedBalance); 

      let increasePercentage = 0;
      if (previousBalance > 0) {
        increasePercentage = ((accumulatedBalance - previousBalance) / previousBalance) * 100; } else if (accumulatedBalance > 0) {
          increasePercentage = 100;
        }

      await sendWalletNotification(
        "INCREASE ALERT",
         walletAddress, 
         token,
        { wallet: accumulatedBalance, increasePercent: increasePercentage.toFixed(2) }, // Use raw difference in UI units (no scaling needed)
        0, 
        undefined,
        trackedWalletSignatures.get(token), 
        "Jupiter Aggregator"
      ).catch((error) =>
        console.log(`❌ INCREASE ALERT Error | Token: ${token} | ${error}`)
      );

      // Decrease in Stake (Partial Sell)
    } else if (newBalance < oldBalance && newBalance > 0) {
      const decreaseAmount = oldBalance - newBalance; // In UI units
      const decreasePercent = (decreaseAmount / oldBalance) * 100;
      const botBalance = botBalances.get(token) || 0;
      console.log(
        `📉 Tracking: Balance Decreased | Token: ${token} | Tracked Wallet: -${decreaseAmount} UI units (${decreasePercent.toFixed(
          2
        )}%)`
      );

      let solReturned = 0;
      let latency: number | undefined; // Declare latency here
      let success: boolean | undefined; // Declare success for consistency
      const tokenDecimals = 6; // Use 6 decimals (confirmed)
      if (botBalance > 0) {
        tradeCount++;
        const sellStart = Date.now();
        const result: SwapResult = await executeSwapSell(
          token,
          solMint,
          decreasePercent
        );
        const sellEnd = Date.now();
        latency = sellEnd - sellStart; // Assign value here
        success = result.success;
        if (result.success) {
          solReturned = result.outAmount / 1_000_000_000;
          const newBotTokenBalance = botBalance - botBalance * (decreasePercent / 100);
          botBalances.set(token, newBotTokenBalance);
          persistBotBalances();
          console.log(
            `✅ Sell Executed | Token: ${token} | SOL Returned: ${solReturned.toFixed(6)}`
          );
          await sendBotNotification(
            "DECREASE ALERT",
            botWallet,
            token,
            {
              solReturned, // Now in UI units (e.g., 0.00028)
              decreasePercent: decreasePercent.toFixed(2),
            },
            latency, // Use assigned latency
            undefined,
            result.signature,
            result.dex
          );
          console.log(`⏱ Execution Time | Sell: ${latency}ms`);

          // Update metrics for latency and success
          metrics = updatePerformanceMetrics(tradeCount, latency, success, metrics);
        } else {
          console.log(
            `❌ Sell Failed | Token: ${token} | No successful swap result`
          );
          metrics = updatePerformanceMetrics(tradeCount, latency, false, metrics);
        }
      }
      if (latency !== undefined) { // Only send notification if a trade occurred
        await sendWalletNotification(
          "DECREASE ALERT",
          walletAddress,
          token,
          {
            solReturned, // Tracked wallet’s SOL returned in UI units (no scaling needed)
            decreasePercent: decreasePercent.toFixed(2),
          },
          latency, // Use latency here, now in scope
          undefined,
          trackedWalletSignatures.get(token), // Pass tracked wallet’s signature for Solscan link
          "Jupiter Aggregator"
        );
      }
    }
  }); // Closing tradePromises.map

  // Full Sell
  const sellPromises = Array.from(oldTokens).map(async (token) => {
    const newBalance = newBalances.get(token) || 0; // Already in UI units (scaled for 6 decimals)
    const botBalance = botBalances.get(token) || 0;
    let latency: number | undefined; // Declare latency here
    let success: boolean | undefined; // Declare success for consistency
    const tokenDecimals = 6; // Use 6 decimals (confirmed)
    const oldBalance = oldBalances.get(token) || 0; // Already in UI units (scaled for 6 decimals)
    if ((!newTokens.has(token) || newBalance <= 0.001) && botBalance > 0) {
      console.log(
        `🔴 Tracking: Full Sell | Token: ${token} | Amount: ${botBalance} UI units`
      );
      tradeCount++;
      const sellStart = Date.now();
      const result: SwapResult = await executeSwapSell(token, solMint, 100);
      const sellEnd = Date.now();
      latency = sellEnd - sellStart; // Assign value here
      success = result.success;
      if (result.success) {
        botBalances.set(token, 0);
        persistBotBalances();
        // Clear previousBalances for this token to allow new buys
        previousBalances.delete(token);
        const solReturned = result.outAmount / 1_000_000_000; // convert lamports to SOL
        const formattedSolReturned = Number(solReturned.toFixed(6));
        console.log(
          `✅ Full Sell Executed | Token: ${token} | SOL Returned: ${(result.outAmount / Math.pow(10, tokenDecimals)).toFixed(6)}`
        );
        await sendWalletNotification(
          "SELL",
          TRACKED_WALLET,
          token,
          { solReturned: formattedSolReturned, updatedBalance: 0 }, // Tracked wallet’s SOL returned in UI units (no scaling needed)
          latency, // Use latency here, now in scope
          undefined,
          trackedWalletSignatures.get(token), // Pass tracked wallet’s signature for Solscan link
          "Jupiter Aggregator"
        );
        await sendBotNotification(
          "SELL",
          botWallet,
          token,
          { solReturned: result.outAmount / Math.pow(10, tokenDecimals), updatedBalance: 0 }, // Bot’s SOL returned in UI units
          latency, // Use latency here, now in scope
          undefined,
          result.signature,
          result.dex
        );
        console.log(`⏱ Execution Time | Sell: ${latency}ms`); // Use latency instead of sellEnd - sellStart
      } else {
        console.log(
          `❌ Full Sell Failed | Token: ${token} | No successful swap result`
        );
        metrics = updatePerformanceMetrics(tradeCount, latency, false, metrics);
      }
    }
  }); // Closing sellPromises.map

  await Promise.all([...tradePromises, ...sellPromises]);
  previousBalances = new Map(newBalances);
  console.log(
    `📊 API Fetch Count | Trades: ${tradeCount} | Calls: ${apiCallCount}`
  );

  process.on('exit', () => {
    logPerformanceMetrics(tradeCount, metrics, process.env.DEBUG === "true");
  });

} // Closing compareBalances

export function startTracker() {
  const trackedWallet = new PublicKey(TRACKED_WALLET!);
  console.log(
    `🚀 Tracker Started | Monitoring Tracked Wallet: ${TRACKED_WALLET}`
  );

  // Fetch tracked wallet balances for initial state
  getWalletTokenBalances(TRACKED_WALLET!)
    .then((balances) => {
      apiCallCount++; // Increment for initial balance fetch
      previousBalances = balances;
      console.log(
        `✅ Sync Complete | Tracked Wallet: ${TRACKED_WALLET} | Tokens Loaded`
      );
    })
    .catch((error) => {
      console.log(`❌ Startup Failed for tracked wallet: ${error.message}`);
      process.exit(1);
    });

  // Fetch bot wallet balances on startup to restore state
  getWalletTokenBalances(botWallet)
    .then((botBalancesMap) => {
      apiCallCount++; // Increment for bot balance fetch
      botBalances = new Map(botBalancesMap); // Initialize botBalances with on-chain state
      console.log(
        `✅ Sync Complete | Bot Wallet: ${botWallet} | Tokens Loaded: ${JSON.stringify(
          [...botBalances]
        )}`
      );
    })
    .catch((error) => {
      console.log(`❌ Startup Failed for bot wallet: ${error.message}`);
      // Continue with empty botBalances, but log the error
      botBalances = new Map();
      console.warn(`⚠️ Starting with empty botBalances due to error.`);
    });

  // Subscribe to WebSocket logs for the tracked wallet
  connection.onLogs(
    trackedWallet,
    async (logs, context) => {
      apiCallCount++; // Increment for each onLogs event
      if (processedSignatures.has(logs.signature)) return;
      processedSignatures.add(logs.signature);
      console.log(
        `🔍 Activity Found | Tx: ${logs.signature.slice(0, 10)}... | Slot: ${
          context.slot
        }`
      );
      if (logs.err) {
        console.log(
          `⚠️ Tx Error | Tx: ${logs.signature.slice(0, 10)}... | Failed`
        );
        return;
      }

      const now = Date.now();
      if (now - lastBalanceCheck >= MIN_CHECK_INTERVAL) {
        const newBalances = await getWalletTokenBalances(TRACKED_WALLET!);
        apiCallCount++; // Increment for balance fetch
        for (const [token, newBal] of newBalances) {
          const oldBal = previousBalances.get(token) || 0;
          if (newBal > oldBal) {
            // Buy detected—store signature for this token
            trackedWalletSignatures.set(token, logs.signature);
          } else if (newBal < oldBal && newBal > 0) {
            // Partial sell/decrease detected—store signature for this token
            trackedWalletSignatures.set(token, logs.signature);
          } else if (!newBalances.has(token) || newBal <= 0.001) {
            // Full sell detected—store signature for this token
            trackedWalletSignatures.set(token, logs.signature);
          }
        }
        compareBalances(TRACKED_WALLET!, previousBalances, newBalances);
        previousBalances = newBalances;
        lastBalanceCheck = now;
      }
    },
    "processed"
  );
}