#!/bin/bash

# OpenClawSpace 一键启动脚本
# 使用方法: ./start.sh

set -e

echo "🐾 OpenClawSpace 启动脚本"
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
    local name=$2
    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ 端口 $port 被占用 ($name)${NC}"
        echo -e "${YELLOW}请先运行 ./stop.sh 停止服务，或手动释放端口${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ 端口 $port 可用 ($name)${NC}"
    fi
}

# 1. 检查端口占用
echo ""
echo "步骤 1/3: 检查端口占用..."
check_port 8787 "Hub Service"
check_port 3000 "Hub Web"

# 2. 检查并安装依赖
echo ""
echo "步骤 2/3: 检查依赖..."

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

# 检查 Hub Web 依赖是否已安装
if [ ! -d "$SCRIPT_DIR/ocs-hub/packages/ocs-hub-web/node_modules" ]; then
    echo -e "${YELLOW}安装 Hub Web 依赖...${NC}"
    cd "$SCRIPT_DIR/ocs-hub/packages/ocs-hub-web"
    pnpm install
else
    echo -e "${GREEN}Hub Web 依赖已就绪${NC}"
fi

# 3. 启动服务
echo ""
echo "步骤 3/3: 启动服务..."

# 启动 Hub Service
echo -e "${GREEN}启动 Hub Service (端口 8787)...${NC}"
cd "$SCRIPT_DIR/ocs-hub/packages/ocs-hub-service"
pnpm dev &
HUB_PID=$!

# 等待 Hub Service 启动
sleep 5

# 启动 ocs-client（连接到本地 Hub）
echo -e "${GREEN}启动 ocs-client...${NC}"
cd "$SCRIPT_DIR/ocs-client"
pnpm dev -- -h ws://localhost:8787/ws &
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
