# OpenClawSpace Deployment Guide

## Overview

This guide covers deploying OpenClawSpace components in various environments.

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Production                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐        ┌─────────────────────────┐   │
│   │   Web Browser   │◄──────►│      ocs-hub (Cloud)    │   │
│   │   (User)        │  HTTPS │      - Relay Server     │   │
│   └─────────────────┘        │      - Web UI Static    │   │
│                              └────────────┬────────────┘   │
│                                           │ WebSocket      │
│   ┌─────────────────┐        ┌────────────▼────────────┐   │
│   │   OpenClaw      │◄──────►│      ocs-client         │   │
│   │   Gateway       │  WS    │      (User's Machine)   │   │
│   │   (Local)       │        │                         │   │
│   └─────────────────┘        └─────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Hub Deployment

### Docker Deployment (Recommended)

The Hub consists of two parts:
1. **Service** - WebSocket relay + HTTP API
2. **Web** - Static React SPA

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  ocs-hub-service:
    build:
      context: ./ocs-hub/packages/ocs-hub-service
      dockerfile: Dockerfile
    ports:
      - "8787:8787"
    restart: always
    networks:
      - ocs-network
    volumes:
      - /host/data/path:/app/.openclawspace

  ocs-hub-web:
    build:
      context: ./ocs-hub/packages/ocs-hub-web
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    restart: always
    networks:
      - ocs-network

networks:
  ocs-network:
    driver: bridge
```

**Deploy:**

```bash
cd ocs-hub
docker-compose up -d
```

### Manual Deployment

**Requirements:**
- Node.js >= 18
- npm >= 9

**Service:**

```bash
cd ocs-hub/packages/ocs-hub-service
npm install
npm run build
npm start
```

**Web (build and serve):**

```bash
cd ocs-hub/packages/ocs-hub-web
npm install
npm run build
# Serve dist/ folder with nginx or similar
```

### Nginx Configuration

```nginx
# Web UI
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /path/to/ocs-hub-web/dist;
        try_files $uri $uri/ /index.html;
    }

    location /ws {
        proxy_pass http://localhost:8787/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:8787/;
        proxy_set_header Host $host;
    }
}
```

### SSL/TLS (Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal test
sudo certbot renew --dry-run
```

## Client Deployment

### Local Installation

**macOS/Linux:**

```bash
npm install -g openclawspace
```

**Windows:**

```powershell
npm install -g openclawspace
```

### Systemd Service (Linux)

Create `/etc/systemd/system/openclawspace.service`:

```ini
[Unit]
Description=OpenClawSpace Client
After=network.target

[Service]
Type=simple
User=yourusername
Environment="HOME=/home/yourusername"
Environment="OPENCLAWSPACE_HUB=wss://your-hub.com/ws"
ExecStart=/usr/local/bin/openclawspace
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclawspace
sudo systemctl start openclawspace
sudo systemctl status openclawspace
```

**View logs:**

```bash
sudo journalctl -u openclawspace -f
```

### macOS LaunchAgent

Create `~/Library/LaunchAgents/com.openclawspace.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclawspace</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/openclawspace</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/openclawspace.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/openclawspace.err</string>
</dict>
</plist>
```

**Load and start:**

```bash
launchctl load ~/Library/LaunchAgents/com.openclawspace.plist
launchctl start com.openclawspace
```

### Windows Service

Use NSSM (Non-Sucking Service Manager):

```powershell
# Install NSSM
choco install nssm

# Create service
nssm install OpenClawSpace "C:\Program Files\nodejs\node.exe"
nssm set OpenClawSpace AppParameters "C:\path\to\ocs-client\dist\cli.js"
nssm set OpenClawSpace AppDirectory "C:\path\to\ocs-client"

# Start service
nssm start OpenClawSpace
```

## Docker Hub Service

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy service files
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

# Create data directory
RUN mkdir -p /app/.openclawspace/spaces

EXPOSE 8787

CMD ["node", "dist/index.js"]
```

### Build and Push

```bash
cd ocs-hub/packages/ocs-hub-service

# Build
docker build -t your-registry/ocs-hub-service:latest .

# Push
docker push your-registry/ocs-hub-service:latest
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ocs-hub-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ocs-hub-service
  template:
    metadata:
      labels:
        app: ocs-hub-service
    spec:
      containers:
      - name: service
        image: your-registry/ocs-hub-service:latest
        ports:
        - containerPort: 8787
        env:
        - name: PORT
          value: "8787"
        - name: NODE_ENV
          value: "production"
        volumeMounts:
        - name: data
          mountPath: /app/.openclawspace
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: ocs-hub-data
---
apiVersion: v1
kind: Service
metadata:
  name: ocs-hub-service
spec:
  selector:
    app: ocs-hub-service
  ports:
  - port: 8787
    targetPort: 8787
  type: LoadBalancer
```

## Environment Configuration

### Hub Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | 8787 |
| `NODE_ENV` | Environment | production |
| `HOME` | Home directory | /app |
| `LOG_LEVEL` | Logging level | info |

### Client Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAWSPACE_HUB` | Hub WebSocket URL | wss://open-claw-space.args.fun/ws |
| `OPENCLAWSPACE_TOKEN` | Auth token | (generated) |
| `OPENCLAWSPACE_DATA_DIR` | Data directory | ~/.openclawspace |

## Backup and Recovery

### Database Backup

```bash
# Stop client
systemctl stop openclawspace

# Backup database
cp ~/.openclawspace/data.db ~/.openclawspace/data.db.backup.$(date +%Y%m%d)

# Backup entire data directory
tar czf openclawspace-backup-$(date +%Y%m%d).tar.gz ~/.openclawspace/
```

### Automated Backups

**Cron job (daily):**

```bash
# Edit crontab
crontab -e

# Add line
0 2 * * * tar czf /backups/ocs-$(date +\%Y\%m\%d).tar.gz ~/.openclawspace/
```

### Recovery

```bash
# Stop client
systemctl stop openclawspace

# Restore from backup
cp data.db.backup.20260317 ~/.openclawspace/data.db

# Start client
systemctl start openclawspace
```

## Monitoring

### Health Checks

```bash
# Hub health
curl https://your-hub.com/health

# Response
{"status":"ok","service":"ocs-hub-service","version":"1.0.0","activeSessions":5}
```

### Metrics

**Hub metrics endpoint:**

```bash
curl https://your-hub.com/metrics
```

**Prometheus scrape config:**

```yaml
scrape_configs:
  - job_name: 'ocs-hub'
    static_configs:
      - targets: ['your-hub.com:8787']
```

### Log Aggregation

**Fluentd config:**

```xml
<source>
  @type tail
  path /home/*/logs/ocs-client-*.log
  tag ocs-client
  <parse>
    @type regexp
    expression /^(?<timestamp>[^\]]+)\s+\[(?<level>\w+)\]\s+(?<message>.*)$/
  </parse>
</source>
```

## Scaling Considerations

### Hub Scaling

- **Horizontal:** Run multiple hub instances behind load balancer
- **Sticky sessions:** WebSocket connections need session affinity
- **Session storage:** Consider Redis for session state

### Client Scaling

Each client is designed for single-user deployment:
- One client per user machine
- Each client manages multiple spaces
- No client-to-client communication needed

## Security Checklist

- [ ] Enable HTTPS/WSS for production
- [ ] Configure firewall rules (port 8787)
- [ ] Set up log rotation
- [ ] Enable automatic backups
- [ ] Configure monitoring alerts
- [ ] Use strong tokens (12+ chars)
- [ ] Restrict file upload types
- [ ] Set resource limits (Docker/K8s)

## Troubleshooting Deployment

### Hub Connection Refused

```bash
# Check if service is running
systemctl status ocs-hub

# Check port binding
netstat -tlnp | grep 8787

# Check firewall
ufw allow 8787/tcp
```

### WebSocket Upgrade Failed

```bash
# Check nginx config
nginx -t

# Verify proxy headers
curl -I https://your-hub.com/ws
```

### High Memory Usage

```bash
# Check Node.js memory
node --max-old-space-size=512 dist/index.js

# Monitor with top
top -p $(pgrep -f "ocs-hub")
```
