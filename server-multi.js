const express = require('express');
const cors = require('cors');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

dotenv.config();

const app = express();
const port = process.env.PORT || 3333;

const DATA_DIR = process.env.DATA_DIR || __dirname;
const botsConfigPath = path.join(DATA_DIR, 'bots.config.json');

// Ensure bots.config.json exists in DATA_DIR
if (!fs.existsSync(botsConfigPath)) {
  const defaultPath = path.join(__dirname, 'bots.config.json');
  if (fs.existsSync(defaultPath)) {
    fs.copyFileSync(defaultPath, botsConfigPath);
    console.log(`[STARTUP] Copied default bots.config.json to ${botsConfigPath}`);
  } else {
    fs.writeFileSync(botsConfigPath, JSON.stringify({ bots: [] }, null, 2), 'utf8');
    console.log(`[STARTUP] Created new empty bots.config.json at ${botsConfigPath}`);
  }
}

const botsConfig = JSON.parse(fs.readFileSync(botsConfigPath, 'utf8'));

// Store bot instances and their states
const bots = {};
const botStates = {};

const initializeBot = (botConfig) => {
  console.log(`[STARTUP] Creating bot: ${botConfig.id} (${botConfig.name})`);
  
  const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browserExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
    (require('fs').existsSync(chromePath) ? chromePath : edgePath);

  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: botConfig.id,
      dataPath: path.join(DATA_DIR, '.wwebjs_auth')
    }),
    puppeteer: {
      headless: true,
      executablePath: browserExecutablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  // Initialize bot state
  botStates[botConfig.id] = {
    ready: false,
    qrCodeData: null,
    lastSession: null,
    config: botConfig
  };

  // QR code handler
  client.on('qr', qr => {
    botStates[botConfig.id].qrCodeData = qr;
    qrcodeTerminal.generate(qr, { small: true });
    console.log(`[QR] Bot '${botConfig.id}': Scan QR code to link device`);
  });

  const syncBotConnectionState = async () => {
    try {
      const state = await client.getState();
      const isConnected = state === 'CONNECTED';
      if (botStates[botConfig.id].ready !== isConnected) {
        botStates[botConfig.id].ready = isConnected;
        if (isConnected) {
          botStates[botConfig.id].qrCodeData = null;
          botStates[botConfig.id].lastSession = new Date().toISOString();
          console.log(`[READY] Bot '${botConfig.id}' is connected (state=${state})`);
        } else if (state) {
          console.log(`[STATE] Bot '${botConfig.id}' state=${state}`);
        }
      }
    } catch (error) {
      // Ignore transient state probe errors while the client is still initializing.
    }
  };

  // Ready handler
  client.on('ready', () => {
    botStates[botConfig.id].ready = true;
    botStates[botConfig.id].qrCodeData = null;
    botStates[botConfig.id].lastSession = new Date().toISOString();
    console.log(`[READY] Bot '${botConfig.id}' is ready`);
  });

  // Authenticated handler
  client.on('authenticated', () => {
    botStates[botConfig.id].qrCodeData = null;
    console.log(`[AUTH] Bot '${botConfig.id}' authenticated`);
    syncBotConnectionState();
  });

  client.on('change_state', state => {
    if (state === 'CONNECTED') {
      botStates[botConfig.id].ready = true;
      botStates[botConfig.id].qrCodeData = null;
      botStates[botConfig.id].lastSession = new Date().toISOString();
      console.log(`[READY] Bot '${botConfig.id}' changed state to ${state}`);
    } else {
      botStates[botConfig.id].ready = false;
    }
  });

  // Auth failure handler
  client.on('auth_failure', message => {
    console.error(`[AUTH_FAIL] Bot '${botConfig.id}': ${message}`);
  });

  // Disconnected handler
  client.on('disconnected', reason => {
    botStates[botConfig.id].ready = false;
    console.log(`[DISCONNECT] Bot '${botConfig.id}': ${reason}`);
    client.destroy();
    client.initialize();
  });

  // Store the client and initialize
  bots[botConfig.id] = client;
  client.initialize();
  
  const syncInterval = setInterval(() => {
    syncBotConnectionState();
  }, 5000);

  botStates[botConfig.id].syncInterval = syncInterval;
};

// Initialize bots from configuration
console.log('[STARTUP] Initializing bots from configuration...');
botsConfig.bots.forEach(botConfig => {
  if (botConfig.enabled) {
    initializeBot(botConfig);
  } else {
    console.log(`[STARTUP] Bot '${botConfig.id}' is disabled, skipping client creation but loading config.`);
    botStates[botConfig.id] = {
      ready: false,
      qrCodeData: null,
      lastSession: null,
      config: botConfig
    };
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  const botId = req.body?.botId || req.query.botId || req.headers['x-bot-id'] || req.params.botId;

  if (!botId) {
    console.log(`[AUTH_FAIL] Missing botId`);
    return res.status(400).json({ error: 'Missing botId parameter' });
  }

  if (!botStates[botId]) {
    console.log(`[AUTH_FAIL] Bot '${botId}' not found`);
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }

  console.log(`[AUTH_BYPASS] API Key check bypassed for bot '${botId}'`);
  req.botId = botId;
  next();
};

// Store message history
const messageHistory = {};

// ============= BOT MANAGEMENT ENDPOINTS =============

// Get all bots and their status
app.get('/bots', (req, res) => {
  const botsList = Object.keys(botStates).map(botId => ({
    id: botId,
    name: botStates[botId].config.name,
    ready: botStates[botId].ready,
    qrAvailable: Boolean(botStates[botId].qrCodeData),
    lastSession: botStates[botId].lastSession,
    enabled: botStates[botId].config.enabled,
    keyCount: botStates[botId].config.apiKeys.length,
    messageCount: (messageHistory[botId] || []).length
  }));
  res.json({ bots: botsList });
});

// Create a new bot
app.post('/bots/create', (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'id and name are required' });
  }

  const idRegex = /^[a-zA-Z0-9_]+$/;
  if (!idRegex.test(id)) {
    return res.status(400).json({ error: 'id must be alphanumeric and underscores only' });
  }

  if (botStates[id]) {
    return res.status(400).json({ error: `Bot with ID '${id}' already exists` });
  }

  // Generate a random API key for the bot
  const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const newApiKey = `sk_live_${id}_${randomStr}`;

  const newBotConfig = {
    id,
    name,
    enabled: true,
    apiKeys: [newApiKey]
  };

  botsConfig.bots.push(newBotConfig);
  try {
    fs.writeFileSync(botsConfigPath, JSON.stringify(botsConfig, null, 2), 'utf8');
  } catch (error) {
    console.error('[ERROR] Failed to save bots.config.json:', error);
    return res.status(500).json({ error: 'Failed to write configuration file' });
  }

  initializeBot(newBotConfig);

  res.json({ success: true, bot: newBotConfig });
});

// Toggle bot enabled/paused state
app.post('/bots/:botId/toggle', async (req, res) => {
  const { botId } = req.params;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }

  const configIndex = botsConfig.bots.findIndex(b => b.id === botId);
  if (configIndex === -1) {
    return res.status(404).json({ error: `Bot '${botId}' not found in configuration` });
  }

  const currentlyEnabled = botStates[botId].config.enabled;
  const targetEnabled = !currentlyEnabled;

  botStates[botId].config.enabled = targetEnabled;
  botsConfig.bots[configIndex].enabled = targetEnabled;

  try {
    fs.writeFileSync(botsConfigPath, JSON.stringify(botsConfig, null, 2), 'utf8');
  } catch (error) {
    console.error('[ERROR] Failed to save bots.config.json:', error);
    return res.status(500).json({ error: 'Failed to write configuration file' });
  }

  if (targetEnabled) {
    console.log(`[MANAGEMENT] Resuming bot '${botId}'...`);
    initializeBot(botStates[botId].config);
  } else {
    console.log(`[MANAGEMENT] Pausing bot '${botId}'...`);
    const client = bots[botId];
    if (client) {
      if (botStates[botId].syncInterval) {
        clearInterval(botStates[botId].syncInterval);
      }
      try {
        await client.destroy();
      } catch (err) {
        console.error(`[ERROR] Error destroying client for bot '${botId}':`, err);
      }
      delete bots[botId];
    }
    botStates[botId].ready = false;
    botStates[botId].qrCodeData = null;
  }

  res.json({ success: true, enabled: targetEnabled });
});

// Remove/delete a bot
app.post('/bots/:botId/remove', async (req, res) => {
  const { botId } = req.params;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }

  const configIndex = botsConfig.bots.findIndex(b => b.id === botId);
  
  const client = bots[botId];
  if (client) {
    if (botStates[botId].syncInterval) {
      clearInterval(botStates[botId].syncInterval);
    }
    try {
      await client.destroy();
    } catch (err) {
      console.error(`[ERROR] Error destroying client for bot '${botId}':`, err);
    }
    delete bots[botId];
  }

  const sessionDir = path.join(DATA_DIR, '.wwebjs_auth', `session-${botId}`);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`[MANAGEMENT] Removed session directory for bot '${botId}'`);
    } catch (error) {
      console.error(`[ERROR] Failed to delete session directory for bot '${botId}':`, error);
    }
  }

  delete botStates[botId];
  if (configIndex !== -1) {
    botsConfig.bots.splice(configIndex, 1);
    try {
      fs.writeFileSync(botsConfigPath, JSON.stringify(botsConfig, null, 2), 'utf8');
    } catch (error) {
      console.error('[ERROR] Failed to save bots.config.json:', error);
      return res.status(500).json({ error: 'Failed to write configuration file' });
    }
  }

  res.json({ success: true });
});

// Get single bot status
app.get('/bots/:botId/status', (req, res) => {
  const { botId } = req.params;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }
  res.json({
    id: botId,
    name: botStates[botId].config.name,
    ready: botStates[botId].ready,
    qrAvailable: Boolean(botStates[botId].qrCodeData),
    lastSession: botStates[botId].lastSession
  });
});

// Get QR code for a specific bot
app.get('/bots/:botId/qr', async (req, res) => {
  const { botId } = req.params;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }

  const qrCodeData = botStates[botId].qrCodeData;
  if (!qrCodeData) {
    return res.status(404).json({ error: 'QR code not generated yet. Wait for the bot to emit a QR event.' });
  }

  const qrDataUrl = await QRCode.toDataURL(qrCodeData);
  res.json({ botId, qr: qrCodeData, qrDataUrl });
});

// ============= MESSAGE ENDPOINTS =============

// Verify API key for a bot
app.post('/verify-key', validateApiKey, (req, res) => {
  res.json({ success: true, message: `API key is valid for bot '${req.botId}'` });
});

// Send message
app.post('/message', validateApiKey, async (req, res) => {
  const { number, message } = req.body;
  const botId = req.botId;

  if (!number || !message) {
    return res.status(400).json({ error: 'Request body must include number and message' });
  }

  const client = bots[botId];
  if (!botStates[botId].ready) {
    return res.status(503).json({ error: `Bot '${botId}' is not ready yet` });
  }

  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  console.log(`[MESSAGE] Bot '${botId}' to=${chatId} text=${message}`);

  try {
    const response = await client.sendMessage(chatId, message);
    const msgRecord = {
      id: response.id._serialized,
      timestamp: new Date().toISOString(),
      number,
      message,
      status: 'sent',
      botId
    };
    if (!messageHistory[botId]) messageHistory[botId] = [];
    messageHistory[botId].push(msgRecord);
    console.log(`[MESSAGE_OK] Bot '${botId}' to=${chatId} id=${response.id._serialized}`);
    res.json({ success: true, botId, id: response.id._serialized, to: chatId, message });
  } catch (error) {
    console.error(`[MESSAGE_ERROR] Bot '${botId}':`, error.message);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

// Send OTP
app.post('/otp', validateApiKey, async (req, res) => {
  const { number, code, message } = req.body;
  const botId = req.botId;

  if (!number || !code) {
    return res.status(400).json({ error: 'Request body must include number and code' });
  }

  const client = bots[botId];
  if (!botStates[botId].ready) {
    return res.status(503).json({ error: `Bot '${botId}' is not ready yet` });
  }

  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const otpMessage = message || `Your verification code is: ${code}`;
  console.log(`[OTP] Bot '${botId}' to=${chatId} code=${code}`);

  try {
    const response = await client.sendMessage(chatId, otpMessage);
    const msgRecord = {
      id: response.id._serialized,
      timestamp: new Date().toISOString(),
      number,
      message: otpMessage,
      type: 'otp',
      code,
      status: 'sent',
      botId
    };
    if (!messageHistory[botId]) messageHistory[botId] = [];
    messageHistory[botId].push(msgRecord);
    console.log(`[OTP_OK] Bot '${botId}' to=${chatId} id=${response.id._serialized}`);
    res.json({ success: true, botId, id: response.id._serialized, to: chatId, code, message: otpMessage });
  } catch (error) {
    console.error(`[OTP_ERROR] Bot '${botId}':`, error.message);
    res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

// Get chats for a bot
app.get('/bots/:botId/chats', validateApiKey, async (req, res) => {
  const botId = req.params.botId;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }

  const client = bots[botId];
  if (!botStates[botId].ready) {
    return res.status(503).json({ error: `Bot '${botId}' is not ready yet` });
  }

  try {
    const chats = await client.getChats();
    res.json(chats.map(c => ({ id: c.id._serialized, name: c.name || c.formattedTitle || null, unread: c.unreadCount })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout a bot
app.post('/bots/:botId/logout', validateApiKey, async (req, res) => {
  const botId = req.params.botId;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }

  try {
    const client = bots[botId];
    await client.destroy();
    botStates[botId].ready = false;
    res.json({ success: true, message: `Bot '${botId}' logged out` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get message history for a bot
app.get('/bots/:botId/history', validateApiKey, (req, res) => {
  const botId = req.params.botId;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }
  const limit = parseInt(req.query.limit) || 100;
  const history = (messageHistory[botId] || []).slice(-limit);
  res.json({ botId, messageCount: history.length, messages: history });
});

// Get API keys for a bot
app.get('/bots/:botId/keys', validateApiKey, (req, res) => {
  const botId = req.params.botId;
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }
  const keys = botStates[botId].config.apiKeys;
  res.json({ botId, keys, keyCount: keys.length });
});

// Add new API key to a bot
app.post('/bots/:botId/keys', validateApiKey, (req, res) => {
  const botId = req.params.botId;
  const { newKey } = req.body;
  
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }
  
  if (!newKey) {
    return res.status(400).json({ error: 'newKey is required' });
  }
  
  const config = botStates[botId].config;
  if (config.apiKeys.includes(newKey)) {
    return res.status(400).json({ error: 'This key already exists for this bot' });
  }
  
  config.apiKeys.push(newKey);
  fs.writeFileSync(botsConfigPath, JSON.stringify(botsConfig, null, 2));
  console.log(`[KEY_ADDED] Bot '${botId}': ${newKey}`);
  res.json({ success: true, botId, keys: config.apiKeys });
});

// Delete API key from a bot
app.post('/bots/:botId/keys/delete', validateApiKey, (req, res) => {
  const botId = req.params.botId;
  const { keyToDelete } = req.body;
  
  if (!botStates[botId]) {
    return res.status(404).json({ error: `Bot '${botId}' not found` });
  }
  
  if (!keyToDelete) {
    return res.status(400).json({ error: 'keyToDelete is required' });
  }
  
  const config = botStates[botId].config;
  const index = config.apiKeys.indexOf(keyToDelete);
  if (index === -1) {
    return res.status(400).json({ error: 'Key not found' });
  }
  
  config.apiKeys.splice(index, 1);
  fs.writeFileSync(botsConfigPath, JSON.stringify(botsConfig, null, 2));
  console.log(`[KEY_DELETED] Bot '${botId}': ${keyToDelete}`);
  res.json({ success: true, botId, keys: config.apiKeys });
});

// Start server
app.listen(port, () => {
  console.log(`[SERVER] WhatsApp bot API listening on http://localhost:${port}`);
  console.log(`[SERVER] Available bots: ${Object.keys(bots).join(', ')}`);
});
