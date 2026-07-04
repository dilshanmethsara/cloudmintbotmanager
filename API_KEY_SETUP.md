# WhatsApp Bot - API Key System Setup

## Overview
Your WhatsApp bot now has a secure multi-key API authentication system. Only developers with valid API keys can send messages or access protected endpoints.

## How It Works

### 1. API Keys Storage
Edit `.env` file:
```
API_KEYS=sk_live_1a2b3c4d5e6f7g8h,sk_live_9i8h7g6f5e4d3c2b,sk_live_yourkey
```

Add as many keys as you need (comma-separated). Each web developer should get a unique key.

### 2. Two Ways to Authenticate

**Option A: In Request Body**
```json
{
  "number": "94775352074",
  "message": "Hello",
  "apiKey": "sk_live_1a2b3c4d5e6f7g8h"
}
```

**Option B: In HTTP Header** (Recommended for security)
```
X-API-Key: sk_live_1a2b3c4d5e6f7g8h
```

### 3. Protected Endpoints
- `POST /message` - Send message
- `POST /otp` - Send OTP
- `POST /verify-key` - Test if key is valid
- `GET /chats` - List chats
- `POST /logout` - Disconnect session

### 4. Security Features
- Invalid keys return `401 Unauthorized`
- Keys are checked on every protected request
- Invalid requests are logged: `[AUTH_FAIL] Invalid or missing API key`
- API keys are checked in both request body and headers

## Using with Your Website

### Test If Key Works
```bash
curl -X POST http://your-server:3333/verify-key \
  -H "X-API-Key: sk_live_1a2b3c4d5e6f7g8h" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:
```json
{
  "success": true,
  "message": "API key is valid"
}
```

### Send Message
```bash
curl -X POST http://your-server:3333/message \
  -H "X-API-Key: sk_live_1a2b3c4d5e6f7g8h" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "94775352074",
    "message": "Hello from your website"
  }'
```

## Generate New Keys
To add a new developer's key:
1. Edit `.env`
2. Add new key to `API_KEYS`: `API_KEYS=existing_keys,sk_live_newkey`
3. Restart the server: `npm start`

## Best Practices
1. Give each developer/website a unique key
2. Use header-based authentication (X-API-Key) instead of body
3. Keep `.env` file secure and never commit to git
4. Rotate keys periodically
5. Use the `/verify-key` endpoint to test keys before integration
6. Log all API requests on your side for audit trail
