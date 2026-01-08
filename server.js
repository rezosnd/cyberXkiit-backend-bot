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
// Store last processed update ID for polling
let lastUpdateId = 0;

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
  console.log(`💾 Stored ${type} message for ${userId} from ${from}: ${content.substring(0, 50)}...`);
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
    
    let method = 'sendMessage';
    
    if (filePath) {
      if (filePath.match(/\.(jpg|jpeg|png|gif)$/i)) {
        method = 'sendPhoto';
        form.append('photo', fs.createReadStream(filePath));
        if (caption) form.append('caption', caption);
      } else if (filePath.match(/\.(mp3|wav|m4a|ogg)$/i)) {
        method = 'sendVoice';
        form.append('voice', fs.createReadStream(filePath));
        if (caption) form.append('caption', caption);
      } else {
        method = 'sendDocument';
        form.append('document', fs.createReadStream(filePath));
        if (caption) form.append('caption', caption);
      }
    } else {
      form.append('text', text);
    }

    const response = await axios.post(`${url}${method}`, form, {
      headers: { ...form.getHeaders() },
      timeout: 30000
    });
    
    console.log(`✅ Telegram ${method} successful`);
    return { 
      success: true, 
      data: response.data,
      message_id: response.data.result?.message_id 
    };
    
  } catch (error) {
    console.error("❌ Telegram error:", error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
}

// Function to poll Telegram for updates (expert replies)
async function pollTelegramUpdates() {
  if (!BOT_TOKEN || BOT_TOKEN === "your_bot_token_here") {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`;
    const params = {
      offset: lastUpdateId + 1,
      timeout: 10,
      allowed_updates: ['message']
    };

    const response = await axios.get(url, { params });
    const updates = response.data.result || [];

    for (const update of updates) {
      lastUpdateId = update.update_id;
      const msg = update.message;

      if (msg && msg.text && msg.chat && msg.chat.id.toString() === CHAT_ID.toString()) {
        const text = msg.text.trim();
        console.log(`📨 Received Telegram message: ${text.substring(0, 100)}...`);
        
        // Parse expert reply - looking for user ID in various formats
        let userId = null;
        let replyText = text;
        
        // Pattern 1: Direct format "user123: message"
        const directMatch = text.match(/^([a-zA-Z0-9_]+)[:\s]+(.+)/i);
        if (directMatch) {
          userId = directMatch[1];
          replyText = directMatch[2].trim();
        } 
        // Pattern 2: Contains "user" prefix
        else if (text.toLowerCase().includes('user')) {
          const userMatch = text.match(/user\s*([a-zA-Z0-9_]+)/i);
          if (userMatch) {
            userId = userMatch[1];
            // Try to extract the actual message after user ID
            const messageMatch = text.match(new RegExp(`user\\s*${userId}\\s*[:\\s]+(.+)`, 'i'));
            if (messageMatch) {
              replyText = messageMatch[1].trim();
            }
          }
        }
        // Pattern 3: Check if it might be a reply to a previous message (checking for any alphanumeric ID at start)
        else {
          const idMatch = text.match(/^([a-zA-Z0-9_]+)$/);
          if (idMatch && idMatch[1].length >= 3) {
            // This might be just a user ID without message
            userId = idMatch[1];
            replyText = "(Expert connected)";
          } else {
            // Check if message starts with what looks like a user ID
            const potentialIdMatch = text.match(/^([a-zA-Z0-9_]{3,})[^a-zA-Z0-9_]/);
            if (potentialIdMatch) {
              userId = potentialIdMatch[1];
              replyText = text.substring(potentialIdMatch[0].length).trim();
            }
          }
        }

        if (userId && replyText) {
          // Check if this is a duplicate message
          const userMessages = messages.get(userId) || [];
          const isDuplicate = userMessages.some(m => 
            m.text === replyText && m.from === "expert"
          );
          
          if (!isDuplicate) {
            addMessage(userId, "expert", "text", replyText);
            console.log(`✅ Expert reply stored for user ${userId}: "${replyText.substring(0, 50)}..."`);
          } else {
            console.log(`⚠️ Duplicate expert message for ${userId}, ignoring`);
          }
        } else {
          console.log(`⚠️ Could not parse expert message: ${text}`);
          
          // Try one more method: Check if message contains any known user ID
          if (!userId) {
            for (const [existingUserId] of messages) {
              if (text.toLowerCase().includes(existingUserId.toLowerCase())) {
                userId = existingUserId;
                replyText = text.replace(new RegExp(existingUserId, 'gi'), '').trim();
                if (replyText) {
                  addMessage(userId, "expert", "text", replyText);
                  console.log(`✅ Found user ${userId} in message`);
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    // If we got updates, log how many
    if (updates.length > 0) {
      console.log(`📊 Processed ${updates.length} Telegram updates`);
    }
    
  } catch (error) {
    console.error("❌ Error polling Telegram updates:", error.message);
  }
}

// Start polling for Telegram updates
function startPolling() {
  console.log("🔄 Starting Telegram polling...");
  
  // Initial poll
  pollTelegramUpdates();
  
  // Poll every 3 seconds
  setInterval(pollTelegramUpdates, 3000);
}

// Start polling when server starts
if (BOT_TOKEN && BOT_TOKEN !== "your_bot_token_here") {
  setTimeout(startPolling, 2000); // Wait 2 seconds before starting
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
    
    // Send to Telegram with user ID in message
    const telegramText = `👤 User: ${userId}\n\n💬 Message: ${text}\n\n⏰ Time: ${new Date().toLocaleString()}\n\n📝 Reply format: ${userId}: your_message`;
    const telegramResult = await sendToTelegram(telegramText);
    
    if (telegramResult.success) {
      console.log("✅ Telegram: Text sent");
      return res.json({ 
        ok: true, 
        message: "Message sent to Telegram",
        messageId: message.ts,
        telegram: true,
        instruction: `Expert should reply with: ${userId}: [message]`
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
    
    // Send to Telegram with user ID in caption
    const telegramCaption = `👤 User: ${userId}\n\n${caption || "Photo"}\n\n⏰ Time: ${new Date().toLocaleString()}\n\n📝 Reply format: ${userId}: your_message`;
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
        telegram: true,
        instruction: `Expert should reply with: ${userId}: [message]`
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
    
    // Send to Telegram with user ID in caption
    const telegramCaption = `👤 User: ${userId}\n\n${caption || "Document"}\n\n📁 File: ${file.originalname}\n⏰ Time: ${new Date().toLocaleString()}\n\n📝 Reply format: ${userId}: your_message`;
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
        telegram: true,
        instruction: `Expert should reply with: ${userId}: [message]`
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

// Manual check for expert replies (optional endpoint)
app.get("/check-replies/:userId", async (req, res) => {
  const userId = req.params.userId;
  console.log(`🔍 Manual check for replies for ${userId}`);
  
  if (!BOT_TOKEN || BOT_TOKEN === "your_bot_token_here") {
    return res.json({ ok: false, error: "Telegram bot not configured" });
  }
  
  try {
    // Force a poll to check for new messages
    await pollTelegramUpdates();
    
    // Get user messages to see if any new expert messages were added
    const userMessages = messages.get(userId) || [];
    const expertMessages = userMessages.filter(m => m.from === "expert");
    const latestExpertMessage = expertMessages[expertMessages.length - 1];
    
    return res.json({ 
      ok: true, 
      hasNewReplies: expertMessages.length > 2, // More than 2 welcome messages
      expertMessageCount: expertMessages.length - 2, // Exclude welcome messages
      latestExpertMessage: latestExpertMessage,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error("❌ Check replies error:", error);
    return res.status(500).json({ error: "Failed to check replies" });
  }
});

// Get messages - Always returns messages
app.get("/messages/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(`📥 Fetching messages for ${userId}`);
  
  // Force a poll to check for new expert messages
  pollTelegramUpdates().then(() => {
    // Initialize user if doesn't exist
    initializeUser(userId);
    
    const data = messages.get(userId) || [];
    console.log(`📊 Returning ${data.length} messages for ${userId}`);
    
    // Convert file paths to URLs
    const formattedData = data.map(msg => {
      if (msg.media && msg.type !== 'text') {
        return { 
          ...msg, 
          mediaUrl: `/uploads/${msg.media}`,
          media: `/uploads/${msg.media}` 
        };
      }
      return msg;
    });
    
    return res.json(formattedData);
  }).catch(err => {
    console.error("Error polling during messages fetch:", err);
    // Still return messages even if polling fails
    initializeUser(userId);
    const data = messages.get(userId) || [];
    const formattedData = data.map(msg => {
      if (msg.media && msg.type !== 'text') {
        return { 
          ...msg, 
          mediaUrl: `/uploads/${msg.media}`,
          media: `/uploads/${msg.media}` 
        };
      }
      return msg;
    });
    return res.json(formattedData);
  });
});

// Get all users (admin endpoint)
app.get("/users", (req, res) => {
  const userList = Array.from(messages.keys()).map(userId => {
    const userMessages = messages.get(userId) || [];
    const lastMessage = userMessages[userMessages.length - 1];
    const expertMessages = userMessages.filter(m => m.from === "expert").length - 2; // Exclude welcome
    const userMessagesCount = userMessages.filter(m => m.from === "user").length;
    
    return {
      userId,
      totalMessages: userMessages.length,
      userMessages: userMessagesCount,
      expertMessages: expertMessages > 0 ? expertMessages : 0,
      lastActivity: lastMessage?.ts || null,
      lastMessage: lastMessage?.text?.substring(0, 50) || "No messages"
    };
  });
  
  res.json({
    totalUsers: messages.size,
    users: userList
  });
});

// Send expert message manually (for testing)
app.post("/send-expert-reply", async (req, res) => {
  const { userId, text } = req.body || {};
  
  if (!userId || !text) {
    return res.status(400).json({ error: "Missing userId or text" });
  }
  
  try {
    addMessage(userId, "expert", "text", text);
    console.log(`✅ Manual expert reply added for ${userId}: ${text}`);
    
    return res.json({
      ok: true,
      message: "Expert reply added",
      userId,
      text
    });
  } catch (err) {
    console.error("Error adding expert reply:", err);
    return res.status(500).json({ error: "Failed to add expert reply" });
  }
});

// Clear messages for a user (for testing)
app.delete("/clear-messages/:userId", (req, res) => {
  const userId = req.params.userId;
  
  if (messages.has(userId)) {
    messages.delete(userId);
    console.log(`🧹 Cleared messages for ${userId}`);
    return res.json({ ok: true, message: `Messages cleared for ${userId}` });
  } else {
    return res.json({ ok: false, message: `No messages found for ${userId}` });
  }
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
    totalMessages: Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0),
    polling: "active",
    lastUpdateId
  });
});

// Get Telegram bot info
app.get("/bot-info", async (req, res) => {
  if (!BOT_TOKEN || BOT_TOKEN === "your_bot_token_here") {
    return res.json({ error: "BOT_TOKEN not set" });
  }
  
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Get Telegram updates info
app.get("/updates-info", async (req, res) => {
  if (!BOT_TOKEN || BOT_TOKEN === "your_bot_token_here") {
    return res.json({ error: "BOT_TOKEN not set" });
  }
  
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`;
    const response = await axios.get(url);
    res.json({
      ok: true,
      updateCount: response.data.result?.length || 0,
      lastUpdateId,
      updates: response.data.result?.map(u => ({
        update_id: u.update_id,
        message_text: u.message?.text?.substring(0, 100) || "No text",
        chat_id: u.message?.chat?.id
      })) || []
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "CyberX × KIIT Expert Chat Backend",
    status: "✅ Online (Polling Mode)",
    endpoints: {
      "POST /send": "Send text message",
      "POST /send-photo": "Upload photo",
      "POST /send-document": "Upload document",
      "GET /messages/:userId": "Get user messages",
      "GET /check-replies/:userId": "Check for expert replies",
      "GET /users": "List all users",
      "POST /send-expert-reply": "Manually add expert reply (testing)",
      "GET /health": "Health check",
      "GET /bot-info": "Get bot info",
      "GET /updates-info": "Get Telegram updates info"
    },
    instructions: {
      telegramSetup: "1. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env",
      expertInstructions: "2. Expert should send messages in Telegram in format: 'userId: message'",
      example: "3. Example: 'john123: Hello, I can help with your issue'",
      polling: "4. System automatically polls Telegram every 3 seconds for expert replies"
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔄 Telegram polling: ${BOT_TOKEN && BOT_TOKEN !== "your_bot_token_here" ? "✅ Enabled" : "❌ Disabled (no token)"}`);
  console.log(`📝 Expert reply format: userId: message`);
});
