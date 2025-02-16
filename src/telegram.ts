import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(
  type: string,
  walletAddress: string,
  token: string,
  balance: number
) {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Define emoji & styling based on notification type
  const typeEmojis: Record<string, string> = {
    BUY: "🟢 *BUY ALERT*",
    SELL: "🔴 *SELL ALERT*",
    INCREASE: "📈 *Balance Increased*",
    DECREASE: "📉 *Balance Decreased*",
  };

  const emojiType = typeEmojis[type] || "🔔 *Notification*";

  // Construct a beautifully formatted message
  const message = `
${emojiType}
━━━━━━━━━━━━━━━
🏦 *Wallet:* \`${walletAddress}\`
💰 *Token:* \`${token}\`
📊 *New Balance:* \`${balance}\`
━━━━━━━━━━━━━━━
🔔 Sniped by Pete! 
    `;

  try {
    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("❌ Error sending Telegram message:", error);
  }
}
