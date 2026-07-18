# AWS Deployment Plan: WhatsApp Multi-Bot Manager

## Architecture Overview
- **EC2 Instance**: Ubuntu 22.04 LTS (t3.medium minimum for Chrome + Node.js)
- **Process Manager**: PM2 for auto-restart and logging
- **Reverse Proxy**: Nginx with SSL (Let's Encrypt)
- **Storage**: EBS volume for session persistence
- **Security**: Security groups, firewall, HTTPS only

---

## Phase 1: EC2 Instance Setup

### 1.1 Launch Instance
```bash
# Recommended specs
AMI: Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
Instance Type: t3.medium (2 vCPU, 4 GB RAM) - minimum for Chrome headless
Storage: 30 GB gp3 (20 GB for OS + 10 GB for sessions/chrome)
Security Group: See Phase 2
Key Pair: Create/download .pem file
```

### 1.2 Connect & Base Setup
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Chrome/Chromium dependencies
sudo apt install -y \
  chromium-browser \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  libu2f-udev \
  libvulkan1

# Verify Chrome
chromium-browser --version

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## Phase 2: Security Configuration

### 2.1 Security Group (AWS Console)
| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | Your IP only | Admin access |
| HTTP | TCP | 80 | 0.0.0.0/0 | Let's Encrypt challenge |
| HTTPS | TCP | 443 | 0.0.0.0/0 | API traffic |
| Custom TCP | TCP | 3333 | Your IP only | Direct API (dev only) |

> ⚠️ **Never expose port 3333 to 0.0.0.0/0 in production**

### 2.2 UFW Firewall (Instance)
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <YOUR_IP> to any port 22
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Phase 3: Application Deployment

### 3.1 Clone & Configure
```bash
# Create app directory
mkdir -p ~/whatsapp-bot-manager
cd ~/whatsapp-bot-manager

# Copy your project files (via git, scp, or zip upload)
# Option A: Git (recommended)
git clone <YOUR_REPO_URL> .

# Option B: SCP from local
# scp -i your-key.pem -r . ubuntu@<IP>:~/whatsapp-bot-manager/

# Install dependencies
npm install

# Create production config
cat > .env << 'EOF'
PORT=3333
DATA_DIR=/home/ubuntu/whatsapp-data
CHROME_PATH=/usr/bin/chromium-browser
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EOF

# Create data directory
mkdir -p /home/ubuntu/whatsapp-data/.wwebjs_auth
```

### 3.2 PM2 Ecosystem Config
```bash
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'whatsapp-bot-manager',
    script: 'server-multi.js',
    cwd: '/home/ubuntu/whatsapp-bot-manager',
    env: {
      NODE_ENV: 'production',
      PORT: 3333,
      DATA_DIR: '/home/ubuntu/whatsapp-data',
      CHROME_PATH: '/usr/bin/chromium-browser',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser'
    },
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 5000,
    log_file: '/home/ubuntu/logs/combined.log',
    out_file: '/home/ubuntu/logs/out.log',
    error_file: '/home/ubuntu/logs/error.log',
    time: true,
    merge_logs: true
  }]
};
EOF

# Create log directory
mkdir -p ~/logs

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

---

## Phase 4: Nginx Reverse Proxy + SSL

### 4.1 Nginx Config
```bash
sudo tee /etc/nginx/sites-available/whatsapp-bot << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Proxy to Node.js
    location / {
        proxy_pass http://localhost:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Static files
    location /public/ {
        alias /home/ubuntu/whatsapp-bot-manager/public/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 4.2 SSL Certificate
```bash
# Get certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com --non-interactive --agree-tos --email your@email.com

# Auto-renewal test
sudo certbot renew --dry-run
```

---

## Phase 5: Session Persistence & Backup

### 5.1 EBS Volume for Sessions (Optional but Recommended)
```bash
# In AWS Console: Create 10GB gp3 volume → Attach to instance → /dev/xvdf
# Then on instance:
sudo mkfs -t ext4 /dev/xvdf
sudo mkdir -p /home/ubuntu/whatsapp-data
sudo mount /dev/xvdf /home/ubuntu/whatsapp-data
echo '/dev/xvdf /home/ubuntu/whatsapp-data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo chown -R ubuntu:ubuntu /home/ubuntu/whatsapp-data
```

### 5.2 Backup Script
```bash
cat > ~/backup-sessions.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf ~/backups/sessions_$DATE.tar.gz -C /home/ubuntu/whatsapp-data .wwebjs_auth
# Keep last 7 days
find ~/backups -name "sessions_*.tar.gz" -mtime +7 -delete
EOF
chmod +x ~/backup-sessions.sh
mkdir -p ~/backups

# Add to crontab (daily at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * * /home/ubuntu/backup-sessions.sh") | crontab -
```

---

## Phase 6: Verification & Monitoring

### 6.1 Health Checks
```bash
# Check PM2 status
pm2 status
pm2 logs whatsapp-bot-manager --lines 50

# Check Nginx
sudo systemctl status nginx

# Test API
curl https://your-domain.com/bots
curl https://your-domain.com/status
```

### 6.2 Monitoring (Optional)
```bash
# Install PM2 monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Open Questions for User

> [!IMPORTANT]
> **Please confirm before proceeding:**

1. **Domain**: Do you have a domain name for SSL? (Required for production WhatsApp Web)
2. **Instance Size**: Is `t3.medium` ($~30/mo) acceptable, or need `t3.small` for cost savings?
3. **Data Persistence**: Want separate EBS volume for sessions? (Recommended for production)
4. **CI/CD**: Want GitHub Actions for auto-deploy on push?
5. **Monitoring**: Need CloudWatch alarms for CPU/memory/disk?
6. **Multi-region**: Single region or need HA setup?

---

## Estimated Monthly Cost (us-east-1)
| Component | Cost |
|-----------|------|
| t3.medium EC2 | ~$30.37 |
| 30 GB gp3 EBS | ~$2.40 |
| 10 GB gp3 EBS (sessions) | ~$0.80 |
| Data transfer (100 GB) | ~$9.00 |
| **Total** | **~$42.57/mo** |
