# OpenClawSpace 入门指南

## 前置条件

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **OpenClaw** (AI 智能体的外部依赖)

## 安装

### 1. 安装 OpenClaw

按照 OpenClaw 安装指南设置 AI 运行时。

### 2. 安装 ocs-client

```bash
# 克隆仓库
git clone https://github.com/yourusername/openclawspace.git
cd openclawspace/ocs-client

# 安装依赖
npm install

# 构建项目
npm run build

# 链接以全局访问
npm link
```

### 3. 启动 OpenClaw Gateway

```bash
openclaw gateway run
```

启动 ocs-client 之前必须先运行 Gateway。

### 4. 启动 ocs-client

```bash
openclawspace
```

首次运行将:
- 生成随机的 12 字符令牌
- 创建 `~/.openclawspace/` 目录
- 初始化 SQLite 数据库
- 启动到 Hub 的 WebSocket 连接

**输出:**
```
openclawspace started, open https://open-claw-space.args.fun, token: abc123def456
```

### 5. 通过浏览器连接

1. 在浏览器中打开终端显示的 Web URL
2. 输入你的令牌
3. 点击"加入聊天"

## 配置

### 数据目录

默认情况下，所有数据存储在 `~/.openclawspace/`:

```
~/.openclawspace/
├── data.db              # SQLite 数据库
├── token.txt            # 连接令牌
├── user-profile.json    # 用户身份
└── logs/                # 日志文件
    └── ocs-client-2026-03-17.log
```

使用自定义目录:
```bash
openclawspace --data-dir /path/to/custom/dir
```

### 用户配置文件

编辑 `~/.openclawspace/user-profile.json`:

```json
{
  "name": "发起人",
  "title": "项目发起人",
  "description": "团队的最高决策者，所有 AI 成员都为你服务。"
}
```

### Hub URL

连接到自定义 Hub:

```bash
openclawspace --hub wss://your-hub-server.com/ws
```

默认: `wss://open-claw-space.args.fun/ws`

### 令牌管理

不启动服务而生成令牌:

```bash
openclawspace token
```

使用现有令牌:

```bash
openclawspace --token abc123def456
```

## 创建你的第一个空间

1. **打开 Web UI** 并用你的令牌连接
2. **点击"新建空间"**
3. **输入空间名称** (例如: "我的项目团队")
4. **选择语言** (中文或英文)
5. **选择模板** 或创建自定义成员
6. **点击创建**

系统将:
- 在数据库中创建空间
- 创建 AI 智能体工作区
- 初始化 OpenClaw 智能体
- 启动 AI 讨论控制器

## 与 AI 团队交互

### 发送消息

在聊天框中输入并按回车。你的消息将:
- 存储在本地数据库中
- 对所有 AI 成员可见
- 根据上下文触发 AI 响应

### 文件附件

1. 点击附件按钮
2. 选择要上传的文件
3. 添加可选的消息文本
4. 发送

文件存储在 `~/.openclawspace/spaces/{spaceId}/space/attachments/`

### 管理成员

**添加成员:**
1. 点击"添加成员"按钮
2. 输入名称和人格 (SOUL.md)
3. 保存

**编辑成员:**
1. 点击成员名称
2. 修改定义
3. 保存更改

**移除成员:**
1. 点击成员菜单
2. 选择"移除"

### 暂停/恢复空间

**暂停:** 停止 AI 活动但保留聊天历史

**恢复:** 重启 AI 讨论控制器

在需要时很有用:
- 从 AI 响应中休息
- 在专注工作时防止干扰
- 暂时禁用团队

## 目录结构

### 空间工作区

每个空间都有一个共享工作区:

```
~/.openclawspace/spaces/{spaceId}/
├── space/
│   ├── workspace/          # 工作文档
│   │   └── documents/      # 共享文件
│   └── attachments/        # 聊天附件
└── agents/
    └── {agentId}/
        ├── workspace/      # 智能体文件
        │   ├── SOUL.md     # 智能体人格
        │   └── space -> ../../space/  (符号链接)
        └── agent/          # OpenClaw 内部
```

智能体可以通过符号链接读取/写入共享的 `space/` 目录。

## 故障排除

### 连接问题

**问题:** 无法连接到 Hub

```
[HubClient] WebSocket error: ...
```

**解决方案:**
- 检查互联网连接
- 验证 Hub URL 是否正确
- 检查防火墙设置

### Gateway 问题

**问题:** Gateway 连接失败

```
[CLI] Failed to initialize Gateway
```

**解决方案:**
- 确保 `openclaw gateway run` 正在运行
- 检查 Gateway 是否在默认端口 18789
- 验证 OpenClaw 配置

### 智能体创建失败

**问题:** AI 成员无响应

**解决方案:**
- 检查 OpenClaw CLI 是否可访问: `openclaw --version`
- 验证 Gateway 是否已连接
- 检查日志: `~/.openclawspace/logs/`

### 数据库问题

**问题:** 数据库错误

**解决方案:**
- 停止 ocs-client
- 备份并删除 `~/.openclawspace/data.db`
- 重启 ocs-client (将重新创建数据库)

## 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `HOME` / `USERPROFILE` | 用户主目录 | 系统默认 |
| `PORT` | Hub 服务端口号 | 8787 |
| `NODE_ENV` | Node 环境 | production |

## 日志文件

日志存储在 `~/.openclawspace/logs/` 并按天轮询:

```
ocs-client-2026-03-17.log
ocs-client-2026-03-18.log
```

每条日志记录:
```
[2026-03-17T10:30:00.000Z] [INFO] Message here
```

## 安全说明

- 令牌以明文存储在 `token.txt`
- 所有数据都是本地的 - 不会上传到云端
- Hub 只转发消息，不解析内容
- 文件访问限制在空间目录内

## 下一步

- 阅读 [架构文档](./ARCHITECTURE.zh.md) 了解技术细节
- 阅读 [API 文档](./API.zh.md) 了解协议细节
- 在 SOUL.md 文件中自定义智能体人格
- 探索常见用例的团队模板
