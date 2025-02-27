import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { executeSwapBuy, executeSwapSell, SwapResult } from "./trader.js";
import { config } from "./config.js"; // Ensure this matches your file extension and path
import { sendWalletNotification, sendBotNotification } from "./notify.js";
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
const MIN_CHECK_INTERVAL = 50; // 50ms debounce for balance checks

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
      if (balance > 0) tokenBalances.set(mint, balance);
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
    const newBalance = newBalances.get(token) || 0;
    const oldBalance = oldBalances.get(token) || 0;

    // Initial Buy
    if (
      newBalance > oldBalance &&
      !botBalances.has(token) &&
      !previousBalances.has(token)
    ) {
      console.log(
        `🟢 Tracking: Buy Detected | Token: ${token} | Wallet: ${walletAddress} | Amount: ${newBalance}`
      );
      tradeCount++;
      const buyStart = Date.now();
      const result: SwapResult = await executeSwapBuy(
        solMint,
        token,
        TRADE_AMOUNT_LAMPORTS
      );
      const buyEnd = Date.now();
      if (result.success && result.outAmount) {
        botBalances.set(token, result.outAmount);
        persistBotBalances();
        console.log(
          `✅ Buy Executed | Token: ${token} | Amount: ${config.TRADE_AMOUNT_SOL} SOL | Signature: ${result.signature}`
        );
        // Convert token outAmount to UI units (assuming 6 decimals for most Solana tokens)
        const tokenDecimals = 6; // Adjust based on the token's actual decimals (check token metadata)
        const tokensBought = result.outAmount / Math.pow(10, tokenDecimals); // Convert lamports to UI (e.g., 92.940706)
        await sendBotNotification(
          "BUY",
          botWallet,
          token,
          tokensBought, // Pass in UI units (e.g., 92.940706)
          TRADE_AMOUNT_LAMPORTS,
          result.signature,
          result.dex
        );
        await sendWalletNotification(
          "BUY",
          walletAddress,
          token,
          (newBalance - oldBalance) / Math.pow(10, tokenDecimals), // Convert balance diff to UI units
          TRADE_AMOUNT_LAMPORTS,
          "Jupiter Aggregator"
        );
        console.log(`⏱ Execution Time | Buy: ${buyEnd - buyStart}ms`);
      } else {
        console.log(
          `❌ Buy Failed | Token: ${token} | No successful swap result`
        );
      }

      // Increase in Stake
    } else if (newBalance > oldBalance) {
      console.log(
        `📈 Tracking: Balance Increased | Token: ${token} | Tracked Wallet: +${
          newBalance - oldBalance
        }`
      );
      await sendWalletNotification("INCREASE ALERT", walletAddress, token, {
        wallet: newBalance / Math.pow(10, 6), // Convert to UI units (6 decimals)
      }).catch((error) =>
        console.log(`❌ INCREASE ALERT Error | Token: ${token} | ${error}`)
      );

      // Decrease in Stake (Partial Sell)
    } else if (newBalance < oldBalance && newBalance > 0) {
      const decreaseAmount = oldBalance - newBalance;
      const decreasePercent = (decreaseAmount / oldBalance) * 100;
      const botBalance = botBalances.get(token) || 0;
      console.log(
        `📉 Tracking: Balance Decreased | Token: ${token} | Tracked Wallet: -${decreaseAmount} (${decreasePercent.toFixed(
          2
        )}%)`
      );

      let solReturned = 0;
      if (botBalance > 0) {
        tradeCount++;
        const sellStart = Date.now();
        const result: SwapResult = await executeSwapSell(
          token,
          solMint,
          decreasePercent
        );
        const sellEnd = Date.now();
        if (result.success) {
          solReturned = result.outAmount / 1_000_000_000; // Convert lamports to SOL
          const newBotBalance =
            botBalance - botBalance * (decreasePercent / 100);
          botBalances.set(token, newBotBalance);
          persistBotBalances();
          console.log(
            `✅ Sell Executed | Token: ${token} | SOL Returned: ${solReturned.toFixed(6)}`
          );
          await sendBotNotification(
            "DECREASE ALERT",
            botWallet,
            token,
            {
              solReturned: solReturned, // Now in SOL (e.g., 0.00028)
              decreasePercent: decreasePercent.toFixed(2),
            },
            undefined,
            result.signature,
            result.dex
          );
          console.log(`⏱ Execution Time | Sell: ${sellEnd - sellStart}ms`);
        } else {
          console.log(
            `❌ Sell Failed | Token: ${token} | No successful swap result`
          );
        }
      }
      await sendWalletNotification(
        "DECREASE ALERT",
        walletAddress,
        token,
        {
          solReturned: solReturned, // Now in SOL
          decreasePercent: decreasePercent.toFixed(2),
        },
        undefined,
        "Jupiter Aggregator"
      );
    }
  }); // Closing tradePromises.map

  // Full Sell
  const sellPromises = Array.from(oldTokens).map(async (token) => {
    const newBalance = newBalances.get(token) || 0;
    const botBalance = botBalances.get(token) || 0;
    if ((!newTokens.has(token) || newBalance <= 0.001) && botBalance > 0) {
      console.log(
        `🔴 Tracking: Full Sell | Token: ${token} | Amount: ${botBalance}`
      );
      tradeCount++;
      const sellStart = Date.now();
      const result: SwapResult = await executeSwapSell(token, solMint, 100);
      const sellEnd = Date.now();
      if (result.success) {
        botBalances.set(token, 0);
        persistBotBalances();
        console.log(
          `✅ Full Sell Executed | Token: ${token} | SOL Returned: ${(result.outAmount / 1_000_000_000).toFixed(6)}`
        );
        await sendWalletNotification(
          "SELL",
          TRACKED_WALLET,
          token,
          { solReturned: result.outAmount / 1_000_000_000, updatedBalance: 0 }, // Convert lamports to SOL
          undefined,
          "Jupiter Aggregator"
        );
        await sendBotNotification(
          "SELL",
          botWallet,
          token,
          { solReturned: result.outAmount / 1_000_000_000, updatedBalance: 0 }, // Convert lamports to SOL
          undefined,
          result.signature,
          result.dex
        );
        console.log(`⏱ Execution Time | Sell: ${sellEnd - sellStart}ms`);
      } else {
        console.log(
          `❌ Full Sell Failed | Token: ${token} | No successful swap result`
        );
      }
    }
  }); // Closing sellPromises.map

  await Promise.all([...tradePromises, ...sellPromises]);
  previousBalances = new Map(newBalances);
  console.log(
    `📊 API Fetch Count | Trades: ${tradeCount} | Calls: ${apiCallCount}`
  );
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
        compareBalances(TRACKED_WALLET!, previousBalances, newBalances);
        previousBalances = newBalances;
        lastBalanceCheck = now;
      }
    },
    "processed"
  );
}
