# WhatsApp Multi-Bot System

This system allows you to manage multiple independent WhatsApp bots, each linked to a different device and with separate API keys.

## Quick Start

### 1. Configure Your Bots

Edit `bots.config.json`:

```json
{
  "bots": [
    {
      "id": "game_store",
      "name": "Game Store Bot",
      "enabled": true,
      "apiKeys": ["sk_live_game_store_1a2b3c4d5e6f"]
    },
    {
      "id": "school_web",
      "name": "School Web Bot",
      "enabled": true,
      "apiKeys": ["sk_live_school_web_9i8h7g6f5e4d"]
    },
    {
      "id": "ecommerce",
      "name": "E-Commerce Bot",
      "enabled": false,
      "apiKeys": ["sk_live_ecommerce_3c2b1a9i8h7g"]
    }
  ]
}
```

**Fields:**
- `id` - Unique identifier for the bot (used in API requests)
- `name` - Display name
- `enabled` - Whether to initialize this bot on startup
- `apiKeys` - Array of API keys that can control this bot (can have multiple keys per bot)

### 2. Start the Multi-Bot Server

```bash
npm run start-multi
```

Or for development with auto-reload:

```bash
npm run dev-multi
```

### 3. Link Each Device

Open your browser to:
```
http://localhost:3333/multi.html
```

- You'll see a QR code for each bot
- Scan the QR with your WhatsApp phone
- Once linked, the bot shows as "Ready"

## API Usage

### List All Bots

```bash
curl http://localhost:3333/bots
```

Response:
```json
{
  "bots": [
    {
      "id": "game_store",
      "name": "Game Store Bot",
      "ready": true,
      "qrAvailable": false,
      "lastSession": "2026-07-03T14:30:00.000Z"
    },
    {
      "id": "school_web",
      "name": "School Web Bot",
      "ready": false,
      "qrAvailable": true,
      "lastSession": null
    }
  ]
}
```

### Get Single Bot Status

```bash
curl http://localhost:3333/bots/game_store/status
```

### Get QR Code for a Bot

```bash
curl http://localhost:3333/bots/school_web/qr
```

Response:
```json
{
  "botId": "school_web",
  "qr": "...",
  "qrDataUrl": "data:image/png;base64,..."
}
```

### Send Message with Specific Bot

```bash
curl -X POST http://localhost:3333/message \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "game_store",
    "number": "94775352074",
    "message": "Hello from Game Store",
    "apiKey": "sk_live_game_store_1a2b3c4d5e6f"
  }'
```

### Send OTP with Specific Bot

```bash
curl -X POST http://localhost:3333/otp \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "school_web",
    "number": "94775352074",
    "code": "123456",
    "apiKey": "sk_live_school_web_9i8h7g6f5e4d"
  }'
```

### Verify API Key

```bash
curl -X POST http://localhost:3333/verify-key \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "game_store",
    "apiKey": "sk_live_game_store_1a2b3c4d5e6f"
  }'
```

### List Chats for a Bot

```bash
curl -X GET "http://localhost:3333/bots/game_store/chats?botId=game_store&apiKey=sk_live_game_store_1a2b3c4d5e6f"
```

### Logout/Disconnect a Bot

```bash
curl -X POST http://localhost:3333/bots/game_store/logout \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk_live_game_store_1a2b3c4d5e6f"
  }'
```

## Integration Examples

### Node.js

```javascript
const botId = 'game_store';
const apiKey = 'sk_live_game_store_1a2b3c4d5e6f';

const response = await fetch('http://your-server:3333/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    botId: botId,
    number: '94775352074',
    message: 'Hello from Node.js',
    apiKey: apiKey
  })
});

const result = await response.json();
console.log(result);
```

### PHP

```php
<?php
$botId = 'game_store';
$apiKey = 'sk_live_game_store_1a2b3c4d5e6f';

$ch = curl_init();
curl_setopt_array($ch, array(
  CURLOPT_URL => 'http://your-server:3333/message',
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => json_encode(array(
    'botId' => $botId,
    'number' => '94775352074',
    'message' => 'Hello from PHP',
    'apiKey' => $apiKey
  )),
  CURLOPT_HTTPHEADER => array('Content-Type: application/json'),
  CURLOPT_RETURNTRANSFER => true
));
$result = curl_exec($ch);
curl_close($ch);
echo $result;
?>
```

### Python

```python
import requests

botId = 'game_store'
apiKey = 'sk_live_game_store_1a2b3c4d5e6f'

response = requests.post(
  'http://your-server:3333/message',
  json={
    'botId': botId,
    'number': '94775352074',
    'message': 'Hello from Python',
    'apiKey': apiKey
  }
)

print(response.json())
```

## Security Best Practices

1. **Unique Keys per Bot** - Each bot should have its own API key
2. **Unique Keys per Website** - Each website using a bot should get a unique key
3. **Keep .env and bots.config.json Secure** - Never commit to git or expose publicly
4. **Use HTTPS in Production** - All API requests should go through HTTPS
5. **Rotate Keys Regularly** - Update API keys periodically
6. **Disable Unused Bots** - Set `"enabled": false` for bots you're not using

## Error Responses

### Missing botId
```json
{ "error": "Missing botId parameter" }
```

### Invalid botId
```json
{ "error": "Bot 'invalid_id' not found" }
```

### Invalid API Key
```json
{ "error": "Invalid or missing API key for this bot" }
```

### Bot Not Ready
```json
{ "error": "Bot 'game_store' is not ready yet" }
```

## Troubleshooting

**Problem:** Bot shows "Waiting for QR"
- **Solution:** Check the terminal output for debug logs. The bot needs to initialize first.

**Problem:** "Invalid API key" error
- **Solution:** Verify the `botId` and `apiKey` match the configuration in `bots.config.json`

**Problem:** Server won't start
- **Solution:** Check that all bot clientIds are unique and `bots.config.json` is valid JSON

**Problem:** Messages not sending
- **Solution:** Ensure bot status shows "Ready" and the phone has internet connection
