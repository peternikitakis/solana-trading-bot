import dotenv from "dotenv";
import { trackWalletBalances } from "./tracker.js"; 

dotenv.config(); // Load environment variables

const API_KEY = process.env.HELIUS_API_KEY;
const WALLET_TO_TRACK = process.env.WALLET_TO_TRACK;

console.log("🔍 HELIUS_API_KEY:", API_KEY ? "✅ Loaded!" : "❌ Not loaded!");
console.log(
  "🔍 WALLET_TO_TRACK:",
  WALLET_TO_TRACK ? `✅ ${WALLET_TO_TRACK}` : "❌ Not loaded!"
);

if (!API_KEY || !WALLET_TO_TRACK) {
  console.error(
    "❌ Missing required environment variables! Check your .env file."
  );
  process.exit(1);
}

console.log(`🚀 Tracking wallet: ${WALLET_TO_TRACK}`);

// ✅ Start tracking transactions
trackWalletBalances(WALLET_TO_TRACK);
