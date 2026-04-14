/**
 * VictoryTat2 — Backend API Server
 * Handles secure image generation via OpenAI
 *
 * To switch models, change IMAGE_MODEL below:
 *   "gpt-image-1"       ← full quality (default)
 *   "gpt-image-1-mini"  ← cost-saving option
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generateTattooImage } from "./routes/generateImage.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(
  cors({
    // In production: replace * with your actual frontend domain
    // e.g. "https://victorytat2.com"
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["POST", "GET"],
  })
);

// ── Routes ────────────────────────────────────────────────────
app.post("/api/generate-image", generateTattooImage);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✦ VictoryTat2 API running on http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠  WARNING: OPENAI_API_KEY is not set in environment!");
  }
});
