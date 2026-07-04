# WhatsApp Web Bot API

A simple WhatsApp bot system built with `whatsapp-web.js`, using terminal QR scanning for device login and REST endpoints for sending messages and OTP codes.

## Setup

1. Open a terminal in the project folder.
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
# for production
npm start

# for development (auto-restart)
npm run dev
```

4. Scan the QR code shown in the terminal with your WhatsApp mobile app.

## API Endpoints

- `GET /status`
  - Returns readiness and QR availability.

- `POST /verify-key`
  - Test your API key. Requires valid API key.
  - Body: `{ "apiKey": "sk_live_..." }`
  - Returns: `{ "success": true, "message": "API key is valid" }`

- `POST /message`
  - Send a plain message. **Requires API key.**
  - Body: `{ "number": "94775352074", "message": "Hello", "apiKey": "sk_live_..." }`

- `POST /otp`
  - Send an OTP message. **Requires API key.**
  - Body: `{ "number": "94775352074", "code": "123456", "apiKey": "sk_live_..." }`

- `GET /qr`
  - Returns the latest QR payload and a `qrDataUrl` for website display.

- `GET /chats`
  - List chats. **Requires API key.**
  - Returns: Array of chat objects.

- `POST /logout`
  - Disconnect the WhatsApp session. **Requires API key.**


## API Authentication

All requests to `/message` and `/otp` require a valid API key. You can pass the key in two ways:

1. **In the request body:**
```json
{
  "number": "94775352074",
  "message": "Hello",
  "apiKey": "sk_live_1a2b3c4d5e6f7g8h"
}
```

2. **In the HTTP header:**
```bash
curl -X POST http://localhost:3333/message \
  -H "X-API-Key: sk_live_1a2b3c4d5e6f7g8h" \
  -H "Content-Type: application/json" \
  -d '{"number":"94775352074","message":"Hello"}'
```

### Managing API Keys

Edit `.env` file and add keys to `API_KEYS` (comma-separated):
```
API_KEYS=sk_live_1a2b3c4d5e6f7g8h,sk_live_9i8h7g6f5e4d3c2b,sk_live_yourkey
```

Then restart the server.

## Integration Examples

### Node.js / JavaScript
```javascript
const response = await fetch('http://your-server:3333/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'sk_live_1a2b3c4d5e6f7g8h'
  },
  body: JSON.stringify({
    number: '94775352074',
    message: 'Hello from your website'
  })
});
const result = await response.json();
console.log(result);
```

### PHP
```php
<?php
$ch = curl_init();
curl_setopt_array($ch, array(
  CURLOPT_URL => 'http://your-server:3333/message',
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => json_encode(array(
    'number' => '94775352074',
    'message' => 'Hello from your website'
  )),
  CURLOPT_HTTPHEADER => array(
    'Content-Type: application/json',
    'X-API-Key: sk_live_1a2b3c4d5e6f7g8h'
  ),
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

response = requests.post(
  'http://your-server:3333/message',
  json={
    'number': '94775352074',
    'message': 'Hello from your website'
  },
  headers={
    'X-API-Key': 'sk_live_1a2b3c4d5e6f7g8h'
  }
)
print(response.json())
```



- Use the phone number in international format without `+`, e.g. `15551234567`.
- The first login requires QR scanning. After authentication, session data is persisted automatically.
- You can integrate other websites by calling the API endpoints from backend services.
