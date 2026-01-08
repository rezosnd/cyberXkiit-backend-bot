import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
<<<<<<< HEAD
import FormData from "form-data";
import fs from "fs";
import multer from "multer";
import path from "path";
=======
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26

dotenv.config();

const app = express();
app.use(cors());
<<<<<<< HEAD
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
=======
app.use(express.json({ limit: "128kb" }));
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Debug log
console.log("✅ Environment check:");
console.log("BOT_TOKEN exists:", !!BOT_TOKEN);
console.log("CHAT_ID exists:", !!CHAT_ID);

<<<<<<< HEAD
// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
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

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

const messages = new Map(); // userId → [{ from, type, text, media, ts }]

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
  console.log(`💾 Stored ${type} message for ${userId}: ${content?.substring(0, 50) || caption.substring(0, 50) || 'media'}`);
  return message;
}

// Function to send different types of media to Telegram
async function sendToTelegram(type, mediaData, caption = "", userId = "") {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/`;
  const form = new FormData();
  
  form.append('chat_id', CHAT_ID);
  
  if (caption) {
    form.append('caption', caption);
  }
  
  // Add user info to caption
  const userInfo = userId ? `\n\n👤 User ID: ${userId}` : '';
  if (form.get('caption')) {
    form.set('caption', form.get('caption') + userInfo);
  } else if (userInfo) {
    form.append('caption', userInfo.trim());
  }

  let method = 'sendMessage';
  
  switch (type) {
    case 'text':
      method = 'sendMessage';
      form.append('text', mediaData);
      break;
      
    case 'photo':
      method = 'sendPhoto';
      if (mediaData.startsWith('http')) {
        form.append('photo', mediaData);
      } else if (mediaData.startsWith('data:')) {
        // Handle base64 image
        const matches = mediaData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
          form.append('photo', buffer, {
            filename: `photo_${Date.now()}.${matches[1]}`,
            contentType: `image/${matches[1]}`
          });
        }
      } else {
        // Assume it's a file path
        form.append('photo', fs.createReadStream(mediaData));
      }
      break;
      
    case 'document':
      method = 'sendDocument';
      if (mediaData.startsWith('http')) {
        form.append('document', mediaData);
      } else if (mediaData.startsWith('data:')) {
        const matches = mediaData.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
          form.append('document', buffer, {
            filename: `document_${Date.now()}.${matches[1].split('/')[1]}`,
            contentType: matches[1]
          });
        }
      } else {
        form.append('document', fs.createReadStream(mediaData));
      }
      break;
      
    case 'voice':
    case 'audio':
      method = 'sendVoice';
      if (mediaData.startsWith('http')) {
        form.append('voice', mediaData);
      } else if (mediaData.startsWith('data:')) {
        const matches = mediaData.match(/^data:audio\/(\w+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
          form.append('voice', buffer, {
            filename: `voice_${Date.now()}.${matches[1]}`,
            contentType: `audio/${matches[1]}`
          });
        }
      } else {
        form.append('voice', fs.createReadStream(mediaData));
      }
      break;
      
    default:
      throw new Error(`Unsupported media type: ${type}`);
  }

  try {
    const response = await axios.post(`${url}${method}`, form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 30000, // 30 seconds timeout for large files
    });
    
    console.log(`📤 Telegram ${type} response:`, response.data);
    
    // Extract file_id from response
    let fileId = null;
    if (type === 'photo' && response.data.result.photo) {
      fileId = response.data.result.photo[response.data.result.photo.length - 1].file_id;
    } else if (response.data.result[type]) {
      fileId = response.data.result[type].file_id;
    } else if (response.data.result.document) {
      fileId = response.data.result.document.file_id;
    } else if (response.data.result.voice) {
      fileId = response.data.result.voice.file_id;
    }
    
    return { 
      success: true, 
      data: response.data,
      fileId: fileId
    };
  } catch (err) {
    console.error(`❌ Telegram ${type} error:`, err.response?.data || err.message);
    return { 
      success: false, 
      error: err.response?.data || err.message 
    };
  }
}

/* =========================
   APP → TELEGRAM (TEXT)
========================= */
app.post("/send", async (req, res) => {
  console.log("📨 /send called:", req.body?.userId);
  
  const { userId, text } = req.body || {};

  if (!userId || !text) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Store user message immediately
  const message = addMessage(userId, "user", "text", text);

  const formatted = `📩 TEXT MESSAGE FROM USER ${userId}\n\n${text}`;
  console.log("➡️ Forwarding text to Telegram");

  // Send to Telegram but don't fail the request if Telegram fails
  try {
    const telegramResult = await sendToTelegram('text', formatted, "", userId);
    
    if (telegramResult.success) {
      console.log("✅ Telegram send successful");
      return res.json({ 
        ok: true, 
        message: "Message sent and forwarded to Telegram",
        messageId: message.ts,
        telegram: telegramResult.data
      });
    } else {
      console.log("⚠️ Telegram send partially failed, but message stored");
      return res.json({ 
        ok: true, 
        message: "Message stored locally, but Telegram failed",
        warning: "Telegram forward failed",
        telegramError: telegramResult.error,
        messageId: message.ts
      });
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    // Still return success because message was stored
    return res.json({ 
      ok: true, 
      message: "Message stored locally",
      warning: "Telegram forward failed unexpectedly",
      messageId: message.ts
    });
  }
});

/* =========================
   APP → TELEGRAM (PHOTO)
========================= */
app.post("/send-photo", upload.single('photo'), async (req, res) => {
  console.log("📸 /send-photo called:", req.body?.userId);
  
  const { userId, caption } = req.body || {};
  const file = req.file;

  if (!userId || !file) {
    if (file) {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    // Store photo message
    const message = addMessage(userId, "user", "photo", "Photo", file.path, caption || "");

    console.log("➡️ Forwarding photo to Telegram");
    const telegramResult = await sendToTelegram('photo', file.path, caption || "", userId);
    
    // Clean up uploaded file after sending
    fs.unlinkSync(file.path);
    
    if (telegramResult.success) {
      console.log("✅ Photo sent to Telegram");
      return res.json({ 
        ok: true, 
        message: "Photo sent to Telegram",
        messageId: message.ts,
        fileId: telegramResult.fileId,
        telegram: telegramResult.data
      });
    } else {
      console.log("⚠️ Photo send partially failed, but stored locally");
      return res.json({ 
        ok: true, 
        message: "Photo stored locally, but Telegram failed",
        warning: "Telegram forward failed",
        telegramError: telegramResult.error,
        messageId: message.ts
      });
    }
  } catch (err) {
    console.error("❌ Photo upload error:", err);
    // Clean up file if exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: "Failed to process photo" });
  }
});

/* =========================
   APP → TELEGRAM (DOCUMENT/FILE)
========================= */
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
    const message = addMessage(userId, "user", "document", file.originalname, file.path, caption || "");

    console.log(`➡️ Forwarding document ${file.originalname} to Telegram`);
    const telegramResult = await sendToTelegram('document', file.path, caption || "", userId);
    
    // Clean up uploaded file after sending
    fs.unlinkSync(file.path);
    
    if (telegramResult.success) {
      console.log("✅ Document sent to Telegram");
      return res.json({ 
        ok: true, 
        message: "Document sent to Telegram",
        messageId: message.ts,
        fileId: telegramResult.fileId,
        fileName: file.originalname,
        fileSize: file.size,
        telegram: telegramResult.data
      });
    } else {
      console.log("⚠️ Document send partially failed, but stored locally");
      return res.json({ 
        ok: true, 
        message: "Document stored locally, but Telegram failed",
        warning: "Telegram forward failed",
        telegramError: telegramResult.error,
        messageId: message.ts
      });
    }
  } catch (err) {
    console.error("❌ Document upload error:", err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: "Failed to process document" });
  }
});

/* =========================
   APP → TELEGRAM (VOICE RECORDING)
========================= */
app.post("/send-voice", upload.single('voice'), async (req, res) => {
  console.log("🎤 /send-voice called:", req.body?.userId);
  
  const { userId, caption } = req.body || {};
  const file = req.file;

  if (!userId || !file) {
    if (file) {
      fs.unlinkSync(file.path);
    }
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Check if file is audio
  if (!file.mimetype.startsWith('audio/')) {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: "File must be an audio file" });
  }

  try {
    // Store voice message
    const message = addMessage(userId, "user", "voice", "Voice message", file.path, caption || "");

    console.log(`➡️ Forwarding voice recording to Telegram`);
    const telegramResult = await sendToTelegram('voice', file.path, caption || "", userId);
    
    // Clean up uploaded file after sending
    fs.unlinkSync(file.path);
    
    if (telegramResult.success) {
      console.log("✅ Voice recording sent to Telegram");
      return res.json({ 
        ok: true, 
        message: "Voice recording sent to Telegram",
        messageId: message.ts,
        fileId: telegramResult.fileId,
        telegram: telegramResult.data
      });
    } else {
      console.log("⚠️ Voice recording send partially failed, but stored locally");
      return res.json({ 
        ok: true, 
        message: "Voice stored locally, but Telegram failed",
        warning: "Telegram forward failed",
        telegramError: telegramResult.error,
        messageId: message.ts
      });
    }
  } catch (err) {
    console.error("❌ Voice upload error:", err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: "Failed to process voice recording" });
  }
});

/* =========================
   APP → TELEGRAM (BASE64 MEDIA)
========================= */
app.post("/send-media", async (req, res) => {
  console.log("🎨 /send-media (base64) called:", req.body?.userId);
  
  const { userId, type, data, caption, fileName } = req.body || {};

  if (!userId || !type || !data) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const validTypes = ['photo', 'document', 'voice'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid media type" });
  }

  try {
    // Create temp file for base64 data
    const tempPath = path.join('uploads', `temp_${Date.now()}_${fileName || 'file'}`);
    
    // Decode base64 data
    const matches = data.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: "Invalid base64 data" });
    }
    
    const buffer = Buffer.from(matches[2], 'base64');
    fs.writeFileSync(tempPath, buffer);
    
    // Store media message
    const message = addMessage(userId, "user", type, fileName || `${type} file`, tempPath, caption || "");

    console.log(`➡️ Forwarding ${type} (base64) to Telegram`);
    const telegramResult = await sendToTelegram(type, tempPath, caption || "", userId);
    
    // Clean up temp file
    fs.unlinkSync(tempPath);
    
    if (telegramResult.success) {
      console.log(`✅ ${type} sent to Telegram`);
      return res.json({ 
        ok: true, 
        message: `${type} sent to Telegram`,
        messageId: message.ts,
        fileId: telegramResult.fileId,
        telegram: telegramResult.data
      });
    } else {
      console.log(`⚠️ ${type} send partially failed, but stored locally`);
      return res.json({ 
        ok: true, 
        message: `${type} stored locally, but Telegram failed`,
        warning: "Telegram forward failed",
        telegramError: telegramResult.error,
        messageId: message.ts
      });
    }
  } catch (err) {
    console.error("❌ Media upload error:", err);
    return res.status(500).json({ error: "Failed to process media" });
  }
});

/* =========================
   TELEGRAM → APP (WEBHOOK)
========================= */
app.post("/telegram-webhook", (req, res) => {
  console.log("🔔 Telegram webhook received");
  
  try {
    const msg = req.body?.message || req.body?.edited_message || null;

    if (!msg) {
=======
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
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26
      console.log("📭 No valid message in webhook");
      return res.sendStatus(200);
    }

<<<<<<< HEAD
    // Extract userId from the message being replied to
    let userId = null;
    let isReply = false;
    
    if (msg.reply_to_message) {
      const repliedText = msg.reply_to_message.text || '';
      const match = repliedText.match(/USER\s+([a-zA-Z0-9_]+)/);
      if (match) {
        userId = match[1];
        isReply = true;
      }
    }
    
    // If not a reply, try to extract from text/caption
    if (!userId && msg.text) {
      const match = msg.text.match(/USER\s+([a-zA-Z0-9_]+)\s*:\s*([\s\S]+)/i);
      if (match) {
        userId = match[1];
      }
    }
    
    if (!userId && msg.caption) {
      const match = msg.caption.match(/USER\s+([a-zA-Z0-9_]+)\s*:\s*([\s\S]+)/i);
      if (match) {
        userId = match[1];
      }
    }

    if (!userId) {
      console.log("⚠️ No USER ID found in message");
      return res.sendStatus(200);
    }

    // Handle different message types
    if (msg.text && !isReply) {
      // Text message (not a reply, contains USER pattern)
      const match = msg.text.match(/USER\s+([a-zA-Z0-9_]+)\s*:\s*([\s\S]+)/i);
      if (match) {
        const replyText = match[2].trim();
        addMessage(userId, "expert", "text", replyText);
        console.log(`✅ Stored text reply for ${userId}: ${replyText.substring(0, 50)}`);
      }
    } else if (msg.text && isReply) {
      // Text reply to a message
      addMessage(userId, "expert", "text", msg.text);
      console.log(`✅ Stored text reply (reply) for ${userId}: ${msg.text.substring(0, 50)}`);
    } else if (msg.photo) {
      // Photo message
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const caption = msg.caption || "";
      addMessage(userId, "expert", "photo", "Photo", fileId, caption);
      console.log(`✅ Stored photo for ${userId}`);
    } else if (msg.document) {
      // Document message
      const fileId = msg.document.file_id;
      const fileName = msg.document.file_name || "Document";
      const caption = msg.caption || "";
      addMessage(userId, "expert", "document", fileName, fileId, caption);
      console.log(`✅ Stored document for ${userId}: ${fileName}`);
    } else if (msg.voice) {
      // Voice message
      const fileId = msg.voice.file_id;
      const caption = msg.caption || "";
      addMessage(userId, "expert", "voice", "Voice message", fileId, caption);
      console.log(`✅ Stored voice message for ${userId}`);
    } else if (msg.audio) {
      // Audio message
      const fileId = msg.audio.file_id;
      const caption = msg.caption || "";
      addMessage(userId, "expert", "voice", msg.audio.title || "Audio", fileId, caption);
      console.log(`✅ Stored audio for ${userId}`);
    }

=======
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

>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26
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
<<<<<<< HEAD
});

/* =========================
   GET TELEGRAM FILE
========================= */
app.get("/telegram-file/:fileId", async (req, res) => {
  const fileId = req.params.fileId;
  console.log(`📁 Requesting file: ${fileId}`);
  
  try {
    // Get file path from Telegram
    const fileInfoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileInfo = await axios.get(fileInfoUrl);
    
    if (!fileInfo.data.ok) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const filePath = fileInfo.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    
    // Redirect to Telegram file
    res.redirect(fileUrl);
    
  } catch (error) {
    console.error("❌ Error getting file:", error);
    res.status(500).json({ error: "Failed to get file" });
  }
=======
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26
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
<<<<<<< HEAD
    sampleUsers: Array.from(messages.keys()).slice(0, 3),
    uploadDirExists: fs.existsSync('uploads')
=======
    sampleUsers: Array.from(messages.keys()).slice(0, 3)
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26
  };
  console.log("🏥 Health check:", stats);
  res.json(stats);
});

<<<<<<< HEAD
=======
// Add a debug endpoint
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26
app.get("/debug", (_, res) => {
  const debugInfo = {
    messages: Array.from(messages.entries()).map(([userId, msgs]) => ({
      userId,
      count: msgs.length,
<<<<<<< HEAD
      types: msgs.map(m => m.type),
=======
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26
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
<<<<<<< HEAD
  console.log(`   POST /send                   - Send text`);
  console.log(`   POST /send-photo             - Send photo (multipart)`);
  console.log(`   POST /send-document          - Send document (multipart)`);
  console.log(`   POST /send-voice             - Send voice (multipart)`);
  console.log(`   POST /send-media             - Send media (base64)`);
  console.log(`   POST /telegram-webhook       - Telegram webhook`);
  console.log(`   GET  /messages/:userId       - Get messages`);
  console.log(`   GET  /telegram-file/:fileId  - Get Telegram file`);
  console.log(`   GET  /health                 - Health check`);
  console.log(`   GET  /debug                  - Debug info`);
});
=======
  console.log(`   POST /send`);
  console.log(`   POST /telegram-webhook`);
  console.log(`   GET  /messages/:userId`);
  console.log(`   GET  /health`);
  console.log(`   GET  /debug`);
});
>>>>>>> 3f8b7aac35db235fb4e2f62c8b4ce9b3ffbbeb26
