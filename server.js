import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from 'url';

// ES modules fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "your_bot_token_here";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "your_chat_id_here";

console.log("✅ Backend started");
console.log("🤖 Telegram:", BOT_TOKEN ? "✅ Configured" : "❌ Not configured");

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Store messages
const messages = new Map();

// Add initial welcome messages for new users
function initializeUser(userId) {
  if (!messages.has(userId)) {
    const welcomeMessages = [
      { 
        from: "expert", 
        type: "text", 
        text: "🇮🇳 We are here to make India Fraud Free.", 
        ts: Date.now() - 2000
      },
      { 
        from: "expert", 
        type: "text", 
        text: "Our expert will connect you in less than 1 min.", 
        ts: Date.now() - 1000
      }
    ];
    messages.set(userId, welcomeMessages);
    console.log(`👋 Welcome messages added for ${userId}`);
  }
}

function addMessage(userId, from, type, content, media = null, caption = "") {
  initializeUser(userId);
  const arr = messages.get(userId) || [];
  const message = { 
    from, 
    type, 
    text: content, 
    media,
    caption,
    ts: Date.now() 
  };
  arr.push(message);
  messages.set(userId, arr);
  console.log(`💾 Stored ${type} message for ${userId}`);
  return message;
}

// Send to Telegram function
async function sendToTelegram(text, filePath = null, caption = "") {
  if (!BOT_TOKEN || !CHAT_ID || BOT_TOKEN === "your_bot_token_here") {
    console.log("⚠️ Telegram credentials not configured");
    return { success: false, error: "Telegram credentials not set" };
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/`;
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    
    if (caption) form.append('caption', caption);

    let method = 'sendMessage';
    
    if (filePath) {
      if (filePath.match(/\.(jpg|jpeg|png|gif)$/i)) {
        method = 'sendPhoto';
        form.append('photo', fs.createReadStream(filePath));
      } else if (filePath.match(/\.(mp3|wav|m4a|ogg)$/i)) {
        method = 'sendVoice';
        form.append('voice', fs.createReadStream(filePath));
      } else {
        method = 'sendDocument';
        form.append('document', fs.createReadStream(filePath));
      }
    } else {
      form.append('text', text);
    }

    const response = await axios.post(`${url}${method}`, form, {
      headers: { ...form.getHeaders() },
      timeout: 30000
    });
    
    console.log(`✅ Telegram ${method} successful`);
    return { success: true, data: response.data };
    
  } catch (error) {
    console.error("❌ Telegram error:", error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
}

// Text endpoint
app.post("/send", async (req, res) => {
  console.log("📨 /send called:", req.body?.userId);
  
  const { userId, text } = req.body || {};

  if (!userId || !text || typeof text !== 'string') {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    // Store message
    const message = addMessage(userId, "user", "text", text);
    
    // Send to Telegram
    const telegramText = `📩 USER ${userId}\n\n${text}`;
    const telegramResult = await sendToTelegram(telegramText);
    
    if (telegramResult.success) {
      console.log("✅ Telegram: Text sent");
      return res.json({ 
        ok: true, 
        message: "Message sent to Telegram",
        messageId: message.ts,
        telegram: true
      });
    } else {
      console.log("⚠️ Telegram failed, but message stored");
      return res.json({ 
        ok: true, 
        message: "Message stored locally (Telegram not configured)",
        messageId: message.ts,
        telegram: false,
        telegramError: telegramResult.error
      });
    }
    
  } catch (err) {
    console.error("❌ Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Photo endpoint
app.post("/send-photo", upload.single('photo'), async (req, res) => {
  console.log("📸 /send-photo called:", req.body?.userId);
  
  const { userId, caption } = req.body || {};
  const file = req.file;

  if (!userId || !file) {
    if (file) fs.unlinkSync(file.path);
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    // Store message
    const message = addMessage(userId, "user", "photo", "Photo", file.filename, caption || "");
    
    // Send to Telegram
    const telegramCaption = caption ? `${caption}\n\n👤 User ID: ${userId}` : `👤 User ID: ${userId}`;
    const telegramResult = await sendToTelegram("", file.path, telegramCaption);
    
    // Clean up file
    fs.unlinkSync(file.path);
    
    if (telegramResult.success) {
      console.log("✅ Telegram: Photo sent");
      return res.json({ 
        ok: true, 
        message: "Photo sent to Telegram",
        messageId: message.ts,
        fileName: file.originalname,
        fileSize: file.size,
        mediaUrl: `/uploads/${file.filename}`,
        telegram: true
      });
    } else {
      console.log("⚠️ Telegram failed, but photo stored");
      return res.json({ 
        ok: true, 
        message: "Photo stored locally (Telegram not configured)",
        messageId: message.ts,
        fileName: file.originalname,
        fileSize: file.size,
        mediaUrl: `/uploads/${file.filename}`,
        telegram: false,
        telegramError: telegramResult.error
      });
    }
    
  } catch (err) {
    console.error("❌ Photo error:", err);
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ error: "Failed to process photo" });
  }
});

// Document endpoint
app.post("/send-document", upload.single('document'), async (req, res) => {
  console.log("📎 /send-document called:", req.body?.userId);
  
  const { userId, caption } = req.body || {};
  const file = req.file;

  if (!userId || !file) {
    if (file) fs.unlinkSync(file.path);
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    // Store message
    const message = addMessage(userId, "user", "document", file.originalname, file.filename, caption || "");
    
    // Send to Telegram
    const telegramCaption = caption ? `${caption}\n\n👤 User ID: ${userId}` : `👤 User ID: ${userId}`;
    const telegramResult = await sendToTelegram("", file.path, telegramCaption);
    
    // Clean up file
    fs.unlinkSync(file.path);
    
    if (telegramResult.success) {
      console.log("✅ Telegram: Document sent");
      return res.json({ 
        ok: true, 
        message: "Document sent to Telegram",
        messageId: message.ts,
        fileName: file.originalname,
        fileSize: file.size,
        mediaUrl: `/uploads/${file.filename}`,
        telegram: true
      });
    } else {
      console.log("⚠️ Telegram failed, but document stored");
      return res.json({ 
        ok: true, 
        message: "Document stored locally (Telegram not configured)",
        messageId: message.ts,
        fileName: file.originalname,
        fileSize: file.size,
        mediaUrl: `/uploads/${file.filename}`,
        telegram: false,
        telegramError: telegramResult.error
      });
    }
    
  } catch (err) {
    console.error("❌ Document error:", err);
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ error: "Failed to process document" });
  }
});

// Telegram Webhook for expert replies
app.post("/telegram-webhook", (req, res) => {
  console.log("🔔 Telegram webhook received");
  
  try {
    const msg = req.body?.message || req.body?.edited_message;
    
    if (!msg || !msg.text) {
      return res.sendStatus(200);
    }
    
    const text = msg.text.trim();
    console.log("📨 Telegram message:", text.substring(0, 100));
    
    // Parse USER ID from message
    let userId = null;
    
    // Format 1: "USER user_id: message"
    let match = text.match(/USER\s+([a-zA-Z0-9_]+)\s*:\s*([\s\S]+)/i);
    if (!match) {
      // Format 2: "USER user_id\nmessage"
      match = text.match(/USER\s+([a-zA-Z0-9_]+)[\s\n]+([\s\S]+)/i);
    }
    
    if (match) {
      userId = match[1];
      const replyText = match[2].trim();
      
      if (userId && replyText) {
        addMessage(userId, "expert", "text", replyText);
        console.log(`✅ Expert reply stored for ${userId}`);
      }
    }
    
    return res.sendStatus(200);
    
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.sendStatus(200);
  }
});

// Get messages - FIXED: Always returns messages
app.get("/messages/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(`📥 Fetching messages for ${userId}`);
  
  // Initialize user if doesn't exist
  initializeUser(userId);
  
  const data = messages.get(userId) || [];
  console.log(`📊 Returning ${data.length} messages`);
  
  // Convert file paths to URLs
  const formattedData = data.map(msg => {
    if (msg.media && msg.type !== 'text') {
      return { ...msg, media: `/uploads/${msg.media}` };
    }
    return msg;
  });
  
  return res.json(formattedData);
});

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    telegramConfigured: !!(BOT_TOKEN && CHAT_ID && BOT_TOKEN !== "your_bot_token_here"),
    totalUsers: messages.size,
    totalMessages: Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0)
  });
});

// Set webhook endpoint
app.get("/set-webhook", async (req, res) => {
  if (!BOT_TOKEN || BOT_TOKEN === "your_bot_token_here") {
    return res.json({ error: "BOT_TOKEN not set" });
  }
  
  try {
    const webhookUrl = `https://cyberxkiit-backend-bot.onrender.com/telegram-webhook`;
    const setWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    
    const response = await axios.get(setWebhookUrl);
    res.json(response.data);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "CyberX × KIIT Expert Chat Backend",
    status: "✅ Online",
    endpoints: {
      "POST /send": "Send text message",
      "POST /send-photo": "Upload photo",
      "POST /send-document": "Upload document",
      "GET /messages/:userId": "Get user messages",
      "GET /health": "Health check",
      "GET /set-webhook": "Set Telegram webhook"
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🌐 URL: https://cyberxkiit-backend-bot.onrender.com`);
});
