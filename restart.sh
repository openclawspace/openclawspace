#!/bin/bash

# OpenClawSpace 一键重启脚本
# 使用方法: ./restart.sh

set -e

echo "🐾 OpenClawSpace 重启脚本"
echo "=========================="

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 函数：检查端口是否被占用
check_port() {
    local port=$1
    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}端口 $port 被占用，正在关闭...${NC}"
        lsof -Pi :"$port" -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# 函数：关闭已有的 Node 进程
kill_existing() {
    echo -e "${YELLOW}关闭已有的服务进程...${NC}"
    pkill -f "tsx src/index.ts" 2>/dev/null || true
    pkill -f "tsx src/cli.ts" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    sleep 2
}

# 1. 关闭已有进程
echo ""
echo "步骤 1/4: 关闭已有进程..."
# 先检查并释放端口
check_port 8787
check_port 3000
# 再杀掉相关进程
kill_existing

# 2. 检查并安装依赖
echo ""
echo "步骤 2/4: 检查依赖..."

# 检查并安装 Hub Service 依赖
if [ ! -d "$SCRIPT_DIR/ocs-hub/packages/ocs-hub-service/node_modules" ]; then
    echo -e "${YELLOW}安装 Hub Service 依赖...${NC}"
    cd "$SCRIPT_DIR/ocs-hub/packages/ocs-hub-service"
    pnpm install
else
    echo -e "${GREEN}Hub Service 依赖已就绪${NC}"
fi

# 检查 ocs-client 依赖是否已安装
if [ ! -d "$SCRIPT_DIR/ocs-client/node_modules" ]; then
    echo -e "${YELLOW}安装 ocs-client 依赖...${NC}"
    cd "$SCRIPT_DIR/ocs-client"
    pnpm config set ignore-build-scripts false
    pnpm install
else
    echo -e "${GREEN}ocs-client 依赖已就绪${NC}"
fi

# 3. 启动服务
echo ""
echo "步骤 3/4: 启动服务..."

# 启动 Hub Service
echo -e "${GREEN}启动 Hub Service (端口 8787)...${NC}"
cd "$SCRIPT_DIR/ocs-hub/packages/ocs-hub-service"
pnpm dev &
HUB_PID=$!

# 等待 Hub Service 启动
sleep 5

# 启动 ocs-client
echo -e "${GREEN}启动 ocs-client...${NC}"
cd "$SCRIPT_DIR/ocs-client"
pnpm dev &
CLIENT_PID=$!

# 等待 Client 启动
sleep 3

# 启动 Hub Web
echo -e "${GREEN}启动 Hub Web (端口 3000)...${NC}"
cd "$SCRIPT_DIR/ocs-hub/packages/ocs-hub-web"
pnpm dev &
WEB_PID=$!

# 等待 Web 启动
sleep 3

# 4. 显示状态
echo ""
echo "=========================="
echo -e "${GREEN}✅ 所有服务已启动!${NC}"
echo "=========================="
echo ""
echo "服务地址:"
echo "  - Hub Service: http://localhost:8787"
echo "  - Hub Web:     http://localhost:3000"
echo ""
echo "使用步骤:"
echo "  1. 查看 ocs-client 输出的 Token"
echo "  2. 浏览器打开 http://localhost:3000"
echo "  3. 输入 Token 连接"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待用户中断
trap 'echo -e "\n${RED}正在停止所有服务...${NC}"; kill $HUB_PID $CLIENT_PID $WEB_PID 2>/dev/null; exit 0' INT

wait
