import dotenv from "dotenv";
import { startTracker } from "./tracker.js";
import { Connection } from "@solana/web3.js";
import { config } from "./config.js"; // Import config for Helius RPC URLs

console.log(`🌟 Bot Initializing | Solana Trading Bot`);
dotenv.config();
console.log(
  `🔧 Env Loaded      | Status: ${
    !!process.env.HELIUS_API_KEY ? "Active" : "Inactive"
  }`
);

const { HELIUS_API_KEY, WALLET_TO_TRACK } = process.env;

console.log(
  `🔑 API Key Check   | ${HELIUS_API_KEY ? "✅ Loaded" : "❌ Missing"}`
);
console.log(
  `👛 Wallet Check    | ${
    WALLET_TO_TRACK ? `✅ ${WALLET_TO_TRACK}` : "❌ Missing"
  }`
);

if (!HELIUS_API_KEY || !WALLET_TO_TRACK) {
  console.error(
    `❌ Config Error    | Missing required environment variables! Check .env`
  );
  process.exit(1);
}

console.log(`🚀 Bot Launching   | Tracking Wallet: ${WALLET_TO_TRACK}`);

// Initialize connection globally for tracker.ts (since it uses a global connection)
const connection = new Connection(config.HELIUS_RPC_URL, {
  commitment: "processed",
});

try {
  startTracker(); // No parameter needed, as tracker.ts uses global connection
} catch (error) {
  if (error instanceof Error) {
    console.error(`❌ Launch Failed    | Error: ${error.message}`);
  } else {
    console.error(`❌ Launch Failed    | Unknown Error: ${error}`);
  }
  process.exit(1);
}