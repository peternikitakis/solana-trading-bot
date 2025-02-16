import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";
import axios, { AxiosError } from "axios";
import { Wallet } from "@project-serum/anchor";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.HELIUS_RPC_URL!;
const JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap";
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS) || 100; // Default 1%
const PRIORITY_FEE_LAMPORTS =
  Number(process.env.PRIORITY_FEE_LAMPORTS) || 1_000_000; // 0.001 SOL
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const connection = new Connection(RPC_URL, "confirmed");

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

const walletKeypair = loadKeypair();
const wallet = new Wallet(walletKeypair);

async function getTokenBalance(tokenAddress: string): Promise<number> {
  try {
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      walletKeypair.publicKey,
      { mint: new PublicKey(tokenAddress) }
    );

    if (tokenAccounts.value.length === 0) {
      throw new Error("No holdings found for token: ${tokenAddress}");
    }

    const balanceInfo = await connection.getTokenAccountBalance(
      tokenAccounts.value[0].pubkey
    );

    console.log(
      "🔍 Current Balance for ${tokenAddress}: ${balanceInfo.value.amount} tokens"
    );
    return parseInt(balanceInfo.value.amount);
  } catch (error) {
    console.error(" Error Fetching Token Balance:", error);
    throw new Error("Failed to get token balance.");
  }
}

/** ✅ Get a Quote from Jupiter */
async function getBestQuote(
  inputMint: string,
  outputMint: string,
  amount: number
) {
  try {
    console.log(
      `🔄 Fetching best route for ${amount} ${inputMint} → ${outputMint}`
    );

    const params = {
      inputMint,
      outputMint,
      amount,
      slippageBps: SLIPPAGE_BPS, // ✅ Only using manual slippage
      restrictIntermediateTokens: true, // ✅ Stability
    };

    const response = await axios.get(JUPITER_QUOTE_API, {
      params,
      headers: JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {},
    });

    if (
      !response.data ||
      !response.data.outAmount ||
      response.data.outAmount === "0"
    ) {
      console.error("❌ No valid quote received.");
      return null;
    }

    console.log("✅ Jupiter Quote:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError; // ✅ Type assertion
    console.error(
      "❌ Error fetching quote:",
      axiosError.response?.data || axiosError.message
    );
    return null;
  }
}

/** ✅ Execute a Swap */
async function executeSwap(
  inputMint: string,
  outputMint: string,
  amount: number
): Promise<boolean> {
  try {
    console.log(`🔄 Executing swap: ${amount} of ${inputMint} → ${outputMint}`);

    const quoteResponse = await getBestQuote(inputMint, outputMint, amount);
    if (!quoteResponse) {
      console.error("❌ Swap failed: No valid quote found.");
      return false;
    }

    const swapResponse = await axios.post(
      JUPITER_SWAP_API,
      {
        quoteResponse,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: true, // ✅ Estimate Compute Unit
        dynamicSlippage: false, //
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: PRIORITY_FEE_LAMPORTS,
            priorityLevel: "veryHigh",
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          ...(JUPITER_API_KEY && { "x-api-key": JUPITER_API_KEY }),
        },
      }
    );

    const swapData = swapResponse.data;
    console.log(
      "✅ Swap Transaction Received:",
      JSON.stringify(swapResponse.data, null, 2)
    );

    if (!swapData.swapTransaction) {
      console.error("❌ Swap transaction creation failed:", swapData);
      return false;
    }

    // Deserialize, Sign & Send Transaction
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(swapData.swapTransaction, "base64")
    );
    transaction.sign([walletKeypair]);

    const rawTransaction = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      maxRetries: 5,
    });

    // Debug logs: Transaction ID + Solscan Link
    console.log(`✅ Transaction Sent! Signature: ${signature}`);
    console.log(`🔍 Track on Solscan: https://solscan.io/tx/${signature}`);

    // ✅ Confirm transaction using just the signature
    const confirmation = await connection.confirmTransaction(
      signature,
      "finalized"
    );

    if (confirmation.value.err) {
      throw new Error(
        `Transaction failed: ${JSON.stringify(
          confirmation.value.err
        )}\nhttps://solscan.io/tx/${signature}/`
      );
    }

    console.log(`✅ Swap Executed: https://solscan.io/tx/${signature}/`);
    return true;
  } catch (error) {
    console.error("❌ Swap execution failed:", error);
    return false;
  }
}

/** ✅ Execute Buy Swap */
async function executeSwapBuy(
  inputMint: string,
  outputMint: string,
  amount: number
): Promise<boolean> {
  console.log(`🛒 Buying ${amount} of ${outputMint} using ${inputMint}`);
  return executeSwap(inputMint, outputMint, amount);
}

/** ✅ Execute Sell Swap */
async function executeSwapSell(
  inputMint: string,
  outputMint: string,
  percentageToSell: number
): Promise<boolean> {
  try {
    console.log(
      `🔄 Selling ${percentageToSell}% of ${inputMint} → ${outputMint}`
    );

    const tokenBalance = await getTokenBalance(inputMint);

    if (tokenBalance <= 0) {
      console.error(`❌ No balance found for ${inputMint}, unable to sell.`);
      return false;
    }

    console.log(
      `📊 Before Sell: ${inputMint} | Detected Balance: ${tokenBalance}`
    );

    const sellAmount = tokenBalance;
    console.log(`💰 Selling ${sellAmount} tokens of ${inputMint}`);

    return executeSwap(inputMint, outputMint, sellAmount);
  } catch (error) {
    console.error(`❌ Error fetching balance for ${inputMint}:`, error);
    return false;
  }
}

/** ✅ Export Swap Functions */
export { executeSwapBuy, executeSwapSell };
