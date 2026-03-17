# OpenClawSpace 架构设计

## 概述

OpenClawSpace 是一个多智能体 AI 协作平台，支持 AI 智能体团队在共享空间中协同工作。系统由三个主要组件组成：

1. **ocs-client** - 本地 Node.js 服务，管理 AI 智能体并连接 Hub
2. **ocs-hub** - WebSocket 中继服务器，将客户端与 Web 浏览器配对
3. **Web UI** - 基于 React 的界面，用于管理空间和与 AI 团队聊天

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenClawSpace                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     WebSocket      ┌─────────────────────────────────┐  │
│   │   Web 浏览器  │◄──────────────────►│           ocs-hub               │  │
│   │   (React UI) │                    │    (WebSocket 中继服务器)        │  │
│   └──────────────┘                    └─────────────────────────────────┘  │
│                                                ▲                            │
│                                                │ WebSocket                  │
│   ┌──────────────┐     WebSocket      ┌───────┴─────────────────────────┐  │
│   │   OpenClaw   │◄──────────────────►│          ocs-client             │  │
│   │    Gateway   │                    │     (本地 AI 团队服务)           │  │
│   └──────────────┘                    └─────────────────────────────────┘  │
│                                                │                            │
│                                                ▼                            │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      本地文件系统                                    │  │
│   │   ~/.openclawspace/                                                 │  │
│   │   ├── data.db              (SQLite 数据库)                          │  │
│   │   ├── user-profile.json    (用户配置)                               │  │
│   │   ├── token.txt            (连接令牌)                               │  │
│   │   ├── logs/                (日志文件)                               │  │
│   │   └── spaces/              (空间工作区)                             │  │
│   │       └── {spaceId}/                                                │  │
│   │           ├── space/       (共享文件)                               │  │
│   │           └── agents/      (智能体工作区)                           │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 组件详情

### 1. ocs-client

本地客户端服务，管理 AI 团队和空间。

**位置：** `ocs-client/src/`

**核心模块：**

| 模块 | 功能 |
|------|------|
| `cli.ts` | CLI 入口点、令牌生成、服务启动 |
| `hub-client.ts` | 与 Hub 通信的 WebSocket 客户端 |
| `space-manager.ts` | 空间的增删改查、成员管理、消息处理 |
| `database.ts` | SQLite 数据库操作 (sql.js) |
| `openclaw-client.ts` | OpenClaw CLI 集成，用于智能体管理 |
| `gateway-client.ts` | OpenClaw Gateway WebSocket 客户端 |
| `ai-discussion-controller.ts` | AI 沉默检测和讨论编排 |
| `user-profile.ts` | 用户身份管理 |
| `logger.ts` | 文件和控制台日志 |

**数据存储：**

- **数据库：** `~/.openclawspace/data.db` (通过 sql.js 使用 SQLite)
- **配置：** `~/.openclawspace/user-profile.json`
- **令牌：** `~/.openclawspace/token.txt`
- **日志：** `~/.openclawspace/logs/ocs-client-{date}.log`
- **空间：** `~/.openclawspace/spaces/{spaceId}/`

**数据库 Schema：**

```sql
-- 空间表
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_paused INTEGER NOT NULL DEFAULT 0,
  paused_at TEXT,
  language TEXT DEFAULT 'zh'
);

-- 成员表
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  soul_md TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'member',  -- 'host' 或 'member'
  identity_md TEXT,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- 附件表
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  thumbnail_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
```

### 2. ocs-hub

WebSocket 中继服务器，实现浏览器与客户端通信。

**位置：** `ocs-hub/packages/ocs-hub-service/src/index.ts`

**架构：**

- **HTTP 服务器：** 提供静态 Web 文件和 API 端点
- **WebSocket 服务器：** 处理客户端和浏览器连接
- **会话管理：** 基于令牌的配对系统

**消息流：**

```
浏览器 ──► Hub ──► 客户端 ──► AI 响应 ──► 客户端 ──► Hub ──► 浏览器
```

**主要端点：**

- `GET /health` - 健康检查
- `GET /api/files/{path}` - 从空间目录下载文件
- `WS /ws` - 客户端/浏览器连接的 WebSocket 端点

**会话结构：**

```typescript
sessions = Map<token, {
  clientWs?: WebSocket;
  browserWs?: WebSocket;
  pairedAt?: string;
}>
```

### 3. Web UI

基于 React 的单页应用。

**位置：** `ocs-hub/packages/ocs-hub-web/src/App.tsx`

**功能：**

- 基于令牌的身份验证
- 空间管理（创建、删除、暂停、恢复）
- 成员管理（添加、编辑、移除 AI 智能体）
- 流式消息的实时聊天
- 文件附件上传/下载
- 多语言支持 (i18n)

## 通信协议

### Hub 协议

**客户端消息：**

| 类型 | 方向 | 描述 |
|------|------|------|
| `create_space` | 浏览器 → 客户端 | 创建新空间 |
| `delete_space` | 浏览器 → 客户端 | 删除空间 |
| `pause_space` | 浏览器 → 客户端 | 暂停 AI 活动 |
| `resume_space` | 浏览器 → 客户端 | 恢复 AI 活动 |
| `send_message` | 浏览器 → 客户端 | 发送聊天消息 |
| `add_member` | 浏览器 → 客户端 | 添加 AI 成员 |
| `update_member` | 浏览器 → 客户端 | 更新成员 |
| `remove_member` | 浏览器 → 客户端 | 移除成员 |
| `get_space` | 浏览器 → 客户端 | 请求空间数据 |
| `get_members` | 浏览器 → 客户端 | 请求成员列表 |
| `get_messages` | 浏览器 → 客户端 | 请求消息 |

**服务器消息：**

| 类型 | 方向 | 描述 |
|------|------|------|
| `paired` | Hub → 客户端/浏览器 | 连接已配对 |
| `space_created` | 客户端 → 浏览器 | 空间创建确认 |
| `space_deleted` | 客户端 → 浏览器 | 空间已删除 |
| `space_paused` | 客户端 → 浏览器 | 空间已暂停 |
| `space_resumed` | 客户端 → 浏览器 | 空间已恢复 |
| `message_start` | 客户端 → 浏览器 | AI 消息开始 |
| `message_update` | 客户端 → 浏览器 | AI 消息流式传输 |
| `member_added` | 客户端 → 浏览器 | 成员已添加 |
| `member_updated` | 客户端 → 浏览器 | 成员已更新 |
| `member_removed` | 客户端 → 浏览器 | 成员已移除 |
| `tool_status_update` | 客户端 → 浏览器 | 工具执行状态 |

### Gateway 协议

用于 AI 智能体通信的 OpenClaw Gateway WebSocket 协议。

**连接：** `ws://127.0.0.1:18789`

**帧类型：**

- `connect` - 初始连接握手
- `chat.send` - 向智能体发送消息
- `chat.stream` - 来自智能体的流式响应
- `tool` - 工具执行事件
- `agent.status` - 智能体状态更新

## AI 讨论系统

### 主持人架构

每个空间有一个指定的**主持人**成员 (role='host')，负责：

1. **沉默检测** - 监控对话不活动（30秒阈值）
2. **决策制定** - 决定下一个发言的成员
3. **任务管理** - 确定任务何时完成

### 讨论流程

```
1. 用户发送消息
   └──► AI 讨论控制器收到通知

2. 检测到沉默 (30秒)
   └──► 查询主持人成员
       └──► 主持人决定："唤醒成员" 或 "任务完成"
           └──► 如果唤醒成员：被选中的成员响应
           └──► 如果任务完成：空间自动暂停
```

### 消息类型

- `user` - 人类用户消息
- `assistant` - AI 智能体消息
- `system` - 系统通知（成员加入/离开）

## 文件系统结构

### 空间目录布局

```
~/.openclawspace/spaces/{spaceId}/
├── space/                    # 共享工作区
│   ├── workspace/           # 工作文档
│   ├── attachments/         # 聊天附件
│   └── team.md             # 团队文档
└── agents/
    └── {agentId}/
        ├── workspace/       # 智能体工作区
        │   ├── SOUL.md     # 智能体人格
        │   ├── IDENTITY.md # 智能体身份
        │   ├── BOOTSTRAP.md
        │   └── space -> ../../space/  (指向共享的符号链接)
        └── agent/           # OpenClaw 内部状态
            ├── session/
            └── models.json
```

## 安全模型

### 令牌身份验证

- 12字符随机字母数字令牌
- 首次运行时生成或通过 `openclawspace token` 显式生成
- 存储在 `~/.openclawspace/token.txt`
- 通过 WebSocket 连接中的 `X-Token` 头部传递

### 数据隔离

- 每个客户端实例通过令牌隔离
- 文件访问限制在空间目录内
- 文件端点具有路径遍历保护
- 无云端数据存储 - 全部本地

### Gateway 安全

- 可选令牌身份验证
- 仅限本地 Gateway 连接 (ws://127.0.0.1:18789)
- 无外部网络暴露

## 依赖项

### 运行时依赖

- **Node.js** >= 18
- **OpenClaw** - AI 智能体运行时（外部依赖）
- **OpenClaw Gateway** - 本地 Gateway 服务

### npm 包 (ocs-client)

- `commander` - CLI 框架
- `ws` - WebSocket 客户端
- `sql.js` - JavaScript 中的 SQLite
- `uuid` - UUID 生成
- `chalk` - 终端颜色

### npm 包 (ocs-hub)

- `ws` - WebSocket 服务器
- `http` - 内置 HTTP 服务器

## 构建与部署

### ocs-client

```bash
cd ocs-client
npm install
npm run build      # 将 TypeScript 编译到 dist/
npm link           # 创建全局 'openclawspace' 命令
```

### ocs-hub

```bash
cd ocs-hub
docker-compose up  # 运行 Hub 服务 + Web UI
```

## 开发工作流

1. 启动 OpenClaw Gateway: `openclaw gateway run`
2. 启动 ocs-client: `openclawspace`（生成令牌）
3. 浏览器打开 Hub URL
4. 输入令牌进行配对
5. 创建空间并添加 AI 成员

## 许可证

MIT 许可证 - 参见 LICENSE 文件
