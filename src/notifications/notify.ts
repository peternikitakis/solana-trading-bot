import axios from "axios";
import { config } from "../config/config.js";
console.log("DEBUG: notify_v3.ts loaded - Unique Marker 2025-03-02-V3");

const DISCORD_WEBHOOK_WALLET_TRACKING = config.DISCORD_WEBHOOK_WALLET_TRACKING || "";
const DISCORD_WEBHOOK_BOT_TRANSACTION = config.DISCORD_WEBHOOK_BOT_TRANSACTION || "";

type NotificationDetails =
  | number
  | { wallet: number, increasePercent: string }
  | { solReturned: number; decreasePercent: string }
  | { solReturned: number; updatedBalance: number };

function isWalletDetails(details: NotificationDetails): details is { wallet: number, increasePercent: string} {
  return typeof details === "object" && details !== null && "wallet" in details && typeof details.wallet === "number";
}

function isSolReturnedWithDecrease(details: NotificationDetails): details is { solReturned: number; decreasePercent: string } {
  return typeof details === "object" && details !== null && "solReturned" in details && "decreasePercent" in details && typeof details.decreasePercent === "string";
}

function isSolReturnedWithBalance(details: NotificationDetails): details is { solReturned: number; updatedBalance: number } {
  return typeof details === "object" && details !== null && "solReturned" in details && "updatedBalance" in details && typeof details.updatedBalance === "number";
}

// Updated function signature to include latency parameter
export async function sendWalletNotification(
  type: "BUY" | "SELL" | "INCREASE ALERT" | "DECREASE ALERT",
  walletAddress: string,
  token: string,
  details: NotificationDetails,
  latency: number,
  tradeLamports?: number,
  signature?: string, // Now used in the function
  dex?: string,
) {
  if (!DISCORD_WEBHOOK_WALLET_TRACKING) {
    console.warn("⚠️ No Discord Webhook URL configured for wallet tracking. Skipping notification.");
    return;
  }
  console.log("DEBUG: notify_v3.ts version 2025-03-01 active - Wallet");

  const tradeValueSol = tradeLamports ? (tradeLamports / 1_000_000_000).toFixed(6) : "0.000000";
  let amount: string | number = "0";
  let fields: { name: string; value: string; inline: boolean }[] = [];

  if (type === "BUY" && typeof details === "number") {
    amount = details.toFixed(6);
    fields = [
      { name: "💳 Tracked Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
      { name: "🪙 Token Address", value: `\`\`\`${token}\`\`\``, inline: false },
      { name: "💰 Tokens Bought", value: amount as string, inline: false },
      { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
      {
        name: "🔗 Transaction",
        value: signature ? `[View on Solscan](https://solscan.io/tx/${signature})` : "N/A",
        inline: false,
      },
    ];
  } else if (type === "INCREASE ALERT" && isWalletDetails(details)) {
    amount = details.wallet.toFixed(6);
    const increasePercent = "increasePercent" in details ? (details as { wallet: number, increasePercent?: string }).increasePercent || "0.00" : "0.00"; 
    fields = [
      { name: "💳 Wallet Address", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
      { name: "🪙 Token Address", value: `\`\`\`${token}\`\`\``, inline: false },
      { name: "💰 New Token Balance", value: `${amount} (${increasePercent}%)`, inline: false },
      { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
      {
        name: "🔗 Transaction",
        value: signature ? `[View on Solscan](https://solscan.io/tx/${signature})` : "N/A",
        inline: false,
      },
    ];
  } else if (type === "DECREASE ALERT" && isSolReturnedWithDecrease(details)) {
    amount = details.solReturned.toFixed(6);
    fields = [
      { name: "💳 Tracked Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
      { name: "🪙 Token Address", value: `\`\`\`${token}\`\`\``, inline: false },
      { name: "💰 SOL Returned", value: amount as string, inline: false },
      {
        name: "📉 Decrease %",
        value: `${details.decreasePercent}%`,
        inline: false,
      },
      { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
      {
        name: "🔗 Transaction",
        value: signature ? `[View on Solscan](https://solscan.io/tx/${signature})` : "N/A",
        inline: false,
      },
    ];
  } else if (type === "SELL" && isSolReturnedWithBalance(details)) {
    amount = details.solReturned.toFixed(6);
    fields = [
      { name: "💳 Tracked Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
      { name: "🪙 Token Sold", value: `\`\`\`${token}\`\`\``, inline: false },
      { name: "💰 SOL Returned", value: amount as string, inline: false },
      { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
      {
        name: "🔗 Transaction",
        value: signature ? `[View on Solscan](https://solscan.io/tx/${signature})` : "N/A",
        inline: false,
      },
    ];
  } else {
    fields = [
      { name: "💳 Tracked Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
      { name: "🪙 Token Address", value: `\`\`\`${token}\`\`\``, inline: false },
      { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
    ];
  }

  let color: number;
  let title: string;
  switch (type) {
    case "BUY":
      color = 65280; // Green
      title = "🟢 Trade Completed (Buy)";
      break;
    case "SELL":
      color = 16711680; // Red
      title = "🔴 Trade Completed (Tracked Wallet Sell)";
      break;
    case "INCREASE ALERT":
      color = 3447003; // Blue
      title = "📈 Trade Completed (Increase Alert)";
      break;
    case "DECREASE ALERT":
      color = 16753920; // Orange
      title = "🟡 Decrease Alert (Tracked Wallet Partial Sell)";
      break;
    default:
      color = 0; // Gray
      title = "⚠️ Unknown Trade Type";
  }

  const embed = {
    username: "Solana Trade Bot",
    avatar_url: "https://cryptologos.cc/logos/solana-sol-logo.png?v=023",
    embeds: [
      {
        title: title,
        description: "A trade was executed!",
        color: color,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: { 
          text: `Executed via Jupiter API • ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' })}` 
        }, // Removed latency, kept timestamp
        thumbnail: { url: "https://cryptologos.cc/logos/solana-sol-logo.png?v=023" },
      },
    ],
  };

  try {
    await axios.post(DISCORD_WEBHOOK_WALLET_TRACKING, embed, {
      headers: { "Content-Type": "application/json" },
    });
    console.log(`✅ Wallet notification sent for ${type} on ${token}`);
  } catch (error) {
    console.error(
      `❌ Failed to send wallet notification for ${type} on ${token}: ${(error as Error).message}`
    );
  }
}

// Updated function signature to include latency parameter
export async function sendBotNotification(
  type: "BUY" | "SELL" | "DECREASE ALERT",
  walletAddress: string,
  token: string,
  details: NotificationDetails,
  latency: number, 
  tradeLamports?: number,
  signature?: string,
  dex?: string,
) {
  if (!DISCORD_WEBHOOK_BOT_TRANSACTION) {
    console.warn("⚠️ No Discord Webhook URL configured for bot transactions. Skipping notification.");
    return;
  }
  console.log("DEBUG: notify_v3.ts version 2025-03-01 active - Bot");

  const tradeValueSol = tradeLamports ? (tradeLamports / 1_000_000_000).toFixed(6) : "0.000000";
  let amount: string | number = "0";
  let fields: { name: string; value: string; inline: boolean }[] = [];

  switch (type) {
    case "BUY":
      if (typeof details === "number") {
        amount = details.toFixed(6);
      }
      break;
    case "DECREASE ALERT":
      if (isSolReturnedWithDecrease(details)) {
        amount = details.solReturned.toFixed(6);
      }
      break;
    case "SELL":
      if (isSolReturnedWithBalance(details)) {
        amount = details.solReturned.toFixed(6);
      }
      break;
    default:
      amount = "0";
  }

  let color: number;
  let title: string;
  switch (type) {
    case "BUY":
      color = 65280;
      title = "🟢 Trade Completed (Bot Buy)";
      fields = [
        { name: "💳 Bot Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
        { name: "🪙 Token Address", value: `\`\`\`${token}\`\`\``, inline: false },
        { name: "💵 Trade Value", value: `${tradeValueSol} SOL`, inline: false },
        { name: "💰 Tokens Bought", value: amount as string, inline: false },
        { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
        {
          name: "🔗 Transaction",
          value: signature ? `[View on Solscan](https://solscan.io/tx/${signature})` : "N/A",
          inline: false,
        },
      ];
      break;
    case "SELL":
      color = 16711680;
      title = "🔴 Trade Completed (Bot Sell)";
      fields = [
        { name: "💳 Bot Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
        { name: "🪙 Token Sold", value: `\`\`\`${token}\`\`\``, inline: false },
        { name: "💰 SOL Returned", value: amount as string, inline: false },
        { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
        {
          name: "🔗 Transaction",
          value: signature ? `[View on Solscan](https://solscan.io/tx/${signature})` : "N/A",
          inline: false,
        },
      ];
      break;
    case "DECREASE ALERT":
      color = 16753920;
      title = "🟡 Decrease Alert (Bot Partial Sell)";
      fields = [
        { name: "💳 Bot Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
        { name: "🪙 Token Address", value: `\`\`\`${token}\`\`\``, inline: false },
        { name: "💰 SOL Returned", value: amount as string, inline: false },
        {
          name: "📉 Decrease %",
          value: isSolReturnedWithDecrease(details) ? `${details.decreasePercent}%` : "N/A",
          inline: false,
        },
        {
          name: "🔗 Transaction",
          value: signature ? `[View on Solscan](https://solscan.io/tx/${signature})` : "N/A",
          inline: false,
        },
      ];
      break;
    default:
      color = 0;
      title = "⚠️ Unknown Trade Type";
      fields = [
        { name: "💳 Bot Wallet", value: `\`\`\`${walletAddress}\`\`\``, inline: false },
        { name: "🪙 Token Address", value: `\`\`\`${token}\`\`\``, inline: false },
        { name: "🔄 DEX Used", value: dex || "Jupiter Aggregator", inline: false },
      ];
  }

  const embed = {
    username: "Solana Trade Bot",
    avatar_url: "https://cryptologos.cc/logos/solana-sol-logo.png?v=023",
    embeds: [
      {
        title: title,
        description: "A bot trade was executed!",
        color: color,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: { 
          text: `\u00A0\u00A0\u00A0\u00A0Latency: ${latency}ms • Executed via Jupiter API • ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' })}\u00A0\u00A0\u00A0\u00A0` 
        }, // Added 4 non-breaking spaces at start and end for moderate padding
        thumbnail: { url: "https://cryptologos.cc/logos/solana-sol-logo.png?v=023" },
      },
    ],
  };

  try {
    await axios.post(DISCORD_WEBHOOK_BOT_TRANSACTION, embed, {
      headers: { "Content-Type": "application/json" },
    });
    console.log(`✅ Bot notification sent for ${type} on ${token}`);
  } catch (error) {
    console.error(
      `❌ Failed to send bot notification for ${type} on ${token}: ${(error as Error).message}`
    );
  }
}