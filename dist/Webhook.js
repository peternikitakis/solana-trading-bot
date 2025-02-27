import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { startTracker } from "./tracker.js"; // Import to potentially trigger tracking
import { sendWalletNotification } from "./notify.js"; // Import for notifications
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json()); // Parse JSON requests
/**
 * Handles incoming webhook requests from Helius or other services.
 */
app.post("/webhook", async (req, res) => {
    try {
        console.log("🔔 Webhook Received!");
        console.log(JSON.stringify(req.body, null, 2));
        // Destructure and validate the payload
        const payload = req.body;
        if (!payload.transactions || !Array.isArray(payload.transactions)) {
            console.log("⚠️ No transactions found in webhook payload.");
            res.status(400).json({ error: "No transactions found." });
            return; // Explicit return to avoid further execution
        }
        // Process each transaction
        for (const tx of payload.transactions) {
            console.log(`📌 Transaction Detected: Signature: ${tx.signature}`);
            // Example: Extract wallet and token/mint from transaction (customize based on Helius payload)
            const walletAddress = "9GeqmJ54mTWdcbvNvnosexMyJEj6z2mMgq4jDzWCmXL2"; // Replace with actual wallet from tx
            const token = "exampleTokenMint"; // Replace with actual token/mint from tx
            const amount = 0; // Replace with actual amount from tx, if available
            // Trigger bot actions based on transaction type (simplified example)
            if (payload.type === "BUY" || payload.type === "TRANSFER_IN") {
                // Simulate a buy or increase alert
                console.log(`DEBUG: Processing BUY/INCREASE for wallet ${walletAddress}, token ${token}`);
                sendWalletNotification("BUY", walletAddress, token, amount, // Use actual amount if available
                undefined, // tradeLamports not available here, but could be calculated
                "Jupiter Aggregator" // Assume DEX for tracked wallet buys
                );
            }
            else if (payload.type === "SELL" || payload.type === "TRANSFER_OUT") {
                // Simulate a sell or decrease alert
                console.log(`DEBUG: Processing SELL/DECREASE for wallet ${walletAddress}, token ${token}`);
                sendWalletNotification("SELL", walletAddress, token, { amountSold: amount, updatedBalance: 0 }, // Use actual values if available
                undefined, "Jupiter Aggregator");
            }
            // Optionally trigger tracker to check balances
            startTracker(); // This might be redundant; use selectively based on need
        }
        res.status(200).json({ success: true, message: "✅ Webhook received!" });
    }
    catch (error) {
        console.error("❌ Error processing webhook:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// Start the Webhook Server
app.listen(PORT, () => {
    console.log(`🚀 Webhook server running on http://localhost:${PORT}/webhook`);
});
// Optional: Handle uncaught exceptions for robustness
process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});
