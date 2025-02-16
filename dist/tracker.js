import WebSocket from "ws";
import dotenv from "dotenv";
/**
 * Tracks Solana wallet transactions in real-time using Helius WebSocket.
 *
 * - Connects to Helius WebSocket with the provided API key.
 * - Listens for new transactions related to a specified wallet.
 * - Logs transaction details when detected.
 */
dotenv.config(); // Load environment variables from .env file
// Get WebSocket URL and wallet address from .env file
const WS_URL = process.env.HELIUS_RPC_WS_URL;
console.log("🔍 HELIUS_RPC_WS_URL:", process.env.HELIUS_RPC_WS_URL); // Debugging
if (!WS_URL) {
    console.error("❌ No WebSocket URL provided! Check your .env file.");
    process.exit(1); // Exit to prevent an invalid connection
}
/**
 * Function to start tracking transactions for a given wallet.
 * @param walletAddress - Solana wallet address to track
 */
export function trackTransactions(walletAddress) {
    // Create a WebSocket connection to Helius
    const ws = new WebSocket(WS_URL);
    /**
     * Event: WebSocket connection is established.
     * Sends a request to start listening for transactions from the wallet.
     */
    ws.on("open", () => {
        console.log("✅ Connected to Helius WebSocket...");
        // Subscribe to transactions related to the specified wallet
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "transactionSubscribe",
            params: [
                { accounts: [walletAddress] }, // Track only this wallet
                { commitment: "finalized" }, // Only track finalized transactions
            ],
        }));
    });
    /**
     * Event: When a new transaction occurs, Helius sends a message.
     * This function parses the message and logs transaction details.
     */
    ws.on("message", (data) => {
        var _a;
        const response = JSON.parse(data.toString()); // Convert WebSocket message to JSON
        const transaction = (_a = response.params) === null || _a === void 0 ? void 0 : _a.result; // Extract transaction details
        if (transaction) {
            console.log("📥 New transaction detected:", transaction.signature);
            console.log("🔍 Full transaction data:", JSON.stringify(transaction, null, 2));
        }
    });
    /**
     * Event: WebSocket connection is closed.
     * This can happen due to network issues or server-side disconnection.
     */
    ws.on("close", () => console.log("❌ WebSocket disconnected."));
    /**
     * Event: WebSocket encounters an error.
     * Logs the error message to the console.
     */
    ws.on("error", (error) => console.error("❌ WebSocket error:", error));
}
