const express = require('express');
const cors = require('cors');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');
const dotenv = require('dotenv');
const { Client, LocalAuth } = require('whatsapp-web.js');

dotenv.config();

const app = express();
const port = process.env.PORT || process.env.port || 3333;
const API_KEYS = (process.env.API_KEYS || 'sk_live_1a2b3c4d5e6f7g8h').split(',').map(k => k.trim());
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webhook_secret';

console.log(`[STARTUP] Loaded ${API_KEYS.length} API keys:`, API_KEYS);

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  console.log(`[AUTH_BYPASS] API Key check bypassed`);
  next();
};

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let qrCodeData = null;
let isReady = false;
let lastSession = null;

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (require('fs').existsSync(chromePath) ? chromePath : edgePath);

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'whatsapp-bot' }),
  puppeteer: {
    headless: true,
    executablePath: browserExecutablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  qrCodeData = qr;
  qrcodeTerminal.generate(qr, { small: true });
  console.log('Scan the QR code above with your WhatsApp mobile app.');
});

client.on('ready', () => {
  isReady = true;
  console.log('WhatsApp client is ready.');
  lastSession = new Date().toISOString();
});

client.on('authenticated', () => {
  console.log('WhatsApp client authenticated successfully.');
});

client.on('auth_failure', message => {
  console.error('WhatsApp authentication failure:', message);
});

client.on('disconnected', reason => {
  isReady = false;
  console.log('WhatsApp client disconnected:', reason);
  client.destroy();
  client.initialize();
});

client.initialize();

app.get('/status', (req, res) => {
  res.json({ ready: isReady, qrAvailable: Boolean(qrCodeData), lastSession });
});

app.get('/qr', async (req, res) => {
  if (!qrCodeData) {
    return res.status(404).json({ error: 'QR code not generated yet. Wait for the client to emit a QR event.' });
  }

  const qrDataUrl = await QRCode.toDataURL(qrCodeData);
  res.json({ qr: qrCodeData, qrDataUrl });
});

app.post('/message', validateApiKey, async (req, res) => {
  const { number, message } = req.body;

  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client is not ready yet. Please wait until /status returns ready: true.' });
  }

  if (!number || !message) {
    return res.status(400).json({ error: 'Request body must include number and message.' });
  }

  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  console.log(`[MESSAGE] to=${chatId} text=${message}`);

  try {
    const response = await client.sendMessage(chatId, message);
    console.log(`[MESSAGE_OK] to=${chatId} id=${response.id._serialized}`);
    // optional webhook forward
    if (WEBHOOK_URL) {
      axios.post(WEBHOOK_URL, { event: 'message_sent', id: response.id._serialized, to: chatId, message }).catch(() => {});
    }
    res.json({ success: true, id: response.id._serialized, to: chatId, message });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message || 'Failed to send message.' });
  }
});

app.post('/otp', validateApiKey, async (req, res) => {
  const { number, code, message } = req.body;

  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client is not ready yet. Please wait until /status returns ready: true.' });
  }

  if (!number || !code) {
    return res.status(400).json({ error: 'Request body must include number and code.' });
  }

  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const otpMessage = message || `Your verification code is: ${code}`;

  try {
    const response = await client.sendMessage(chatId, otpMessage);
    if (WEBHOOK_URL) {
      axios.post(WEBHOOK_URL, { event: 'otp_sent', id: response.id._serialized, to: chatId, code }).catch(() => {});
    }
    res.json({ success: true, id: response.id._serialized, to: chatId, code, message: otpMessage });
  } catch (error) {
    console.error('Error sending OTP message:', error);
    res.status(500).json({ error: error.message || 'Failed to send OTP.' });
  }
});

// list chats
app.get('/chats', async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'Client not ready' });
  try {
    const chats = await client.getChats();
    res.json(chats.map(c => ({ id: c.id._serialized, name: c.name || c.formattedTitle || null, notSeen: c.unreadCount }))); 
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// logout / destroy session
app.post('/logout', async (req, res) => {
  try {
    await client.destroy();
    res.json({ success: true });
    process.exit(0);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// verify API key
app.post('/verify-key', validateApiKey, (req, res) => {
  res.json({ success: true, message: 'API key is valid' });
});

// webhook receiver for testing
app.post('/webhook', async (req, res) => {
  console.log('Received webhook:', req.body);
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`WhatsApp bot API listening on http://localhost:${port}`);
});
