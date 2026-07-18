# WhatsApp Bot Manager - External API Integration Guide

## Overview

The WhatsApp Bot Manager exposes a REST API that allows external websites/applications to send WhatsApp messages through connected bots. This guide explains how to integrate with the API.

---

## Base URL

```
Production: http://18.141.127.188
Local:      http://localhost:3333
```

---

## Authentication

All API requests require:
1. **Bot ID** - Identifies which bot to use
2. **API Key** - Authorizes the request (configured per bot)

### Methods to pass credentials:

| Method | Example |
|--------|---------|
| JSON Body | `{"botId": "game_store", "apiKey": "sk_live_..."}` |
| Query Params | `?botId=game_store&apiKey=sk_live_...` |
| Header | `X-Bot-ID: game_store` + `Authorization: Bearer sk_live_...` |

> **Note:** API keys are created in the UI under "API Keys" tab or via API.

---

## Endpoints

### 1. Send Message

**POST** `/message`

```bash
curl -X POST http://18.141.127.188/message \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "game_store",
    "apiKey": "sk_live_game_store_abc123",
    "number": "94753492120",
    "message": "Hello from external website!"
  }'
```

**Request Body:**
```json
{
  "botId": "string",      // Required - Bot identifier
  "apiKey": "string",     // Required - API key for authentication
  "number": "string",     // Required - Recipient phone (country code, no +)
  "message": "string"     // Required - Message text
}
```

**Response (Success):**
```json
{
  "success": true,
  "botId": "game_store",
  "id": "true_94753492120@c.us_3EB0...",
  "to": "94753492120@c.us",
  "message": "Hello from external website!"
}
```

**Response (Error):**
```json
{
  "error": "Bot 'game_store' is not ready yet"
}
```

---

### 2. Verify API Key

**POST** `/verify-key`

```bash
curl -X POST http://18.141.127.188/verify-key \
  -H "Content-Type: application/json" \
  -d '{"botId": "game_store", "apiKey": "sk_live_game_store_abc123"}'
```

---

### 3. Get Bot Status

**GET** `/bots`

```bash
curl http://18.141.127.188/bots
```

**Response:**
```json
{
  "bots": [
    {
      "id": "game_store",
      "name": "Game Store Bot",
      "ready": true,
      "qrAvailable": false,
      "pairCodeAvailable": false,
      "enabled": true,
      "keyCount": 1,
      "messageCount": 42
    }
  ]
}
```

---

### 4. Message History

**GET** `/bots/:botId/history?limit=50`

```bash
curl "http://18.141.127.188/bots/game_store/history?limit=20"
```

---

### 5. Pair with Phone Number (Get Pairing Code)

**POST** `/bots/:botId/pair`

```bash
curl -X POST http://18.141.127.188/bots/game_store/pair \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "94753492120"}'
```

**Response:**
```json
{
  "code": "XAQK76CZ",
  "expiresIn": 300
}
```

> User enters this 8-char code in WhatsApp: Settings → Linked Devices → Link a Device → **Link with phone number instead**

---

### 6. Get QR Code (Alternative Login)

**GET** `/bots/:botId/qr`

```bash
curl "http://18.141.127.188/bots/game_store/qr"
```

---

## Integration Examples

### JavaScript / Node.js (Fetch)

```javascript
async function sendWhatsApp(botId, apiKey, phoneNumber, message) {
  const response = await fetch('http://18.141.127.188/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId, apiKey, number: phoneNumber, message })
  });
  return response.json();
}

// Usage
await sendWhatsApp('game_store', 'sk_live_game_store_abc123', '94753492120', 'Order confirmed!');
```

### Python (requests)

```python
import requests

def send_whatsapp(bot_id, api_key, phone, message):
    url = 'http://18.141.127.188/message'
    payload = {
        'botId': bot_id,
        'apiKey': api_key,
        'number': phone,
        'message': message
    }
    response = requests.post(url, json=payload)
    return response.json()

# Usage
send_whatsapp('game_store', 'sk_live_game_store_abc123', '94753492120', 'Order confirmed!')
```

### PHP (cURL)

```php
function sendWhatsApp($botId, $apiKey, $phone, $message) {
    $url = 'http://18.141.127.188/message';
    $data = json_encode([
        'botId' => $botId,
        'apiKey' => $apiKey,
        'number' => $phone,
        'message' => $message
    ]);
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $data,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true);
}
```

### C# / .NET (HttpClient)

```csharp
using System.Net.Http;
using System.Text.Json;

public async Task<JsonDocument> SendWhatsAppAsync(string botId, string apiKey, string phone, string message)
{
    using var client = new HttpClient();
    var payload = new { botId, apiKey, number = phone, message };
    var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
    
    var response = await client.PostAsync("http://18.141.127.188/message", content);
    return await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
}
```

---

## Phone Number Format

**Always use international format WITHOUT + or spaces:**

| Country | Example Input | Stored As |
|---------|---------------|-----------|
| Sri Lanka | 94775352074 | 94775352074@c.us |
| USA | 15551234567 | 15551234567@c.us |
| India | 919876543210 | 919876543210@c.us |
| UK | 447700900123 | 447700900123@c.us |

---

## Error Codes

| HTTP Status | Error Message | Cause |
|-------------|---------------|-------|
| 400 | Missing botId parameter | botId not provided |
| 401 | Invalid API key | Wrong/missing apiKey |
| 404 | Bot 'xxx' not found | Bot ID doesn't exist |
| 503 | Bot 'xxx' is not ready yet | WhatsApp not connected |
| 500 | Failed to send message | WhatsApp API error |

---

## Webhook / Callback (Optional)

To receive delivery receipts or incoming messages, configure your bot to call your webhook:

1. Add webhook URL in bot config
2. Bot will POST to your endpoint:
```json
{
  "event": "message_sent",
  "botId": "game_store",
  "messageId": "true_...",
  "to": "94753492120@c.us",
  "status": "delivered",
  "timestamp": "2026-07-18T09:30:00Z"
}
```

---

## Security Best Practices

1. **HTTPS in Production** - Use domain + SSL (Let's Encrypt)
2. **Rotate API Keys** - Regenerate periodically
3. **IP Whitelist** - Restrict API access to known IPs (nginx config)
4. **Rate Limiting** - Add nginx rate limits:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
location /message { limit_req zone=api burst=20; ... }
```
5. **Store Keys Securely** - Never commit API keys to git

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 502 Bad Gateway | Check `pm2 status`, restart: `pm2 restart whatsapp-bot-manager` |
| Bot not ready | Pair via `/pair` endpoint or scan QR from `pm2 logs` |
| Invalid API key | Verify key in UI "API Keys" tab |
| Message not delivered | Check bot status: `curl /bots`, ensure `ready: true` |
| Connection timeout | AWS Security Group: allow port 80/443 from 0.0.0.0/0 |

---

## Quick Test Commands

```bash
# Test bot status
curl http://18.141.127.188/bots

# Test send message
curl -X POST http://18.141.127.188/message \
  -H "Content-Type: application/json" \
  -d '{"botId":"game_store","apiKey":"sk_live_game_store_abc123","number":"94753492120","message":"Test from API"}'

# View logs
ssh -i botmanager.pem ubuntu@18.141.127.188 "pm2 logs whatsapp-bot-manager --lines 20"
```

---

## Support

- **UI Dashboard**: http://18.141.127.188/multi.html
- **API Base**: http://18.141.127.188
- **Logs**: `pm2 logs whatsapp-bot-manager`
