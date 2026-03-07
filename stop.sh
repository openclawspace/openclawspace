#!/bin/bash

# OpenClawSpace 一键停止脚本
# 使用方法: ./stop.sh

set -e

echo "🐾 OpenClawSpace 停止脚本"
echo "=========================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 函数：关闭指定端口的进程
kill_port() {
    local port=$1
    local name=$2
    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}关闭 $name (端口 $port)...${NC}"
        lsof -Pi :"$port" -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
    else
        echo -e "${GREEN}$name (端口 $port) 未运行${NC}"
    fi
}

# 函数：关闭指定名称的进程
kill_process() {
    local pattern=$1
    local name=$2
    if pgrep -f "$pattern" >/dev/null 2>&1; then
        echo -e "${YELLOW}关闭 $name...${NC}"
        pkill -f "$pattern" 2>/dev/null || true
    else
        echo -e "${GREEN}$name 未运行${NC}"
    fi
}

echo ""
echo "步骤 1/2: 关闭端口占用..."
kill_port 8787 "Hub Service"
kill_port 3000 "Hub Web"

echo ""
echo "步骤 2/2: 关闭服务进程..."
kill_process "tsx src/index.ts" "Hub Service"
kill_process "src/cli.ts" "ocs-client"
kill_process "vite" "Vite Dev Server"

echo ""
echo "=========================="
echo -e "${GREEN}✅ 所有服务已停止!${NC}"
echo "=========================="
