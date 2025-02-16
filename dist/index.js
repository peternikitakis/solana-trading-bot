import dotenv from "dotenv";
import { trackTransactions } from "./tracker.js";
dotenv.config();
console.log("🔍 HELIUS_RPC_WS_URL:", process.env.HELIUS_RPC_WS_URL || "❌ Not loaded!");
console.log("🔍 HELIUS_API_KEY:", process.env.HELIUS_API_KEY || "❌ Not loaded!");
console.log("🔍 WALLET_TO_TRACK:", process.env.WALLET_TO_TRACK || "❌ Not loaded!");
const WS_URL = process.env.HELIUS_RPC_WS_URL;
if (!WS_URL) {
    console.error("❌ WebSocket URL is undefined! Check your .env file.");
    process.exit(1);
}
const WALLET_TO_TRACK = process.env.WALLET_TO_TRACK;
if (!WALLET_TO_TRACK) {
    console.error("❌ No wallet address provided! Check your .env file.");
    process.exit(1);
}
console.log(`🚀 Starting bot to track wallet: ${WALLET_TO_TRACK}`);
trackTransactions(WALLET_TO_TRACK);
