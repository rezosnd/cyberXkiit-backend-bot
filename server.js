import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express from 'express';

/*
  Production-ready Express backend for "Chat with Expert" feature.

  Endpoints:
  - POST /send
      Body: { userId: string, text: string }
      Stores message and forwards to Telegram bot in format: "USER <userId>\n<message>"

  - POST /telegram-webhook
      Telegram webhook receiver.
      Expected reply format from expert: "USER <userId>: <reply text>"
      Also accepts "USER <userId>\n<reply text>".
      Stores reply under the extracted userId.

  - GET /messages/:userId
      Returns chat history: [{ from: 'user'|'expert', text: string, ts: number }]

  NOTE: After deploying, set Telegram webhook to:
    https://YOUR_DOMAIN/telegram-webhook
  using:
    https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://YOUR_DOMAIN/telegram-webhook

  Secrets are read from environment variables (see .env.example).
*/

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN) {
  console.warn('Warning: TELEGRAM_BOT_TOKEN not set in environment');
}
if (!CHAT_ID) {
  console.warn('Warning: TELEGRAM_CHAT_ID not set in environment');
}

// In-memory store. Consider replacing with a persistent store for production.
const messages = new Map(); // userId -> [{ from, text, ts }]

function addMessage(userId, from, text) {
  const entry = messages.get(userId) || [];
  entry.push({ from, text, ts: Date.now() });
  messages.set(userId, entry);
}

async function forwardToTelegram(formattedText) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('Telegram credentials missing');
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: CHAT_ID, text: formattedText };
  const resp = await axios.post(url, payload, { timeout: 10000 });
  return resp.data;
}

// POST /send  -> from app to Telegram
app.post('/send', async (req, res) => {
  try {
    const { userId, text } = req.body || {};
    if (!userId || typeof userId !== 'string' || !text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid payload. Expected { userId: string, text: string }' });
    }

    addMessage(userId, 'user', text);
    const formatted = `📩 USER ${userId}\n\n${text}`;
    console.log('Forwarding message to Telegram for userId=', userId);

    try {
      await forwardToTelegram(formatted);
    } catch (err) {
      console.error('Failed to forward to Telegram', err?.response?.data || err.message || err);
      // Do not erase message; inform caller
      return res.status(502).json({ error: 'Failed to forward to Telegram' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('POST /send error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /telegram-webhook  -> Telegram will POST updates here
app.post('/telegram-webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const msg = body.message || body.edited_message || null;
    if (!msg) {
      // Not a message update we care about
      return res.sendStatus(200);
    }

    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    if (!text) return res.sendStatus(200);

    // Accept formats:
    // 1) USER <userId>: <reply text>
    // 2) USER <userId>\n<reply text>
    let match = text.match(/^USER\s+(\S+):\s*([\s\S]*)/i);
    if (!match) {
      match = text.match(/^USER\s+(\S+)[\s\n]+([\s\S]*)/i);
    }

    if (!match) {
      console.log('telegram-webhook: message ignored (no USER prefix)', text.slice(0, 200));
      return res.sendStatus(200);
    }

    const userId = match[1];
    const replyText = (match[2] || '').trim();
    if (!userId || !replyText) {
      console.log('telegram-webhook: malformed USER message', text.slice(0, 200));
      return res.sendStatus(200);
    }

    addMessage(userId, 'expert', replyText);
    console.log(`Received Telegram reply for user=${userId}`);

    return res.sendStatus(200);
  } catch (err) {
    console.error('Error in /telegram-webhook', err);
    return res.sendStatus(200);
  }
});

// GET /messages/:userId -> return full history
app.get('/messages/:userId', (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId param' });
    const data = messages.get(userId) || [];
    return res.json(data);
  } catch (err) {
    console.error('GET /messages/:userId error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

const server = app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

function graceful() {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
}
process.on('SIGINT', graceful);
process.on('SIGTERM', graceful);
