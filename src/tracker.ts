import { Connection, PublicKey } from "@solana/web3.js";
import { executeSwapBuy, executeSwapSell } from "./trader.js";
import { sendTelegramMessage } from "./telegram.js";
import dotenv from "dotenv";
dotenv.config();

const RPC_URL = process.env.HELIUS_RPC_URL!;
const connection = new Connection(RPC_URL, "confirmed");

// ✅ Fetch token balances from the wallet
async function fetchCurrentTokenBalances(
  walletAddress: string
): Promise<Map<string, number>> {
  try {
    const ownerPublicKey = new PublicKey(walletAddress);
    const response = await connection.getParsedTokenAccountsByOwner(
      ownerPublicKey,
      {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }
    );

    const tokenBalances = new Map<string, number>();
    for (const { account } of response.value) {
      const parsedInfo = account.data.parsed.info;
      const tokenAddress = parsedInfo.mint;
      const tokenAmount = parseFloat(parsedInfo.tokenAmount.uiAmountString);
      tokenBalances.set(tokenAddress, tokenAmount);
    }

    return tokenBalances;
  } catch (error) {
    console.error("⚠️ Error fetching token balances:", error);
    return new Map();
  }
}

const TRADE_AMOUNT_SOL = Number(process.env.TRADE_AMOUNT_SOL) || 0.01; // Default 0.01 SOL
const TRADE_AMOUNT_LAMPORTS = TRADE_AMOUNT_SOL * 1_000_000_000; // Convert to lamports

// ✅ Prevents auto-trading on first scan
let isFirstRun = true;

async function waitForBalanceUpdate(
  walletAddress: string,
  token: string,
  retries = 5,
  delayMs = 1000
) {
  for (let i = 0; i < retries; i++) {
    const balances = await fetchCurrentTokenBalances(walletAddress);
    const balance = balances.get(token) ?? 0;

    if (balance > 0) {
      console.log(`✅ Token ${token} has settled. New balance: ${balance}`);
      return true;
    }

    console.log(
      `⏳ Waiting for token ${token} to settle... (${i + 1}/${retries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log(`⚠️ Token ${token} did not settle in time.`);
  return false;
}

// ✅ Compare and handle buy/sell logic
async function compareBalances(
  walletAddress: string,
  previousBalances: Map<string, number>,
  latestBalances: Map<string, number>
) {
  const solMint = "So11111111111111111111111111111111111111112"; // SOL Mint
  const allTokens = new Set([
    ...previousBalances.keys(),
    ...latestBalances.keys(),
  ]); // Union of old & new balances

  for (const token of allTokens) {
    const oldBalance = previousBalances.get(token) ?? 0;
    const newBalance = latestBalances.get(token) ?? 0;

    /** console.log(
      `🔍 Checking token: ${token} | Old: ${oldBalance} | New: ${newBalance}`
    ); */

    if (!isFirstRun) {
      // 🟢 NEW TOKEN → BUY 100%
      if (oldBalance === 0 && newBalance > 0) {
        console.log(`🟢 BUY Detected: ${token} | Amount: ${newBalance}`);

        const buySuccess = await executeSwapBuy(
          solMint,
          token,
          TRADE_AMOUNT_LAMPORTS
        );
        if (buySuccess) {
          console.log("BUY SUCCESS DONE");
          sendTelegramMessage("BUY", walletAddress, token, newBalance);
          await waitForBalanceUpdate(walletAddress, token); // ✅ Wait until balance updates
        }
      }

      // 📈 BALANCE INCREASE → BUY MORE (25%)
      else if (newBalance > oldBalance) {
        console.log(`📈 Increase Detected: ${token} | Buying more`);

        const buyAmount = TRADE_AMOUNT_LAMPORTS * 0.25;
        const increaseSuccess = await executeSwapBuy(solMint, token, buyAmount);
        if (increaseSuccess)
          sendTelegramMessage("INCREASE", walletAddress, token, newBalance);
      }

      // 🔴 TOKEN SOLD → SELL 100%
      else if (newBalance === 0 && oldBalance > 0) {
        console.log(`🔴 SELL Detected: ${token} | Selling all`);

        const sellSuccess = await executeSwapSell(token, solMint, 100);
        if (sellSuccess) sendTelegramMessage("SELL", walletAddress, token, 0);
      }
    }
  }

  isFirstRun = false; // Enable auto-trading after first run
}

// ✅ Monitor wallet for changes
async function trackWalletBalances(walletAddress: string) {
  let previousBalances = new Map<string, number>();

  setInterval(async () => {
    const latestBalances = await fetchCurrentTokenBalances(walletAddress);
    compareBalances(walletAddress, previousBalances, latestBalances);
    previousBalances = latestBalances;
  }, 300);
}

// ✅ Export function for use in `index.ts`
export { trackWalletBalances };
