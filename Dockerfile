FROM node:18-bookworm-slim

# Install Chromium, dbus, and required libraries
RUN apt-get update && apt-get install -y \
    chromium \
    dbus \
    dbus-x11 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libasound2 \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATA_DIR=/data \
    PORT=8080

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

EXPOSE 8080

# Start dbus system bus then launch the app
CMD ["sh", "-c", "mkdir -p /run/dbus && dbus-daemon --system --fork || true && npm run start-multi"]
