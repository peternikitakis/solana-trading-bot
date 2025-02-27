import dotenv from "dotenv";
dotenv.config(); // Load environment variables from .env

import express from "express"; // Express framework for APIs
import cors from "cors"; // Enable CORS for frontend communication
import bodyParser from "body-parser"; // Parse JSON requests
import pkg from "pg"; // PostgreSQL client for Node.js
const { Pool } = pkg;

const app = express();
const port = process.env.PORT || 5001;

// 📌 Middleware
app.use(cors()); // Allows API to be accessed by frontend
app.use(bodyParser.json()); // Automatically parses JSON requests

// 📌 PostgreSQL Database Connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT || 5432,
});

// Test Database Connection
pool.connect((err) => {
  if (err) {
    console.error("Database connection error", err.stack);
  } else {
    console.log("✅ Connected to PostgreSQL");
  }
});

// 📌 API Routes

// 1️⃣ GET /trades → Retrieve all trade records
app.get("/trades", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM trades ORDER BY timestamp DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// 2️⃣ POST /trades → Add a new trade
app.post("/trades", async (req, res) => {
  const { wallet_id, profit, loss, duration, hold_time } = req.body;

  try {
    const query =
      "INSERT INTO trades (wallet_id, profit, loss, duration, hold_time) VALUES ($1, $2, $3, $4, $5) RETURNING *";
    const values = [wallet_id, profit, loss, duration, hold_time];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// 📌 Start Server
app.listen(port, () => {
  console.log(`✅ API is running on http://localhost:${port}`);
});
