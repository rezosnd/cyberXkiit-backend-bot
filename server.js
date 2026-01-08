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

// Debug log
console.log("✅ Environment check:");
console.log("BOT_TOKEN exists:", !!BOT_TOKEN);
console.log("CHAT_ID exists:", !!CHAT_ID);

const messages = new Map();

function addMessage(userId, from, text) {
  const arr = messages.get(userId) || [];
  arr.push({ from, text, ts: Date.now() });
  messages.set(userId, arr);
  console.log(`💾 Stored ${from} message for ${userId}: ${text.substring(0, 50)}`);
}

async function sendToTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const response = await axios.post(
      url,
      { 
        chat_id: CHAT_ID, 
        text,
        parse_mode: "HTML" 
      },
      { timeout: 10000 }
    );
    console.log(`📤 Telegram response:`, response.data);
    return { success: true, data: response.data };
  } catch (err) {
    console.error("❌ Telegram error:", err.response?.data || err.message);
    // Still return success if it's a minor error
    return { 
      success: false, 
      error: err.response?.data || err.message 
    };
  }
}

/* =========================
   APP → TELEGRAM
========================= */
app.post("/send", async (req, res) => {
  console.log("📨 /send called:", req.body);
  
  const { userId, text } = req.body || {};

  if (!userId || !text) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Store user message immediately
  addMessage(userId, "user", text);

  const formatted = `📩 USER ${userId}\n${text}`;
  console.log("➡️ Forwarding to Telegram:", formatted.substring(0, 100));

  // Send to Telegram but don't fail the request if Telegram fails
  try {
    const telegramResult = await sendToTelegram(formatted);
    
    if (telegramResult.success) {
      console.log("✅ Telegram send successful");
      return res.json({ 
        ok: true, 
        message: "Message sent and forwarded to Telegram",
        telegram: telegramResult.data
      });
    } else {
      console.log("⚠️ Telegram send partially failed, but message stored");
      return res.json({ 
        ok: true, 
        message: "Message stored locally, but Telegram failed",
        warning: "Telegram forward failed",
        telegramError: telegramResult.error
      });
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    // Still return success because message was stored
    return res.json({ 
      ok: true, 
      message: "Message stored locally",
      warning: "Telegram forward failed unexpectedly"
    });
  }
});

/* =========================
   TELEGRAM → APP (WEBHOOK)
========================= */
app.post("/telegram-webhook", (req, res) => {
  console.log("🔔 Telegram webhook received");
  
  try {
    const msg = req.body?.message || req.body?.edited_message || null;

    if (!msg || typeof msg.text !== "string") {
      console.log("📭 No valid message in webhook");
      return res.sendStatus(200);
    }

    const text = msg.text.trim();
    console.log("📨 Telegram text received:", text.substring(0, 200));

    // Try multiple patterns to match expert reply
    let match = text.match(/USER\s+([a-zA-Z0-9_]+)\s*:\s*([\s\S]+)/i);
    if (!match) {
      match = text.match(/USER\s+([a-zA-Z0-9_]+)[\s\n]+([\s\S]+)/i);
    }
    if (!match) {
      match = text.match(/📩\s*USER\s+([a-zA-Z0-9_]+)[\s\n:]+([\s\S]+)/i);
    }

    if (!match) {
      console.log("⚠️ No USER pattern found in:", text.substring(0, 100));
      return res.sendStatus(200);
    }

    const userId = match[1];
    const replyText = match[2].trim();

    if (!replyText) {
      console.log("⚠️ Empty reply text");
      return res.sendStatus(200);
    }

    addMessage(userId, "expert", replyText);
    console.log(`✅ Stored expert reply for ${userId}: ${replyText.substring(0, 50)}`);

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.sendStatus(200); // Always return 200 to Telegram
  }
});

/* =========================
   APP → FETCH MESSAGES
========================= */
app.get("/messages/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(`📥 Fetching messages for ${userId}`);
  
  const data = messages.get(userId) || [];
  console.log(`📊 Returning ${data.length} messages`);
  
  return res.json(data);
});

/* =========================
   HEALTH & DEBUG
========================= */
app.get("/health", (_, res) => {
  const stats = {
    ok: true,
    ts: Date.now(),
    totalUsers: messages.size,
    telegramConfigured: !!(BOT_TOKEN && CHAT_ID),
    sampleUsers: Array.from(messages.keys()).slice(0, 3)
  };
  console.log("🏥 Health check:", stats);
  res.json(stats);
});

// Add a debug endpoint
app.get("/debug", (_, res) => {
  const debugInfo = {
    messages: Array.from(messages.entries()).map(([userId, msgs]) => ({
      userId,
      count: msgs.length,
      lastMessage: msgs[msgs.length - 1]
    })),
    env: {
      hasBotToken: !!BOT_TOKEN,
      hasChatId: !!CHAT_ID,
      port: PORT
    }
  };
  res.json(debugInfo);
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   POST /send`);
  console.log(`   POST /telegram-webhook`);
  console.log(`   GET  /messages/:userId`);
  console.log(`   GET  /health`);
  console.log(`   GET  /debug`);
});
