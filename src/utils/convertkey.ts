import bs58 from "bs58";

const rawPrivateKey = "475ynzY4Mvs1fzmJvfY81NZptJAhKx6qfsv7XP6QWsiK8DrxUbN452T5BhwkcEWvwYLLH9UfyW3qg9MgiaiU3odK"; // Replace with your actual key

try {
  let decodedKey;

  if (rawPrivateKey.startsWith("[")) {
    // If the key is in JSON array format (e.g., `[1,2,3,...]`), parse it directly
    decodedKey = JSON.parse(rawPrivateKey);
  } else {
    // If the key is in Base58 format, decode it
    decodedKey = bs58.decode(rawPrivateKey);
  }

  console.log("✅ Converted Private Key:", JSON.stringify(Array.from(decodedKey)));
} catch (error) {
  console.error("❌ Error decoding private key:", error);
}
