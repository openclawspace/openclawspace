docker build --platform linux/amd64 -t osc-hub:latest . --tag registry.cn-hangzhou.aliyuncs.com/argszero/osc-hub:latest
docker push registry.cn-hangzhou.aliyuncs.com/argszero/osc-hub:latest

# Deploy to server via SSH
ssh root@39.105.53.16 << 'EOF'
  mkdir -p /root/app/osc-hub
  cd /root/app/osc-hub
  cat > docker-compose.yml << 'EOL'
version: '3'
services:
  app:
    image: registry.cn-hangzhou.aliyuncs.com/argszero/osc-hub:latest
    environment:
      - NODE_ENV=production
      - PORT=8787
    ports:
      - "8787:8787"
    restart: always
    networks:
      - args
    volumes:
      - /root/app/osc-hub/data:/app/.ocs-client

networks:
  args:
    external: true
EOL
  docker compose pull
  docker compose up -d
EOF
