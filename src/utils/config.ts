import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

export const config = {
  HELIUS_RPC_URL: (() => {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      console.error(
        "❌ HELIUS_API_KEY is missing in .env. Using fallback URL without API key."
      );
      return "https://mainnet.helius-rpc.com";
    }
    console.log(`✅ HELIUS_RPC_URL loaded with API key: https://mainnet.helius-rpc.com/?api-key=${apiKey}`);
    return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  })(),
  HELIUS_RPC_WS_URL: (() => {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      console.error(
        "❌ HELIUS_API_KEY is missing in .env. Using fallback WebSocket without API key."
      );
      return "wss://mainnet.helius-rpc.com";
    }
    console.log(`✅ HELIUS_RPC_WS_URL loaded with API key: wss://mainnet.helius-rpc.com/?api-key=${apiKey}`);
    return `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  })(),
  JUPITER_API: "https://api.jup.ag/swap/v1/quote",
  TRADE_AMOUNT_SOL: process.env.TRADE_AMOUNT_SOL || "0.001",
  DISCORD_WEBHOOK_WALLET_TRACKING: process.env.DISCORD_WEBHOOK_WALLET_TRACKING || "",
  DISCORD_WEBHOOK_BOT_TRANSACTION: process.env.DISCORD_WEBHOOK_BOT_TRANSACTION || "",
};