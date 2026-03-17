# OpenClawSpace 部署指南

## 概述

本指南涵盖在各种环境中部署 OpenClawSpace 组件。

## 架构组件

```
┌─────────────────────────────────────────────────────────────┐
│                         生产环境                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐        ┌─────────────────────────┐   │
│   │    Web 浏览器    │◄──────►│    ocs-hub (云端)       │   │
│   │    (用户)        │  HTTPS │    - 中继服务器         │   │
│   └─────────────────┘        │    - Web UI 静态资源    │   │
│                              └────────────┬────────────┘   │
│                                           │ WebSocket      │
│   ┌─────────────────┐        ┌────────────▼────────────┐   │
│   │    OpenClaw     │◄──────►│       ocs-client        │   │
│   │    Gateway      │  WS    │    (用户机器)            │   │
│   │    (本地)        │        │                         │   │
│   └─────────────────┘        └─────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Hub 部署

### Docker 部署 (推荐)

Hub 由两部分组成:
1. **Service** - WebSocket 中继 + HTTP API
2. **Web** - 静态 React SPA

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

**部署:**

```bash
cd ocs-hub
docker-compose up -d
```

### 手动部署

**要求:**
- Node.js >= 18
- npm >= 9

**Service:**

```bash
cd ocs-hub/packages/ocs-hub-service
npm install
npm run build
npm start
```

**Web (构建并服务):**

```bash
cd ocs-hub/packages/ocs-hub-web
npm install
npm run build
# 使用 nginx 或类似工具服务 dist/ 目录
```

### Nginx 配置

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
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期测试
sudo certbot renew --dry-run
```

## 客户端部署

### 本地安装

**macOS/Linux:**

```bash
npm install -g openclawspace
```

**Windows:**

```powershell
npm install -g openclawspace
```

### Systemd 服务 (Linux)

创建 `/etc/systemd/system/openclawspace.service`:

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

**启用并启动:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclawspace
sudo systemctl start openclawspace
sudo systemctl status openclawspace
```

**查看日志:**

```bash
sudo journalctl -u openclawspace -f
```

### macOS LaunchAgent

创建 `~/Library/LaunchAgents/com.openclawspace.plist`:

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

**加载并启动:**

```bash
launchctl load ~/Library/LaunchAgents/com.openclawspace.plist
launchctl start com.openclawspace
```

### Windows 服务

使用 NSSM (Non-Sucking Service Manager):

```powershell
# 安装 NSSM
choco install nssm

# 创建服务
nssm install OpenClawSpace "C:\Program Files\nodejs\node.exe"
nssm set OpenClawSpace AppParameters "C:\path\to\ocs-client\dist\cli.js"
nssm set OpenClawSpace AppDirectory "C:\path\to\ocs-client"

# 启动服务
nssm start OpenClawSpace
```

## Docker Hub Service

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制服务文件
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

# 创建数据目录
RUN mkdir -p /app/.openclawspace/spaces

EXPOSE 8787

CMD ["node", "dist/index.js"]
```

### 构建并推送

```bash
cd ocs-hub/packages/ocs-hub-service

# 构建
docker build -t your-registry/ocs-hub-service:latest .

# 推送
docker push your-registry/ocs-hub-service:latest
```

### Kubernetes 部署

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

## 环境配置

### Hub 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口号 | 8787 |
| `NODE_ENV` | 环境 | production |
| `HOME` | 主目录 | /app |
| `LOG_LEVEL` | 日志级别 | info |

### 客户端环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `OPENCLAWSPACE_HUB` | Hub WebSocket URL | wss://open-claw-space.args.fun/ws |
| `OPENCLAWSPACE_TOKEN` | 认证令牌 | (自动生成) |
| `OPENCLAWSPACE_DATA_DIR` | 数据目录 | ~/.openclawspace |

## 备份与恢复

### 数据库备份

```bash
# 停止客户端
systemctl stop openclawspace

# 备份数据库
cp ~/.openclawspace/data.db ~/.openclawspace/data.db.backup.$(date +%Y%m%d)

# 备份整个数据目录
tar czf openclawspace-backup-$(date +%Y%m%d).tar.gz ~/.openclawspace/
```

### 自动备份

**Cron 任务 (每日):**

```bash
# 编辑 crontab
crontab -e

# 添加行
0 2 * * * tar czf /backups/ocs-$(date +\%Y\%m\%d).tar.gz ~/.openclawspace/
```

### 恢复

```bash
# 停止客户端
systemctl stop openclawspace

# 从备份恢复
cp data.db.backup.20260317 ~/.openclawspace/data.db

# 启动客户端
systemctl start openclawspace
```

## 监控

### 健康检查

```bash
# Hub 健康状态
curl https://your-hub.com/health

# 响应
{"status":"ok","service":"ocs-hub-service","version":"1.0.0","activeSessions":5}
```

### 指标

**Hub 指标端点:**

```bash
curl https://your-hub.com/metrics
```

**Prometheus 抓取配置:**

```yaml
scrape_configs:
  - job_name: 'ocs-hub'
    static_configs:
      - targets: ['your-hub.com:8787']
```

### 日志聚合

**Fluentd 配置:**

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

## 扩展性考量

### Hub 扩展

- **水平扩展:** 在负载均衡器后运行多个 Hub 实例
- **粘滞会话:** WebSocket 连接需要会话亲和性
- **会话存储:** 考虑使用 Redis 存储会话状态

### 客户端扩展

每个客户端设计为单用户部署:
- 每台用户机器运行一个客户端
- 每个客户端管理多个空间
- 无需客户端间通信

## 安全清单

- [ ] 为生产环境启用 HTTPS/WSS
- [ ] 配置防火墙规则 (端口 8787)
- [ ] 设置日志轮询
- [ ] 启用自动备份
- [ ] 配置监控告警
- [ ] 使用强令牌 (12+ 字符)
- [ ] 限制文件上传类型
- [ ] 设置资源限制 (Docker/K8s)

## 部署故障排除

### Hub 连接被拒绝

```bash
# 检查服务是否运行
systemctl status ocs-hub

# 检查端口绑定
netstat -tlnp | grep 8787

# 检查防火墙
ufw allow 8787/tcp
```

### WebSocket 升级失败

```bash
# 检查 nginx 配置
nginx -t

# 验证代理头
curl -I https://your-hub.com/ws
```

### 内存使用过高

```bash
# 检查 Node.js 内存
node --max-old-space-size=512 dist/index.js

# 使用 top 监控
top -p $(pgrep -f "ocs-hub")
```
