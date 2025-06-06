import { Connection, Keypair, VersionedTransaction, PublicKey, } from "@solana/web3.js";
import axios from "axios";
import { Wallet } from "@project-serum/anchor";
import { config } from "./config.js";
const JUPITER_QUOTE_API = config.JUPITER_API || "https://api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap";
const SLIPPAGE_BPS = 100; // 1% slippage for reliability
const PRIORITY_FEE_LAMPORTS = 25000; // 0.000025 SOL for ~200-250ms latency
function loadKeypair() {
    try {
        const parsedKey = JSON.parse(process.env.PRIVATE_KEY);
        if (!Array.isArray(parsedKey))
            throw new Error("Invalid private key format.");
        return Keypair.fromSecretKey(Uint8Array.from(parsedKey));
    }
    catch (error) {
        console.error("❌ Failed to parse PRIVATE_KEY:", error);
        process.exit(1);
    }
}
const walletKeypair = loadKeypair();
const wallet = new Wallet(walletKeypair);
async function getTokenBalance(tokenAddress, connection) {
    try {
        console.log(`🔍 Current Balance Check via Jupiter for ${tokenAddress}`);
        const tokenAccounts = await connection.getTokenAccountsByOwner(walletKeypair.publicKey, { mint: new PublicKey(tokenAddress) });
        if (tokenAccounts.value.length === 0) {
            console.log(`❌ No holdings found for token: ${tokenAddress} via Jupiter`);
            return 0;
        }
        const balanceInfo = await connection.getTokenAccountBalance(tokenAccounts.value[0].pubkey);
        console.log(`🔍 Current Balance for ${tokenAddress} via Jupiter: ${balanceInfo.value.uiAmount} tokens`);
        return parseInt(balanceInfo.value.amount);
    }
    catch (error) {
        console.error(`❌ Error fetching balance for ${tokenAddress} via Jupiter:`, error);
        return 0;
    }
}
async function getBestQuote(inputMint, outputMint, amount) {
    try {
        console.log(`🔄 Fetching best route via Jupiter for ${amount} ${inputMint} → ${outputMint}`);
        const response = await axios.get(JUPITER_QUOTE_API, {
            params: {
                inputMint,
                outputMint,
                amount,
                slippageBps: SLIPPAGE_BPS,
            },
            headers: {}, // Remove API key headers, send unauthenticated request
        });
        if (!response.data ||
            !response.data.outAmount ||
            response.data.outAmount === "0") {
            console.error("❌ No valid quote received via Jupiter.");
            return null;
        }
        console.log("✅ Jupiter Quote:", JSON.stringify(response.data, null, 2));
        return response.data;
    }
    catch (error) {
        console.error("❌ Error fetching quote via Jupiter:", error.message);
        return null;
    }
}
async function executeSwap(inputMint, outputMint, amount) {
    try {
        console.log(`🔄 Executing swap via Jupiter: ${amount} of ${inputMint} → ${outputMint}`);
        const quoteResponse = await getBestQuote(inputMint, outputMint, amount);
        if (!quoteResponse) {
            console.error("❌ Swap failed via Jupiter: No valid quote found.");
            return { success: false, outAmount: 0 }; // Ensure outAmount is included
        }
        console.log("DEBUG: Quote Response outAmount (lamports)", quoteResponse.outAmount); // Log quote outAmount
        const swapResponse = await axios.post(JUPITER_SWAP_API, {
            quoteResponse,
            userPublicKey: wallet.publicKey.toBase58(),
            dynamicComputeUnitLimit: true,
            dynamicSlippage: false,
            prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: {
                    maxLamports: PRIORITY_FEE_LAMPORTS,
                    priorityLevel: "veryHigh",
                },
            },
        }, {
            headers: {}, // Remove API key headers, send unauthenticated request
        });
        if (!swapResponse.data.swapTransaction) {
            console.error("❌ Swap transaction creation failed via Jupiter:", swapResponse.data);
            return { success: false, outAmount: 0 }; // Ensure outAmount is included
        }
        console.log("DEBUG: Swap Response Data:", JSON.stringify(swapResponse.data, null, 2));
        console.log("✅ Swap Transaction Received via Jupiter:", JSON.stringify(swapResponse.data, null, 2));
        // Since tracker.ts uses a global connection, we’ll assume it’s available globally or pass it if needed
        const connection = new Connection(config.HELIUS_RPC_URL, // Uses your authenticated Helius RPC URL
        { commitment: "processed" } // Fastest commitment for performance
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("processed");
        const transaction = VersionedTransaction.deserialize(Buffer.from(swapResponse.data.swapTransaction, "base64"));
        transaction.sign([walletKeypair]);
        const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true, maxRetries: 5 });
        console.log(`✅ Transaction Sent via Jupiter! Signature: ${signature}`);
        console.log(`🔍 Track on Solscan via Jupiter: https://solscan.io/tx/${signature}`);
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "processed");
        console.log(`✅ Swap Executed via Jupiter: https://solscan.io/tx/${signature}/ via ${quoteResponse.route?.[0]?.market?.name || "Jupiter Aggregator"}`);
        try {
            const heliusApiKey = config.HELIUS_RPC_URL || process.env.HELIUS_API_KEY;
            if (!heliusApiKey) {
                throw new Error("HELIUS_API_KEY is missing in config or .env");
            }
            const heliusResponse = await axios.get(`https://api.helius.xyz/v0/transactions/${signature}?api-key=${heliusApiKey}`);
            const transactionData = heliusResponse.data;
            if (transactionData &&
                transactionData.meta &&
                transactionData.meta.postTokenBalances) {
                const outputTokenBalance = transactionData.meta.postTokenBalances.find((balance) => balance.mint === outputMint &&
                    balance.owner === wallet.publicKey.toBase58());
                if (outputTokenBalance) {
                    const finalOutAmount = outputTokenBalance.uiAmount; // e.g., 26.468506 for 6 decimals
                    console.log("DEBUG: Final outAmount from Helius (UI):", finalOutAmount);
                    console.log("DEBUG: Final outAmount from Helius (lamports):", outputTokenBalance.amount);
                    return {
                        success: true,
                        outAmount: finalOutAmount, // Use actual UI amount (26.468506)
                        signature,
                        dex: quoteResponse.route?.[0]?.market?.name || "Jupiter Aggregator",
                    };
                }
            }
            throw new Error("No postTokenBalances found in Helius response");
        }
        catch (error) {
            console.warn(`WARNING: Failed to fetch final outAmount from Helius: ${error.message}. Using quote outAmount as fallback.`);
            const quoteOutAmount = Number(quoteResponse.outAmount);
            console.log("DEBUG: Quote outAmount (lamports):", quoteOutAmount);
            console.log("DEBUG: Quote outAmount (with 6 decimals):", quoteOutAmount / 1000000);
            return {
                success: true,
                outAmount: quoteOutAmount / 1000000,
                signature,
                dex: quoteResponse.route?.[0]?.market?.name || "Jupiter Aggregator",
            };
        }
    }
    catch (error) {
        console.error("❌ Swap execution failed via Jupiter:", error.message);
        return { success: false, outAmount: 0 };
    }
}
async function executeSwapBuy(inputMint, outputMint, amount) {
    console.log(`🛒 Buying via Jupiter ${amount} of ${outputMint} using ${inputMint}`);
    return executeSwap(inputMint, outputMint, amount);
}
async function executeSwapSell(inputMint, outputMint, percentageToSell) {
    console.log(`🔄 Selling via Jupiter ${percentageToSell}% of ${inputMint} → ${outputMint}`);
    const tokenBalance = await getTokenBalance(inputMint, new Connection(config.HELIUS_RPC_URL, { commitment: "processed" }));
    if (tokenBalance <= 0) {
        console.error(`❌ No balance found for ${inputMint} via Jupiter, unable to sell.`);
        return { success: false, outAmount: 0 }; // Ensure outAmount is included
    }
    const sellAmount = percentageToSell === 100
        ? tokenBalance
        : Math.floor((tokenBalance * percentageToSell) / 100);
    console.log(`📊 Before Sell via Jupiter: ${inputMint} | Detected Balance: ${tokenBalance}, Selling: ${sellAmount} (${percentageToSell}%)`);
    if (sellAmount === 0 && percentageToSell > 0) {
        console.warn(`⚠️ Sell amount is 0 for ${percentageToSell}% via Jupiter—skipping.`);
        return { success: false, outAmount: 0 }; // Ensure outAmount is included
    }
    console.log(`💰 Selling via Jupiter ${sellAmount} tokens of ${inputMint}`);
    return executeSwap(inputMint, outputMint, sellAmount);
}
export { executeSwapBuy, executeSwapSell };
