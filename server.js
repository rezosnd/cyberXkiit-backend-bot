import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "128kb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ Telegram ENV variables missing");
}

const messages = new Map(); // userId → [{ from, text, ts }]

function addMessage(userId, from, text) {
  const arr = messages.get(userId) || [];
  arr.push({ from, text, ts: Date.now() });
  messages.set(userId, arr);
}

async function sendToTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  return axios.post(
    url,
    { chat_id: CHAT_ID, text },
    { timeout: 10000 }
  );
}

/* =========================
   APP → TELEGRAM
========================= */
app.post("/send", async (req, res) => {
  const { userId, text } = req.body || {};

  if (!userId || !text) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  addMessage(userId, "user", text);

  const formatted = `📩 USER ${userId}\n${text}`;
  console.log("➡️ Forwarding to Telegram:", formatted);

  try {
    await sendToTelegram(formatted);
    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ Telegram send failed:", err?.response?.data || err.message);
    return res.status(502).json({ error: "Telegram forward failed" });
  }
});

/* =========================
   TELEGRAM → APP
========================= */
app.post("/telegram-webhook", (req, res) => {
  console.log("🔔 Telegram webhook hit:", JSON.stringify(req.body));

  const msg =
    req.body?.message ||
    req.body?.edited_message ||
    null;

  if (!msg || typeof msg.text !== "string") {
    return res.sendStatus(200);
  }

  const text = msg.text.trim();
  console.log("📨 Telegram text:", text);

  // MATCH USER <id>: <message> ANYWHERE
  const match = text.match(/USER\s+([a-zA-Z0-9_]+)\s*:\s*([\s\S]+)/);

  if (!match) {
    console.log("⚠️ No USER pattern found");
    return res.sendStatus(200);
  }

  const userId = match[1];
  const replyText = match[2].trim();

  if (!replyText) {
    console.log("⚠️ Empty reply text");
    return res.sendStatus(200);
  }

  addMessage(userId, "expert", replyText);
  console.log(`✅ Stored expert reply for ${userId}`);

  return res.sendStatus(200);
});

/* =========================
   APP → FETCH MESSAGES
========================= */
app.get("/messages/:userId", (req, res) => {
  const data = messages.get(req.params.userId) || [];
  return res.json(data);
});

/* =========================
   HEALTH
========================= */
app.get("/health", (_, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

