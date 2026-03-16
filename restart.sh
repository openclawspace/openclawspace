#!/bin/bash

# OpenClawSpace 一键重启脚本
# 使用方法: ./restart.sh
# 功能: 先停止所有服务，再启动所有服务

set -e

echo "🐾 OpenClawSpace 重启脚本"
echo "=========================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "步骤 1/2: 停止所有服务..."
echo "--------------------------"
if [ -f "./stop.sh" ]; then
    ./stop.sh
else
    echo -e "${RED}❌ 找不到 stop.sh 脚本${NC}"
    exit 1
fi

echo ""
echo "步骤 2/2: 启动所有服务..."
echo "--------------------------"
if [ -f "./start.sh" ]; then
    ./start.sh
else
    echo -e "${RED}❌ 找不到 start.sh 脚本${NC}"
    exit 1
fi

echo ""
echo "=========================="
echo -e "${GREEN}✅ 重启完成!${NC}"
echo "=========================="