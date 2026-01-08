import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from 'url';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

console.log("✅ Backend started");
console.log("📱 Telegram configured:", !!(BOT_TOKEN && CHAT_ID));

// Configure multer for file uploads
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
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

// In-memory store for messages
const messages = new Map(); // userId → [{ from, type, text, media, caption, ts }]

// Helper function to add messages
function addMessage(userId, from, type, content, media = null, caption = "") {
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

// Text-only endpoint (no Telegram)
app.post("/send", async (req, res) => {
  console.log("📨 /send called:", req.body?.userId);
  
  const { userId, text } = req.body || {};

  if (!userId || !text || typeof text !== 'string') {
    return res.status(400).json({ error: "Invalid payload. Need {userId, text}" });
  }

  try {
    // Store user message
    const message = addMessage(userId, "user", "text", text);
    
    console.log("✅ Message stored locally");
    return res.json({ 
      ok: true, 
      message: "Message stored successfully",
      messageId: message.ts
    });
    
  } catch (err) {
    console.error("❌ Error storing message:", err);
    return res.status(500).json({ error: "Failed to store message" });
  }
});

// Photo upload endpoint
app.post("/send-photo", upload.single('photo'), async (req, res) => {
  console.log("📸 /send-photo called:", req.body?.userId);
  
  const { userId, caption } = req.body || {};
  const file = req.file;

  if (!userId || !file) {
    if (file) {
      fs.unlinkSync(file.path);
    }
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    // Store photo message
    const message = addMessage(userId, "user", "photo", "Photo", file.filename, caption || "");
    
    console.log("✅ Photo stored:", file.filename);
    return res.json({ 
      ok: true, 
      message: "Photo stored successfully",
      messageId: message.ts,
      fileName: file.originalname,
      fileSize: file.size,
      mediaUrl: `/uploads/${file.filename}`
    });
    
  } catch (err) {
    console.error("❌ Photo upload error:", err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: "Failed to process photo" });
  }
});

// Document upload endpoint
app.post("/send-document", upload.single('document'), async (req, res) => {
  console.log("📎 /send-document called:", req.body?.userId);
  
  const { userId, caption } = req.body || {};
  const file = req.file;

  if (!userId || !file) {
    if (file) {
      fs.unlinkSync(file.path);
    }
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    // Store document message
    const message = addMessage(userId, "user", "document", file.originalname, file.filename, caption || "");
    
    console.log("✅ Document stored:", file.filename);
    return res.json({ 
      ok: true, 
      message: "Document stored successfully",
      messageId: message.ts,
      fileName: file.originalname,
      fileSize: file.size,
      mediaUrl: `/uploads/${file.filename}`
    });
    
  } catch (err) {
    console.error("❌ Document upload error:", err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: "Failed to process document" });
  }
});

// Get messages for a user
app.get("/messages/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(`📥 Fetching messages for ${userId}`);
  
  const data = messages.get(userId) || [];
  console.log(`📊 Returning ${data.length} messages`);
  
  // Convert file paths to URLs
  const formattedData = data.map(msg => {
    if (msg.media && msg.type !== 'text') {
      return {
        ...msg,
        media: `/uploads/${msg.media}`
      };
    }
    return msg;
  });
  
  return res.json(formattedData);
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get("/health", (req, res) => {
  const stats = {
    ok: true,
    ts: Date.now(),
    totalUsers: messages.size,
    totalMessages: Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0),
    uploadsDir: fs.existsSync(path.join(__dirname, 'uploads'))
  };
  
  // List all users
  const allUsers = Array.from(messages.keys());
  if (allUsers.length > 0) {
    stats.users = allUsers.slice(0, 5); // Show first 5 users
  }
  
  res.json(stats);
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Expert Chat Backend",
    version: "1.0.0",
    endpoints: [
      "POST /send - Send text message",
      "POST /send-photo - Upload photo",
      "POST /send-document - Upload document",
      "GET /messages/:userId - Get user messages",
      "GET /health - Health check",
      "GET /uploads/:filename - Get uploaded file"
    ],
    status: "running"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
  console.log(`📡 Production URL: https://cyberxkiit-backend-bot.onrender.com`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
});