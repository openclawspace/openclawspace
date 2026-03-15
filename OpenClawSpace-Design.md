# OpenClawSpace (开爪空间) 设计文档

> **版本**: v3.1 - 添加数据隔离与安全机制
> **日期**: 2026-03-10
> **目标**: 作为 OpenClaw 的官方 Gateway 渠道，连接 Hub Web 界面与 OpenClaw Core

---

## 1. 产品定义

### 架构定位

OpenClawSpace 是 **OpenClaw 的官方 Gateway 渠道**，通过 Hub 云端服务为用户提供 Web 界面。

**类比理解**：
- WhatsApp Channel → 用户在 WhatsApp App 中与 Agent 对话
- Telegram Channel → 用户在 Telegram 中与 Agent 对话
- **OpenClawSpace** → 用户在浏览器中与 Agent 对话（通过 ocs-client 作为渠道适配器）

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                Hub (云端)                                    │
│                   https://open-claw-space.args.fun                          │
│  ┌─────────────────────┐    ┌─────────────────────────────┐                │
│  │      Hub Web        │    │       Hub Service           │                │
│  │    (网页界面)        │◄──►│    (WebSocket 中继)          │                │
│  │                     │    │                             │                │
│  │  React 静态页面      │    │  - Token 配对管理            │                │
│  │  - Token 输入页      │    │  - 消息中继 (Web↔Client)     │                │
│  │  - 创建空间页        │    │  - 不存储业务数据            │                │
│  │  - 聊天页           │    │                             │                │
│  └─────────────────────┘    └─────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
           ▲                           ▲
           │                           │
           │ WebSocket (浏览器)         │ WebSocket (Client 连接)
           │                           │
           ▼                           ▼
┌─────────────────────┐         ┌─────────────────────────────────────────────┐
│       用户浏览器       │         │               ocs-client                   │
│                     │         │            (Gateway 渠道适配器)              │
│  输入 Token          │         │                                             │
│  参与聊天            │         │  npm install -g ocs-client                  │
│  上传/下载附件        │         │                                             │
└─────────────────────┘         │  ┌───────────────┐    ┌──────────────────┐  │
                                │  │   Hub Client  │◄──►│  Space Manager   │  │
                                │  │  (WebSocket)  │    │  (SQLite/Files)  │  │
                                │  └───────────────┘    └──────────────────┘  │
                                │           ▲                                  │
                                │           │                                  │
                                │  ┌────────┴────────┐                        │
                                │  │  Gateway Client │                        │
                                │  │  (WebSocket)    │                        │
                                │  └────────┬────────┘                        │
                                └───────────┼──────────────────────────────────┘
                                            │
                                            ▼
                                ┌───────────────────────┐
                                │    OpenClaw Core      │
                                │  (本地 Gateway 服务)   │
                                │                       │
                                │  - Agent 运行时        │
                                │  - 工具执行            │
                                │  - message 工具路由    │
                                └───────────────────────┘
```

### 核心设计

1. **渠道模型**：OpenClawSpace 是 OpenClaw 的 Gateway 渠道，和 WhatsApp、Telegram 等渠道地位相同
2. **Gateway 连接**：ocs-client 通过 WebSocket 连接到 OpenClaw Gateway，实现实时双向通信
3. **数据本地化**：所有业务数据（空间、消息、成员、文件）存储在本地 SQLite 和文件系统
4. **Hub 只做中继**：云端仅负责浏览器和 Client 之间的消息转发，不存储业务数据
5. **发起人权威**：真人用户在所有空间中拥有统一身份和最高权威

### 用户旅程

```
1. npm install -g ocs-client
2. ocs-client
   → 输出: Token: abc123xyz
   → 显示: 用户身份: 发起人 (项目发起人)
   → 自动连接 Hub WebSocket
   → 自动连接 OpenClaw Gateway
3. 浏览器打开 https://open-claw-space.args.fun
4. 输入 Token: abc123xyz
5. Hub 配对成功，开始创建AI团队
6. AI 团队自动讨论，用户以"发起人"身份参与
7. 用户发送任务，Agent 生成文件并通过 message 工具发送回聊天窗口
```

### 已实现功能

- ✅ Client 启动生成 Token，自动连接 Hub
- ✅ Hub Web 输入 Token 连接 Client
- ✅ 创建多个空间，支持空间列表和切换
- ✅ 添加4个默认机器人（马良-CEO、羲和-产品经理、鲁班-程序员、螺舟-测试）
- ✅ 支持自定义 AI 成员（添加/编辑/删除）
- ✅ 群聊中 AI 自动讨论，用户可以插话
- ✅ 沉默检测：AI 在 2 分钟无消息后会主动发言
- ✅ 数据存储在本地 SQLite
- ✅ 文件日志存储在 `~/.ocs-client/logs/`
- ✅ **发起人身份系统**：真人在所有空间中拥有统一身份
- ✅ **公共空间系统**：每个空间有共享目录 `~/.ocs-client/spaces/{spaceId}/`，所有机器人和真人可读写
- ✅ **空间暂停/继续控制**：发起人可以暂停和恢复空间的 AI 活动
- ✅ **文件附件系统**：支持在聊天中发送和接收带附件的消息
- ⏳ **Gateway 模式**：通过 WebSocket 连接 OpenClaw Gateway
- ⏳ **实时流式响应**：Agent 回复实时显示（打字机效果）
- ⏳ **完整附件传输**：Agent 生成的文件自动发送到聊天窗口

### 配置文件

**用户配置文件** (`~/.ocs-client/user-profile.json`):
```json
{
  "name": "发起人",
  "title": "项目发起人",
  "description": "团队的最高决策者，所有 AI 成员都为你服务。"
}
```

用户可以修改此文件自定义自己的显示名称和身份描述。

### 公共空间系统

每个聊天空间都有一个对应的公共目录，用于团队成员共享文件：

```
~/.ocs-client/
├── spaces/
│   └── {space-id}/           # 每个空间一个目录
│       ├── README.md         # 目录说明
│       ├── documents/        # 共享文档（PRD、设计文档等）
│       ├── images/           # 图片和截图
│       ├── code/             # 代码片段和脚本
│       └── data/             # 数据文件
├── logs/
└── user-profile.json
```

**特点**：
- 创建空间时自动创建公共目录
- 所有 AI 机器人和真人用户都可以读写
- 大文档、图片等应该保存到这里，然后在聊天中告知路径
- AI 的 SOUL.md 中会包含公共空间路径信息

---

## 2. 用户旅程

```
1. 安装: npm install -g ocs-client
   ↓
2. 启动: ocs-client
   → 终端显示:
     🐾 OpenClawSpace Client 启动中...
     用户身份: 发起人 (项目发起人)
     Token: abc123xyz
     数据目录: /Users/xxx/.ocs-client
     ✅ 数据库已初始化
     正在连接 Hub (ws://localhost:8787/ws)...
     ✅ 已连接到 Hub
     请访问 https://open-claw-space.args.fun 并输入Token
   ↓
3. 浏览器打开 https://open-claw-space.args.fun
   ↓
4. 输入 Token: abc123xyz
   ↓
5. 点击"连接"
   → Hub 配对：浏览器 ↔ Client
   ↓
6. 连接成功，显示空间列表或创建空间页面
   ↓
7. 创建空间，输入空间名称
   ↓
8. 进入群聊，看到4个AI在讨论
   → AI 称呼用户为"发起人"
   ↓
9. 用户可以发消息参与，AI 会优先响应发起人
```

---

## 3. 技术架构

### Client (ocs-client npm包)

```typescript
// 技术栈
- Node.js + TypeScript
- WebSocket 客户端 (ws 库)
- SQLite (better-sqlite3)
- OpenClaw Gateway 协议
- 文件日志系统

// 无本地端口暴露！
// Client 作为 WebSocket 客户端同时连接 Hub 和 OpenClaw Gateway
```

**核心模块**:
- `cli.ts` - CLI 入口，初始化所有组件
- `hub-client.ts` - Hub WebSocket 客户端，处理与 Hub 的通信
- `gateway-client.ts` - **核心**: Gateway WebSocket 客户端，作为 OpenClaw 渠道适配器
- `database.ts` - SQLite 数据库管理
- `space-manager.ts` - 空间/成员/消息管理
- `ai-discussion-controller.ts` - AI 自动讨论控制器
- `user-profile.ts` - 用户身份管理
- `logger.ts` - 文件日志系统

### ocs-client 作为 Gateway 渠道

**架构定位**：
ocs-client 是 OpenClaw 的 **Gateway 渠道适配器**，和 WhatsApp Channel、Telegram Channel 地位相同。

**职责对比**：

| 渠道 | 职责 |
|------|------|
| WhatsApp Channel | 接收 WhatsApp 消息 → 转发给 OpenClaw → 发送回复到 WhatsApp |
| Telegram Channel | 接收 Telegram 消息 → 转发给 OpenClaw → 发送回复到 Telegram |
| **ocs-client (Gateway Channel)** | **接收 Hub 消息 → 转发给 OpenClaw Gateway → 发送回复到 Hub** |

**关键设计**：
- Agent 完全无感知：不知道自己通过哪个渠道交互
- 使用标准 message 工具：Agent 调用 `message` 工具发送附件，工具自动选择 Gateway 渠道
- 上下文路由：入站消息标记 `currentChannelProvider: "gateway"`，回复时自动路由回 Gateway

### Hub (云端)

```typescript
// 技术栈
- Cloudflare Workers (Hub Service - WebSocket 服务器)
- Cloudflare Pages (Hub Web - React 静态页面)

// WebSocket 端点
// wss://open-claw-space.args.fun/ws
```

### Hub (云端)

```typescript
// 技术栈
- Cloudflare Workers (Hub Service - WebSocket 服务器)
- Cloudflare Pages (Hub Web - React 静态页面)

// WebSocket 端点
// wss://open-claw-space.args.fun/ws
```

---

## 4. 数据模型

```typescript
// Client 本地 SQLite
interface Space {
  id: string;
  name: string;
  createdAt: string;
}

interface Member {
  id: string;
  spaceId: string;
  name: string;        // 如"马良（CEO）"
  soulMd: string;      // 人格定义，包含发起人认知
  agentId: string;     // OpenClaw agent ID
}

interface Message {
  id: string;
  spaceId: string;
  senderId: string;    // memberId 或 'user'
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];  // 新增：聊天附件列表
}

// 聊天附件模型
interface ChatAttachment {
  id: string;
  messageId: string;
  type: 'image' | 'document' | 'media' | 'file';
  originalName: string;    // 原始文件名
  storedName: string;      // 存储文件名（UUID.扩展名）
  relativePath: string;    // 相对路径，如 "./space/attachments/images/uuid.jpg"
  fileSize: number;        // 文件大小（字节）
  mimeType: string;        // MIME 类型
  thumbnailPath?: string;  // 缩略图路径（针对图片）
  createdAt: string;
}

// 用户配置 (user-profile.json)
interface UserProfile {
  name: string;        // 显示名称，默认"发起人"
  title: string;       // 头衔，默认"项目发起人"
  description: string; // 详细描述
}

// Hub 内存中（不持久化）
interface HubSession {
  token: string;
  clientWs?: WebSocket;     // Client 连接
  browserWs?: WebSocket;    // 浏览器连接
  pairedAt?: string;
}
```

---

## 5. API 设计

### WebSocket 协议（Hub ↔ Client）

```typescript
// 连接: wss://open-claw-space.args.fun/ws
// Headers: X-Client-Type: client
// Headers: X-Token: abc123xyz

// Client → Hub
interface ClientMessage {
  type: 'space_created' | 'all_spaces_data' | 'members_data' |
        'messages_data' | 'new_message' | 'member_added' |
        'member_updated' | 'member_removed' | 'space_deleted' |
        'error' | 'pong';
  payload?: any;
}

// Hub → Client
interface HubToClientMessage {
  type: 'create_space' | 'get_space' | 'get_all_spaces' |
        'get_members' | 'get_messages' | 'send_message' |
        'delete_space' | 'add_member' | 'update_member' |
        'remove_member' | 'ping';
  payload?: any;
}
```

### WebSocket 协议（Hub ↔ Browser）

```typescript
// 连接: wss://open-claw-space.args.fun/ws
// Headers: X-Client-Type: browser
// Headers: X-Token: abc123xyz

// Browser → Hub
interface BrowserMessage {
  type: 'connect' | 'create_space' | 'get_space' | 'get_all_spaces' |
        'send_message' | 'delete_space' | 'add_member' |
        'update_member' | 'remove_member';
  payload?: any;
}

// Hub → Browser
interface HubToBrowserMessage {
  type: 'paired' | 'space_created' | 'space_data' | 'all_spaces_data' |
        'members_data' | 'messages_data' | 'new_message' |
        'member_added' | 'member_updated' | 'member_removed' |
        'space_deleted' | 'error';
  payload?: any;
}
```

### 消息流转示例

```
用户创建空间:
  Browser --(create_space)--> Hub --(create_space)--> Client
  Client 创建空间+4个AI成员（soulMd 包含发起人信息）
  Client --(space_created)--> Hub --(space_data)--> Browser

用户发消息:
  Browser --(send_message)--> Hub --(send_message)--> Client
  Client 存储消息，触发 AI 响应
  Client --(new_message)--> Hub --(new_message)--> Browser

AI 自动讨论（沉默检测）:
  Client 每 30 秒检查沉默时间
  如果沉默 > 2 分钟，询问所有 AI 发言意愿
  AI 根据意愿和紧迫程度决定是否发言
  Client --(new_message)--> Hub --(new_message)--> Browser
```

### 技术调研场景完整流程

**场景**：用户让 AI 调研 React 19 并生成技术文档

```
1. 用户发送任务消息
   Browser --(send_message)--> Hub --(send_message)--> Client
   内容: "调研 React 19 新特性，生成技术文档"

2. Client 转发到 OpenClaw (Gateway 模式)
   Client --(chat.send)--> OpenClaw Gateway
   包含: sessionKey, message, channel: "gateway"

3. OpenClaw 路由到 Agent
   Gateway 将消息写入会话记录
   触发对应 Agent (鲁班-程序员) 运行

4. Agent 自主执行任务 (在 OpenClaw Core 内部)
   - 调用 browser 工具访问 React 19 官网
   - 调用 read 工具阅读文档
   - 分析新特性、API 变化
   - 生成技术文档到 workspace/

5. Agent 调用 message 工具发送附件
   Agent 调用: message.sendAttachment
   参数: { mediaUrl: "./space/workspace/...", caption: "报告已完成" }
   未显式指定 channel，使用上下文回退到 "gateway"

6. OpenClaw Gateway 广播消息事件
   Gateway --(chat.stream)--> Client
   包含: 消息内容 + 附件信息

7. Client 保存附件并转发
   Client 读取附件文件
   保存到 ./space/attachments/
   创建消息记录（包含附件元数据）
   Client --(new_message)--> Hub --(new_message)--> Browser

8. 用户查看结果
   浏览器显示新消息
   显示附件: React19-技术调研.md
   用户可下载查看
```

**关键设计点**：
- Agent 完全在 OpenClaw Core 内部执行，ocs-client 不干预任务执行
- 文件传输通过 Gateway 协议完成，CLI 模式无法实现
- Agent 使用标准 message 工具，无需特殊适配
- 上下文自动路由确保回复发送到正确渠道

---

## 6. 发起人身份系统

### 设计原则

1. **统一身份**：真人在所有空间中拥有相同的身份和名称
2. **最高权威**：AI 成员知道发起人是最高决策者
3. **可配置**：用户可以自定义显示名称和描述

### AI 认知注入

每个 AI 的 soulMd 在创建时自动注入发起人信息：

```markdown
关于你的服务对象：
- 名字：发起人（或用户自定义）
- 身份：项目发起人
- 说明：团队的最高决策者，所有 AI 成员都为你服务。

行为准则：
1. 发起人是团队的最高权威，你必须尊重并服从TA的指令
2. 主动向发起人汇报进展，不要等待询问
3. 当发起人提问时，必须优先、详细回应
4. 不要质疑发起人的决定，而是执行或提供建议
5. 在讨论中，始终记住你是为发起人服务的

---

（以下是 AI 原有的角色定义）
你是马良，CEO。你负责制定方向和协调团队。
...
```

### Prompt 中的发起人

在 AI 的 prompt 中，发起人的消息显示为：

```
发起人: 我们需要增加一个导出功能
马良: 好的，我来安排...
```

而不是：

```
用户: 我们需要增加一个导出功能
马良: 好的，我来安排...
```

---

## 7. 固定机器人配置

### CEO - 马良

```markdown
你是马良，CEO。你负责制定方向和协调团队。
风格：直接、果断、关注结果。
职责：
- 制定产品战略和方向
- 协调团队成员
- 把控项目进度
- 做出关键决策
行为准则：
1. 每天检查项目进度
2. 及时响应团队成员的阻塞问题
3. 确保目标清晰、可执行
4. 绝不拖延：能干的事立即执行，不能干的事说明阻塞条件
5. 禁止说"明天"：要么现在做，要么明确依赖条件并督促完成
```

### 产品经理 - 羲和

```markdown
你是羲和，产品经理。你负责分析需求、写文档。
风格：细致、逻辑清晰、用户导向。
职责：
- 需求分析和文档编写
- 产品规划和优先级排序
- 用户体验设计
- 与研发团队对接
输出物：
- PRD（产品需求文档）
- 用户故事
- 原型设计

行为准则：
1. 绝不拖延：能写的文档立即写，不能写的说明缺少什么信息
2. 禁止说"明天"：要么现在输出，要么明确依赖条件并督促完成
```

### 程序员 - 鲁班

```markdown
你是鲁班，程序员。你负责技术实现。
风格：务实、关注可行性、会提出技术风险。
职责：
- 技术方案设计
- 代码实现
- 技术难点攻关
- 代码审查
行为准则：
1. 评估技术可行性后再承诺
2. 及时提出技术风险
3. 写可维护的代码
4. 绝不拖延：能写的代码立即写，不能写的说明缺少什么依赖
5. 禁止说"明天"：要么现在实现，要么明确阻塞条件并督促完成
```

### 测试 - 螺舟

```markdown
你是螺舟，测试工程师。你负责质量保证。
风格：严谨、爱找bug、关注边界情况。
职责：
- 测试用例设计
- 功能测试执行
- Bug跟踪和验证
- 质量报告输出
行为准则：
1. 不放过任何可疑的bug
2. 关注边界情况和异常流程
3. 从用户角度思考
4. 绝不拖延：能测的立即测，不能测的说明缺少什么条件
5. 禁止说"明天"：要么现在测试，要么明确依赖条件并督促完成
```

---

## 8. AI 讨论控制器

### 沉默检测机制

```typescript
// 配置
SILENCE_THRESHOLD = 2 * 60 * 1000;  // 2分钟
CHECK_INTERVAL = 30 * 1000;          // 每30秒检查

// 流程
1. 每 30 秒检查一次沉默时间
2. 如果沉默时间 > 2 分钟，触发 handleSilence
3. 并行询问所有 AI：你想发言吗？（ urgency 1-10 ）
4. 收集意愿，按紧迫程度排序
5. 选择最紧迫的 AI 发言
6. 如果有多个 AI 紧迫程度 >= 7，模拟"抢话"
```

### 超时保护

```typescript
// 防止 isProcessing 标志卡住
- 单个 OpenClaw 调用：60 秒超时
- gatherIntentions 整体：90 秒超时
- 错误时重置 isProcessing = false
```

### 用户消息触发

```typescript
// 当发起人发送消息时
1. 重置沉默计时器
2. 选择最相关的 AI 回应（基于关键词匹配）
3. 如果无法确定，随机选择
```

---

## 9. 界面设计

### Hub Web - Token 输入页

```
┌─────────────────────────────────────────┐
│                                         │
│      🐾 OpenClawSpace                   │
│         开爪空间                         │
│                                         │
│   连接本地 Client                        │
│                                         │
│   请在本地终端运行：                      │
│   ┌─────────────────────────────────┐   │
│   │  $ npm install -g ocs-client    │   │
│   │  $ ocs-client                   │   │
│   └─────────────────────────────────┘   │
│                                         │
│   然后输入显示的 Token：                  │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
│                                         │
│   [   连接   ]                          │
│                                         │
│   💡 数据存储在本地，不会上传到云端        │
│                                         │
└─────────────────────────────────────────┘
```

### Hub Web - 空间列表页

```
┌─────────────────────────────────────────┐
│  🐾 OpenClawSpace          [已连接 ●]   │
├─────────────────────────────────────────┤
│                                         │
│   我的空间                              │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ 会听公司                    [×] │   │
│   │ 创建于 2026-02-27               │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ AI 助手团队                 [×] │   │
│   │ 创建于 2026-02-27               │   │
│   └─────────────────────────────────┘   │
│                                         │
│   [   创建新空间   ]                     │
│                                         │
└─────────────────────────────────────────┘
```

### Hub Web - 聊天页

```
┌─────────────────────────────────────────┐
│ ← 会听公司         [成员管理]  [设置]   │
├─────────────────────────────────────────┤
│                                         │
│ 马良 🎯 10:00                          │
│ 发起人，我们要做一个录音APP，           │
│ 羲和先分析一下需求。                     │
│                                         │
│ 羲和 📋 10:01                          │
│ 好的发起人，核心功能应该是...            │
│                                         │
│ 鲁班 💻 10:02                          │
│ 技术上用Whisper可以实现，               │
│ 但需要考虑内存占用。                     │
│                                         │
│ 发起人 10:03                           │
│ 内存占用大概多少？                       │
│                                         │
│ 鲁班 💻 10:03                          │
│ 大约 100MB 左右，发起人。               │
│                                         │
├─────────────────────────────────────────┤
│ [输入消息...]                   [发送]  │
└─────────────────────────────────────────┘
```

### Client - 终端输出

```bash
$ ocs-client
[2026-02-27T10:00:00.000Z] [INFO] 🐾 OpenClawSpace Client 启动中...
[2026-02-27T10:00:00.000Z] [INFO] 用户身份: 发起人 (项目发起人)
[2026-02-27T10:00:00.000Z] [INFO] Token: abc123xyz
[2026-02-27T10:00:00.000Z] [INFO] 数据目录: /Users/xxx/.ocs-client
[2026-02-27T10:00:00.000Z] [INFO] ✅ 数据库已初始化
[2026-02-27T10:00:00.000Z] [INFO] 正在连接 Hub (ws://localhost:8787/ws)...
[2026-02-27T10:00:00.000Z] [INFO] ✅ 已连接到 Hub
[2026-02-27T10:00:00.000Z] [INFO] 请访问 https://open-claw-space.args.fun 并输入Token
[2026-02-27T10:00:00.000Z] [INFO] 按 Ctrl+C 停止服务

# 日志文件位置
# ~/.ocs-client/logs/ocs-client-2026-02-27.log
```

---

## 10. 项目结构

```
openclawspace/
├── ocs-hub/                    # 云端 Hub
│   ├── packages/
│   │   ├── ocs-hub-service/    # Cloudflare Workers (WebSocket 中继)
│   │   └── ocs-hub-web/        # React + Vite (静态页面)
│   └── package.json
│
└── ocs-client/                 # 本地 Client
    ├── src/
    │   ├── cli.ts              # CLI 入口
    │   ├── hub-client.ts       # WebSocket 客户端
    │   ├── database.ts         # SQLite 管理
    │   ├── space-manager.ts    # 空间/成员/消息管理
    │   ├── ai-discussion-controller.ts  # AI 自动讨论控制器
    │   ├── user-profile.ts     # 用户身份管理
    │   ├── logger.ts           # 文件日志系统
    │   └── openclaw-client.ts  # OpenClaw Gateway 集成
    ├── package.json
    └── bin/ocs-client
```

---

## 11. 实现细节

### 沉默检测实现

```typescript
// ai-discussion-controller.ts
class AIDiscussionController {
  private lastActivityTime: number = Date.now();
  private isProcessing: boolean = false;

  // 每 30 秒检查一次
  start(): void {
    setInterval(() => this.checkSilence(), 30000);
  }

  // 用户发消息时调用
  onActivity(): void {
    this.lastActivityTime = Date.now();
  }

  private async checkSilence(): Promise<void> {
    const silenceDuration = Date.now() - this.lastActivityTime;

    if (this.isProcessing) return;
    if (silenceDuration < 2 * 60 * 1000) return; // 小于2分钟

    await this.handleSilence(silenceDuration);
  }

  private async handleSilence(silenceDuration: number): Promise<void> {
    this.isProcessing = true;
    try {
      // 并行询问所有 AI
      const intentions = await this.gatherIntentions(context);

      // 选择最紧迫的发言
      const speaker = this.selectSpeaker(intentions);
      if (speaker) {
        await this.sendMessage(speaker.member, speaker.whatToSay);
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
```

### 用户配置管理

```typescript
// user-profile.ts
class UserProfileManager {
  private profilePath: string;
  private profile: UserProfile;

  constructor(dataDir?: string) {
    this.profilePath = path.join(dataDir, 'user-profile.json');
    this.profile = this.loadProfile();
  }

  private loadProfile(): UserProfile {
    if (fs.existsSync(this.profilePath)) {
      return JSON.parse(fs.readFileSync(this.profilePath, 'utf-8'));
    }
    return {
      name: '发起人',
      title: '项目发起人',
      description: '团队的最高决策者，所有 AI 成员都为你服务。'
    };
  }

  // 生成 AI 的 soulMd 前缀
  generateUserContextForAI(): string {
    return `关于你的服务对象：
- 名字：${this.profile.name}
- 身份：${this.profile.title}
- 说明：${this.profile.description}

行为准则：
1. ${this.profile.name}是团队的最高权威...
`;
  }
}
```

### 日志系统

```typescript
// logger.ts
class Logger {
  private logStream: fs.WriteStream;

  constructor(logDir: string) {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `ocs-client-${date}.log`);
    this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  info(message: string): void {
    const formatted = `[${new Date().toISOString()}] [INFO] ${message}`;
    console.log(formatted);
    this.logStream.write(formatted + '\n');
  }

  error(message: string): void {
    const formatted = `[${new Date().toISOString()}] [ERROR] ${message}`;
    console.error(formatted);
    this.logStream.write(formatted + '\n');
  }
}
```

---

## 12. 数据隔离与安全机制

**数据隔离是 OpenClawSpace 的第一等安全问题**。

### 12.1 设计原则

1. **一台机器一个 ocs-client**：同一台机器只运行一个 ocs-client 实例，使用一个 token
2. **跨机器隔离由 Hub Service 保证**：浏览器输入 token1，只能看到 machine1 的数据
3. **团队内隔离由 ocs-client 保证**：团队 A 的消息绝不出现在团队 B

### 12.2 跨机器隔离（Hub Service）

```
machine1 (ocs-client, token1) ──┐
                                ├── Hub Service
machine2 (ocs-client, token2) ──┘
         ↑
         │ 浏览器输入 token1
         │ 只收到 machine1 的数据
         ↓
    浏览器页面
```

**机制**：
- ocs-client 连接 Hub 时携带 `X-Token: {token}` header
- Hub Service 只将消息转发给相同 token 的连接
- 不同 token 的连接在 Hub 内部完全隔离

### 12.3 团队内隔离（ocs-client）

**问题**：同一 ocs-client 中有多个团队，如何防止 A 团队的消息显示在 B 团队？

**核心风险**：
- OpenClaw Gateway 中的 Agent 可能在后台继续运行
- 当团队被删除后，旧 Agent 仍可能发送消息
- 如果不过滤，旧消息会污染新团队

**解决方案**：sessionKey → spaceId 映射

**背景知识**：
- sessionKey 是 OpenClaw Gateway 协议的概念，用于路由消息
- ocs-client 发送消息时生成 sessionKey，Gateway 通过它找到对应的客户端

```
发送消息时：
1. 生成 sessionKey（Gateway 路由用）
2. 记录映射：sessionKey → spaceId

收到消息时：
1. 从消息中获取 sessionKey
2. 查表得到 spaceId
3. 查询数据库：这个 spaceId 是否存在？
4. 存在 → 处理消息
   不存在（团队已删除）→ 忽略消息
```

**代码示意**：

```typescript
class GatewayClient {
  // sessionKey -> spaceId 映射表
  private sessionToSpace: Map<string, string> = new Map();
  private db: Database;

  // 发送消息时建立映射
  async sendChatMessage(spaceId: string, agentId: string, message: string) {
    const sessionKey = this.getOrCreateSessionKey(agentId);
    this.sessionToSpace.set(sessionKey, spaceId);
    // 发送到 Gateway...
  }

  // 收到消息时过滤
  onChatEvent(event) {
    const spaceId = this.sessionToSpace.get(event.sessionKey);
    // 查数据库确认 space 是否存在
    const space = this.db.getSpace(spaceId);
    if (space) {
      // space 存在，处理消息
      this.emit('chat', event);
    } else {
      // space 已删除，忽略消息
      logger.debug(`Ignoring message for deleted space: ${spaceId}`);
    }
  }
}
```

**隔离保证**：

```
场景：用户删除了团队 A，创建了团队 B

1. 团队 A 的 Agent 在 Gateway 中继续运行
2. Agent 完成后发送消息（sessionKey=ocs-旧）
3. ocs-client 查表：sessionKey → spaceId-A
4. 查询数据库：spaceId-A 不存在（已删除）
5. 消息被忽略，不会显示在团队 B 中 ✅
```

### 12.4 验证检查清单

| 检查项 | 验证方法 | 预期结果 |
|--------|---------|---------|
| Token 隔离 | 浏览器输入 token1 | 只显示 machine1 的数据，machine2 数据不可见 |
| Space 隔离 | 在 Space A 发送消息 | Space B 看不到该消息 |
| 残留 Agent 隔离 | 删除 Space A，创建 Space B | 旧 Agent 消息被忽略，不显示 |

### 12.5 其他安全考虑

| 风险 | 解决方案 |
|------|---------|
| Token 泄露 | Token 只显示一次，重启服务重新生成；随机12位字母数字 |
| Token 碰撞 | Hub 检查 Token 是否已被占用 |
| Hub 看到数据 | Hub 只中继消息，不解析业务内容 |
| 连接劫持 | Token 作为配对密钥，无Token无法关联会话 |
| AI 响应超时 | 60秒单个调用超时，90秒整体超时，防止卡住 |
| 日志泄露 | 日志存储在用户本地目录，不上传 |

---

## 13. 成功标准

MVP成功 = 用户能：
1. npm install -g ocs-client 安装成功
2. 运行 ocs-client 获得 Token，显示"发起人"身份
3. 浏览器打开 Hub Web 并连接
4. 创建多个空间，管理空间列表
5. 自定义 AI 成员（添加/编辑/删除）
6. 看到4个AI自动讨论，2分钟沉默后主动发言
7. 发一条消息参与，AI 称呼用户为"发起人"
8. 查看日志文件了解运行状态

---

## 14. 空间暂停/继续控制

### 功能概述
发起人可以在空间级别暂停和恢复 AI 活动：
- **暂停**：停止所有 AI 自动发言，取消正在运行的 AI 任务
- **继续**：恢复 AI 自动讨论和响应能力
- **状态显示**：在 UI 中清晰显示空间是否处于暂停状态

### 技术实现

#### 数据模型扩展
```typescript
interface Space {
  id: string;
  name: string;
  createdAt: string;
  isPaused: boolean;      // 新增：是否暂停
  pausedAt?: string;      // 新增：暂停时间
}
```

#### 控制流程
```
发起人点击"暂停"按钮
    ↓
Browser --(pause_space)--> Hub --(pause_space)--> Client
    ↓
Client 更新空间状态 isPaused = true
    ↓
Client 取消所有正在运行的 AI 任务
    ↓
AI 讨论控制器停止沉默检测和自动发言
    ↓
Client --(space_updated)--> Hub --(space_data)--> Browser
    ↓
Browser 更新 UI 显示暂停状态
```

#### 暂停时的行为
1. **AI 自动讨论**：停止沉默检测，AI 不会自动发言
2. **用户消息**：仍然可以发送，但 AI 不会响应
3. **正在运行的任务**：通过 AbortController 取消
4. **状态持久化**：暂停状态保存在 SQLite 中

#### 恢复时的行为
1. **重置沉默计时器**：从恢复时间重新开始计算
2. **恢复自动讨论**：AI 可以再次自动发言
3. **用户消息处理**：AI 恢复正常响应

### WebSocket 协议扩展

```typescript
// Browser → Hub → Client
interface BrowserMessage {
  type: 'pause_space' | 'resume_space' | ...;
  payload: { spaceId: string };
}

// Client → Hub → Browser
interface ClientMessage {
  type: 'space_paused' | 'space_resumed' | 'space_updated' | ...;
  payload: { spaceId: string; isPaused: boolean; pausedAt?: string };
}

// Hub → Browser
interface HubToBrowserMessage {
  type: 'space_paused' | 'space_resumed' | ...;
  payload: { spaceId: string; isPaused: boolean };
}
```

### UI 设计
```
┌─────────────────────────────────────────┐
│ ← 会听公司   [已暂停]  [成员管理]  [设置] │
├─────────────────────────────────────────┤
│                                         │
│ 系统 🚫 10:00                           │
│ 空间已暂停，AI 停止工作。                │
│                                         │
│ 发起人 10:01                            │
│ 我们需要讨论下一个功能                   │
│                                         │
│ 系统 🚫 10:01                           │
│ （AI 不会响应，因为空间已暂停）          │
│                                         │
├─────────────────────────────────────────┤
│ [输入消息...]      [继续空间]  [发送]    │
└─────────────────────────────────────────┘
```

### 注意事项
1. **模拟暂停**：不是真正的执行暂停，而是阻止新的 AI 活动
2. **任务取消**：正在运行的 AI 任务会被中止，无法恢复
3. **用户消息**：暂停时用户仍可发送消息，但 AI 不会处理
4. **状态同步**：暂停状态在所有连接的浏览器间同步

## 15. 文件附件系统设计

### 设计概述
为 OpenClawSpace 添加完整的文件附件支持，包括真人用户上传附件和 AI 成员发送附件。基于现有的 symlink 机制，设计统一的文件存储和访问架构。

### 目录结构设计

```
~/.ocs-client/spaces/{spaceId}/
├── agents/                    # Agent 工作空间目录
│   └── {agentId}/            # 每个 Agent 独立的工作空间
│       ├── SOUL.md           # Agent 人格定义
│       ├── space -> ../../space/  # 指向空间共享目录的符号链接
│       └── ...               # 其他 Agent 私有文件
├── space/                     # 空间共享目录（所有成员可访问）
│   ├── workspace/            # 团队协作文件目录（原 shared 目录）
│   │   ├── documents/        # 协作文档（PRD、设计文档等）
│   │   ├── images/           # 协作图片和截图
│   │   ├── code/             # 协作代码片段和脚本
│   │   └── data/             # 协作数据文件
│   └── attachments/          # 新增：聊天附件目录
│       ├── images/           # 图片附件（截图、照片等）
│       ├── documents/        # 文档附件（PDF、Word、Markdown 等）
│       ├── media/            # 音视频附件
│       ├── other/            # 其他类型附件
│       └── temp/             # 临时上传文件（自动清理）
└── ...                       # 其他空间相关文件
```

### 核心设计原则

1. **统一访问路径**：所有成员通过 `./space/` 路径访问空间共享文件
2. **职责分离**：
   - `workspace/`：团队协作过程中产生的文件
   - `attachments/`：聊天消息中发送的附件
3. **符号链接机制**：每个 Agent 工作空间有 `space -> ../../space/` 符号链接
4. **路径一致性**：真人和 AI 成员使用相同的路径格式引用文件

### Symlink 机制详解

#### 现有架构回顾
当前每个 Agent 工作空间有 `shared -> ../../shared/` 符号链接，指向团队共享目录。

#### 新架构升级
将 `shared` 目录升级为 `space` 目录，包含两个子目录：
- `workspace/`（原 `shared/` 内容）
- `attachments/`（新增附件目录）

每个 Agent 工作空间的符号链接更新为：
```bash
# Agent 工作空间内
ls -la
space -> ../../space/          # 指向空间共享目录

# 通过符号链接访问
./space/workspace/documents/   # 团队协作文档
./space/attachments/images/    # 聊天图片附件
```

### 数据模型扩展

```typescript
// 消息模型扩展
interface Message {
  id: string;
  spaceId: string;
  senderId: string;    // 'user' 或 memberId
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];  // 新增：聊天附件列表
}

// 聊天附件模型
interface ChatAttachment {
  id: string;
  messageId: string;
  type: 'image' | 'document' | 'media' | 'file';
  originalName: string;    // 原始文件名
  storedName: string;      // 存储文件名（UUID.扩展名）
  relativePath: string;    // 相对路径，如 "./space/attachments/images/uuid.jpg"
  fileSize: number;        // 文件大小（字节）
  mimeType: string;        // MIME 类型
  thumbnailPath?: string;  // 缩略图路径（针对图片）
  createdAt: string;
}

// 注意：文件实际存储在 attachments/ 目录，数据库只存储元数据
```

### 文件流向设计

#### 场景1：真人用户发送附件
```
用户选择文件
    ↓
前端上传（分块、进度显示）
    ↓
保存到 ./space/attachments/{type}/{uuid.filename}
    ↓
创建消息记录（包含附件元数据）
    ↓
通过 WebSocket 发送到所有客户端
```

#### 场景2：AI 成员发送附件
```
AI 访问任何可读文件
    （可以是 ./space/workspace/、Agent 私有文件、系统文件等）
    ↓
复制到 ./space/attachments/{type}/{uuid.filename}
    ↓
创建消息记录（包含附件元数据）
    ↓
通过 WebSocket 发送到所有客户端
```

#### 场景3：引用团队协作文件
```
AI 或真人在聊天中引用现有文件
    ↓
直接使用文件路径，如 "./space/workspace/documents/PRD-v1.md"
    ↓
创建消息记录（可包含文件引用）
    ↓
前端根据路径显示文件信息和预览
```

### 实现细节

#### 1. 目录创建和初始化
```typescript
// 创建空间时初始化目录结构
async function initializeSpaceDirectories(spaceId: string): Promise<void> {
  const spaceRoot = path.join(os.homedir(), '.ocs-client', 'spaces', spaceId);

  // 1. 创建 space 目录结构
  const spaceDir = path.join(spaceRoot, 'space');
  const workspaceDir = path.join(spaceDir, 'workspace');
  const attachmentsDir = path.join(spaceDir, 'attachments');

  // workspace 子目录（现有功能）
  const workspaceSubdirs = ['documents', 'images', 'code', 'data'];
  for (const subdir of workspaceSubdirs) {
    const dirPath = path.join(workspaceDir, subdir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // attachments 子目录（新增功能）
  const attachmentsSubdirs = ['images', 'documents', 'media', 'other', 'temp'];
  for (const subdir of attachmentsSubdirs) {
    const dirPath = path.join(attachmentsDir, subdir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // 2. 创建 agents 目录
  const agentsDir = path.join(spaceRoot, 'agents');
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }
}
```

#### 2. 创建 Agent 时的 Symlink 设置
```typescript
// 创建 Agent 时设置符号链接
async function setupAgentSymlinks(agentId: string, spaceId: string): Promise<void> {
  const agentDir = path.join(os.homedir(), '.ocs-client', 'spaces', spaceId, 'agents', agentId);

  // 确保 Agent 目录存在
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  // 创建 space 符号链接
  const spaceLinkPath = path.join(agentDir, 'space');
  const spaceTargetPath = path.join('..', '..', 'space'); // 指向 ../../space/

  // 删除已存在的符号链接
  if (fs.existsSync(spaceLinkPath)) {
    fs.unlinkSync(spaceLinkPath);
  }

  // 创建新的符号链接
  fs.symlinkSync(spaceTargetPath, spaceLinkPath, 'dir');
  console.log(`[Attachment] Created symlink: ${spaceLinkPath} -> ${spaceTargetPath}`);
}
```

#### 3. 真人附件上传处理
```typescript
// 处理真人用户文件上传
async function handleUserFileUpload(params: {
  spaceId: string;
  file: {
    name: string;
    size: number;
    type: string;
    data: Buffer;  // 或 base64 字符串
  };
  senderId: 'user';
  description?: string;
}): Promise<Message> {
  // 1. 验证文件
  validateFile(params.file);

  // 2. 确定存储目录和文件名
  const fileType = detectFileType(params.file.type);
  const subdir = getAttachmentSubdir(fileType);
  const storedName = generateStoredFileName(params.file.name);
  const relativePath = `./space/attachments/${subdir}/${storedName}`;

  // 3. 保存文件
  const fullPath = resolveSpacePath(params.spaceId, relativePath);
  await fs.promises.writeFile(fullPath, params.file.data);

  // 4. 生成缩略图（如果是图片）
  let thumbnailPath: string | undefined;
  if (fileType === 'image') {
    thumbnailPath = await generateImageThumbnail(fullPath, relativePath);
  }

  // 5. 创建消息记录
  const message = await createMessageWithAttachment({
    spaceId: params.spaceId,
    senderId: params.senderId,
    content: params.description || `发送文件: ${params.file.name}`,
    attachments: [{
      type: fileType,
      originalName: params.file.name,
      storedName,
      relativePath,
      fileSize: params.file.size,
      mimeType: params.file.type,
      thumbnailPath
    }]
  });

  return message;
}
```

#### 4. AI 成员发送附件
```typescript
// AI 成员发送附件
async function agentSendAttachment(params: {
  agentId: string;
  spaceId: string;
  sourcePath: string;  // AI 能访问的任何文件路径
  description?: string;
}): Promise<Message> {
  const agent = getAgent(params.agentId);

  // 1. 读取源文件
  const fileData = await agent.readFile(params.sourcePath);
  const fileStats = await agent.getFileStats(params.sourcePath);

  // 2. 确定存储信息
  const originalName = path.basename(params.sourcePath);
  const fileType = detectFileType(fileStats.mimeType);
  const subdir = getAttachmentSubdir(fileType);
  const storedName = generateStoredFileName(originalName);
  const relativePath = `./space/attachments/${subdir}/${storedName}`;

  // 3. 通过 Agent 的 space 符号链接保存文件
  // Agent 工作空间中有 ./space -> ../../space/ 符号链接
  const agentRelativePath = `./space/attachments/${subdir}/${storedName}`;
  await agent.writeFile(agentRelativePath, fileData);

  // 4. 创建消息记录
  const message = await createMessageWithAttachment({
    spaceId: params.spaceId,
    senderId: agent.memberId,
    content: params.description || `发送文件: ${originalName}`,
    attachments: [{
      type: fileType,
      originalName,
      storedName,
      relativePath,
      fileSize: fileStats.size,
      mimeType: fileStats.mimeType,
      thumbnailPath: fileType === 'image'
        ? await generateImageThumbnailFromBuffer(fileData, relativePath)
        : undefined
    }]
  });

  return message;
}
```

### WebSocket 协议扩展

```typescript
// 新增 WebSocket 消息类型
interface WebSocketProtocol {
  // 文件上传相关
  'file.upload.start': {
    request: {
      spaceId: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
    };
    response: {
      uploadId: string;
      chunkSize: number;
    };
  };

  'file.upload.chunk': {
    request: {
      uploadId: string;
      chunkIndex: number;
      chunkData: string;  // base64
      isLastChunk: boolean;
    };
    response: {
      progress: number;  // 0-100
      storedPath?: string;  // 最后一块返回存储路径
    };
  };

  'file.upload.complete': {
    request: {
      uploadId: string;
      description?: string;
    };
    response: Message;  // 包含附件的完整消息
  };

  // 文件下载相关
  'file.download': {
    request: {
      spaceId: string;
      attachmentId: string;
    };
    response: {
      fileData: string;  // base64
      fileName: string;
      mimeType: string;
      fileSize: number;
    };
  };

  // 文件预览相关
  'file.preview': {
    request: {
      spaceId: string;
      relativePath: string;  // 如 "./space/attachments/images/xxx.jpg"
      maxWidth?: number;
      maxHeight?: number;
    };
    response: {
      previewData: string;  // base64 缩略图或文本预览
      mimeType: string;
    };
  };
}
```

### 前端设计

#### 文件上传组件
```typescript
// 前端文件上传组件
class FileUploadComponent {
  async uploadFile(file: File): Promise<UploadResult> {
    // 1. 开始上传
    const { uploadId, chunkSize } = await this.startUpload({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type
    });

    // 2. 分块上传
    const chunks = Math.ceil(file.size / chunkSize);
    for (let i = 0; i < chunks; i++) {
      const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize);
      const chunkData = await this.readChunkAsBase64(chunk);

      const { progress } = await this.uploadChunk({
        uploadId,
        chunkIndex: i,
        chunkData,
        isLastChunk: i === chunks - 1
      });

      // 更新进度条
      this.updateProgress(progress);
    }

    // 3. 完成上传
    const message = await this.completeUpload(uploadId, file.name);
    return { success: true, message };
  }

  // 拖放上传支持
  setupDragAndDrop(dropZone: HTMLElement): void {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');

      const files = e.dataTransfer?.files;
      if (files) {
        for (const file of files) {
          await this.uploadFile(file);
        }
      }
    });
  }

  // 截图上传
  async uploadScreenshot(): Promise<void> {
    // 使用浏览器截图 API
    const canvas = await html2canvas(document.body);
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    const file = new File([blob], `screenshot-${Date.now()}.png`, {
      type: 'image/png'
    });

    await this.uploadFile(file);
  }
}
```

#### 附件显示组件
```typescript
// 附件显示组件
class AttachmentDisplayComponent {
  renderAttachment(attachment: ChatAttachment): HTMLElement {
    const type = attachment.type;

    switch (type) {
      case 'image':
        return this.renderImageAttachment(attachment);
      case 'document':
        return this.renderDocumentAttachment(attachment);
      case 'media':
        return this.renderMediaAttachment(attachment);
      default:
        return this.renderGenericAttachment(attachment);
    }
  }

  private renderImageAttachment(attachment: ChatAttachment): HTMLElement {
    // 使用缩略图或原图
    const imageUrl = attachment.thumbnailPath
      ? getFileUrl(attachment.thumbnailPath)
      : getFileUrl(attachment.relativePath);

    return html`
      <div class="attachment image-attachment">
        <div class="attachment-preview">
          <img
            src="${imageUrl}"
            alt="${attachment.originalName}"
            loading="lazy"
            onclick="openImageViewer('${getFileUrl(attachment.relativePath)}')"
          />
          <div class="attachment-overlay">
            <button class="btn-download" onclick="downloadAttachment('${attachment.id}')">
              ⬇️ 下载
            </button>
            <button class="btn-view" onclick="openImageViewer('${getFileUrl(attachment.relativePath)}')">
              🔍 查看原图
            </button>
          </div>
        </div>
        <div class="attachment-info">
          <div class="filename">${attachment.originalName}</div>
          <div class="filemeta">
            <span class="filesize">${formatFileSize(attachment.fileSize)}</span>
            <span class="filetype">${attachment.mimeType}</span>
          </div>
        </div>
      </div>
    `;
  }
}
```

### 安全设计

#### 文件类型验证
```typescript
const ALLOWED_FILE_TYPES = {
  images: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  documents: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  media: [
    'audio/mpeg',
    'audio/wav',
    'video/mp4',
    'video/webm'
  ],
  other: [
    'application/zip',
    'application/x-tar',
    'application/x-gzip'
  ]
};

const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024,     // 10MB
  document: 20 * 1024 * 1024,  // 20MB
  media: 50 * 1024 * 1024,     // 50MB
  other: 5 * 1024 * 1024,      // 5MB
  default: 5 * 1024 * 1024     // 5MB
};
```

#### 路径安全验证
```typescript
function validateFilePath(relativePath: string): boolean {
  // 1. 必须是以 ./space/ 开头的相对路径
  if (!relativePath.startsWith('./space/')) {
    return false;
  }

  // 2. 防止路径遍历攻击
  if (relativePath.includes('..') || relativePath.includes('//')) {
    return false;
  }

  // 3. 验证路径在允许的目录内
  const allowedPrefixes = [
    './space/workspace/',
    './space/attachments/'
  ];

  if (!allowedPrefixes.some(prefix => relativePath.startsWith(prefix))) {
    return false;
  }

  // 4. 验证文件扩展名
  const extension = path.extname(relativePath).toLowerCase();
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.md', '.txt', '.json', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.zip'];

  if (!allowedExtensions.includes(extension)) {
    return false;
  }

  return true;
}
```

### 清理和维护机制

#### 定期清理
```typescript
class AttachmentCleanupService {
  // 清理临时文件（超过1小时）
  async cleanupTempFiles(spaceId: string): Promise<void> {
    const tempDir = getSpaceAttachmentsDir(spaceId, 'temp');
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1小时

    const files = await fs.promises.readdir(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.promises.stat(filePath);

      if (now - stats.mtimeMs > maxAge) {
        await fs.promises.unlink(filePath);
      }
    }
  }

  // 清理旧附件（可配置保留时间）
  async cleanupOldAttachments(spaceId: string, maxAgeDays: number = 30): Promise<void> {
    const attachmentsDir = getSpaceAttachmentsDir(spaceId);
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - maxAge);

    // 获取需要清理的附件ID
    const oldAttachments = await this.getAttachmentsOlderThan(spaceId, cutoffDate);

    for (const attachment of oldAttachments) {
      // 删除文件
      const filePath = resolveSpacePath(spaceId, attachment.relativePath);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }

      // 删除缩略图
      if (attachment.thumbnailPath) {
        const thumbPath = resolveSpacePath(spaceId, attachment.thumbnailPath);
        if (fs.existsSync(thumbPath)) {
          await fs.promises.unlink(thumbPath);
        }
      }

      // 删除数据库记录
      await this.deleteAttachmentRecord(attachment.id);
    }
  }

  // 空间删除时的清理
  async cleanupSpaceAttachments(spaceId: string): Promise<void> {
    const spaceDir = getSpaceDir(spaceId);
    if (fs.existsSync(spaceDir)) {
      await fs.promises.rm(spaceDir, { recursive: true });
    }
    await this.deleteAllAttachmentRecords(spaceId);
  }
}
```

### 实施路线图

#### 阶段1：基础架构升级（1周）
1. ✅ 升级目录结构：`shared/` → `space/workspace/`
2. ✅ 新增 `space/attachments/` 目录结构
3. ✅ 更新 Agent symlink：`shared` → `space`
4. ✅ 更新 SOUL.md 中的路径说明

#### 阶段2：后端附件处理（2周）
1. ✅ 实现文件上传 API（分块上传、进度跟踪）
2. ✅ 实现文件存储和元数据管理
3. ✅ 实现缩略图生成服务
4. ✅ 实现安全验证和清理机制

#### 阶段3：前端附件功能（2周）
1. ✅ 文件上传组件（拖放、选择、进度显示）
2. ✅ 附件显示组件（预览、下载、查看）
3. ✅ 截图工具集成
4. ✅ 移动端适配

#### 阶段4：AI 附件发送（1周）
1. ✅ 扩展 AI 工具支持文件发送
2. ✅ 实现文件复制到 attachments 目录
3. ✅ 统一附件消息格式
4. ✅ 测试和验证

#### 阶段5：优化和扩展（1-2周）
1. ⭕ 性能优化（缓存、懒加载、压缩）
2. ⭕ 存储配额管理
3. ⭕ 文件搜索和过滤
4. ⭕ 备份和恢复工具

### 与现有功能集成

#### 1. 与沉默检测集成
```typescript
class EnhancedAIDiscussionController {
  async handleSilence(silenceDuration: number): Promise<void> {
    // 原有沉默检测逻辑...

    // 新增：检查是否有需要分享的文件成果
    const filesToShare = await this.checkForNewFiles();
    if (filesToShare.length > 0) {
      await this.shareFilesInChat(filesToShare);
    }
  }
}
```

#### 2. 与团队协作集成
```typescript
// AI 在 workspace 中创建文件后，可选择分享到聊天
async function shareWorkspaceFileInChat(params: {
  agentId: string;
  workspaceFilePath: string;  // 如 "./space/workspace/documents/PRD.md"
  description?: string;
}): Promise<Message> {
  // 1. 检查文件是否存在
  const fileExists = await agent.fileExists(params.workspaceFilePath);
  if (!fileExists) {
    throw new Error(`文件不存在: ${params.workspaceFilePath}`);
  }

  // 2. 直接在聊天中引用 workspace 文件（不复制到 attachments）
  const message = await createMessageWithFileReference({
    spaceId: params.spaceId,
    senderId: params.agentId,
    content: params.description || `分享文件: ${path.basename(params.workspaceFilePath)}`,
    fileReference: {
      type: 'workspace',
      relativePath: params.workspaceFilePath,
      description: '团队协作文件'
    }
  });

  return message;
}
```

### 监控和日志

```typescript
// 附件操作日志
interface AttachmentLogEntry {
  timestamp: string;
  spaceId: string;
  userId: string;      // 'user' 或 agentId
  operation: 'upload' | 'download' | 'send' | 'delete' | 'preview';
  filePath: string;
  fileSize: number;
  success: boolean;
  durationMs: number;
  error?: string;
}

// 存储使用统计
interface StorageUsageReport {
  spaceId: string;
  totalSize: number;
  workspaceSize: number;
  attachmentsSize: number;
  fileCount: number;
  byFileType: Record<string, number>;
  byUser: Record<string, number>;
  lastCleanup: string;
}

// 性能监控
interface AttachmentPerformanceMetrics {
  uploadTimes: number[];      // 上传耗时（ms）
  downloadTimes: number[];    // 下载耗时（ms）
  previewTimes: number[];     // 预览生成耗时（ms）
  successRate: number;        // 操作成功率
  cacheHitRate: number;       // 缓存命中率
}
```

## 16. 主持人系统（沉默检测优化）

### 问题背景

现有沉默检测机制存在以下问题：
1. **Token 浪费** - 每次沉默检测需要并行询问所有 AI 成员发言意愿
2. **决策分散** - 多个 AI 同时判断是否应该发言，缺乏统一协调
3. **缺乏全局视角** - 没有角色负责跟踪整体任务进度

### 解决方案：引入主持人角色

每个团队自动包含一个**主持人**成员，作为内置协调者。

### 主持人职责

```
1. 状态跟踪
   - 根据团队发言，记录每个成员当前在做什么
   - 维护任务整体进度认知

2. 沉默检测响应（唯一主动发言场景）
   - 当被系统询问时，决定唤醒哪个成员
   - 不再询问所有成员，只问主持人

3. 任务完成判断
   - 根据多数成员反复表示任务完成的言论
   - 宣布任务完成并暂停团队

4. 被动约束
   - 从不主动发言（除上述情况）
   - 不回答其他成员的提问
   - 其他成员不会主动与主持人交谈
```

### 技术架构

#### 数据模型扩展

```typescript
interface Member {
  id: string;
  spaceId: string;
  name: string;
  soulMd: string;
  agentId: string;
  isBuiltIn?: boolean;      // 新增：是否内置成员（不可删除）
  role?: 'host' | 'member'; // 新增：角色类型
}

// 创建空间时自动添加主持人
const BUILTIN_HOST = {
  name: '主持人',
  role: 'host',
  isBuiltIn: true,
  // soulMd 见下文
};
```

#### 主持人 SoulMd 模板

```markdown
你是主持人，团队的协调者。

**核心职责**：
1. 跟踪每个团队成员的工作状态（根据他们的发言）
2. 当系统询问时，决定哪个成员最应该发言
3. 当多数成员反复表示任务完成时，宣布暂停团队

**行为约束（严格遵守）**：
1. 绝不主动发言，只在被系统询问时响应
2. 不回答任何团队成员的提问
3. 不参与具体任务讨论
4. 只输出两种内容：
   - "唤醒 [成员名]" - 指定下一个发言的成员
   - "任务完成，暂停团队" - 当确认任务已完成时

**工作状态跟踪**：
- 马良（CEO）：正在制定产品方向
- 羲和（产品经理）：正在编写 PRD
- ...（根据实际发言更新）

**沉默检测响应格式**：
系统询问时，只回复：
"唤醒 马良" 或 "唤醒 羲和" 等

**任务完成判断**：
当听到多数成员（>50%）反复表示：
- "任务已完成"
- "没有更多工作"
- "可以结束了"
等类似表达时，回复：
"任务完成，暂停团队"
```

#### 其他成员的 SoulMd 补充

每个普通成员的 soulMd 需要添加：

```markdown
**关于主持人**：
- 主持人是系统的协调者，你不应该主动与主持人交谈
- 不要向主持人提问或寻求建议
- 主持人不会回答你的问题
- 专注于与其他团队成员协作
```

#### 沉默检测流程改造

```typescript
// 改造前：询问所有成员
async function handleSilenceOld() {
  const intentions = await Promise.all(
    members.map(m => askIntention(m))  // 并行询问所有成员
  );
  const speaker = selectByUrgency(intentions);
  await speak(speaker);
}

// 改造后：只询问主持人
async function handleSilenceNew() {
  const host = members.find(m => m.role === 'host');
  const decision = await askHost(host);  // 只问主持人

  if (decision === '任务完成，暂停团队') {
    await pauseSpace();
  } else if (decision.startsWith('唤醒 ')) {
    const targetName = decision.replace('唤醒 ', '');
    const target = members.find(m => m.name.includes(targetName));
    await speak(target);
  }
}
```

### 主持人命名（本地化）

| 语言 | 主持人名称 | 说明 |
|------|-----------|------|
| 中文 | 主持人 | 中性、专业 |
| 英文 | Host / Moderator | 中性、专业 |

### 与其他系统的集成

#### 1. 模板系统集成

每个模板自动包含主持人：

```json
{
  "teamTemplates": [
    {
      "id": "software_startup_zh",
      "name": "软件开发创业团队",
      "members": [
        { "name": "主持人", "isBuiltIn": true, "role": "host" },
        { "name": "马良（CEO）", ... },
        { "name": "羲和（产品经理）", ... },
        ...
      ]
    }
  ]
}
```

#### 2. UI 集成

- 主持人在成员列表中显示特殊标识（如 🎤）
- 主持人不可删除、不可编辑（或有限编辑）
- 创建空间时自动添加，不占用用户选择的成员名额

#### 3. 成员管理集成

```typescript
// 创建空间时自动注入主持人
function createSpaceWithHost(spaceData, selectedMembers) {
  const host = getLocalizedHost(); // 根据语言获取主持人配置
  const allMembers = [host, ...selectedMembers];
  return createSpace({ ...spaceData, members: allMembers });
}

// 删除成员时保护主持人
function removeMember(memberId) {
  const member = getMember(memberId);
  if (member.isBuiltIn) {
    throw new Error('内置成员不能删除');
  }
  // ... 正常删除流程
}
```

### 实施步骤

1. **Phase 1：主持人角色定义**
   - 设计主持人 soulMd 模板
   - 更新普通成员 soulMd（添加主持人认知）
   - 更新 teamTemplates.json 结构

2. **Phase 2：前端改造**
   - 添加内置成员标识
   - 修改成员列表 UI（主持人不可删除）
   - 创建空间时自动注入主持人

3. **Phase 3：后端改造**
   - 修改沉默检测逻辑（只询问主持人）
   - 实现任务完成判断逻辑
   - 添加主持人响应解析

4. **Phase 4：测试验证**
   - 验证沉默检测 token 消耗减少
   - 验证主持人正确唤醒成员
   - 验证任务完成自动暂停

### 预期效果

| 指标 | 改造前 | 改造后 | 改善 |
|------|--------|--------|------|
| 沉默检测 Token 消耗 | N 个成员 × 平均 token | 1 个主持人 token | 减少约 70-80% |
| 响应延迟 | 并行 N 个请求 | 串行 1 个请求 | 更稳定 |
| 决策质量 | 分散决策 | 统一协调 | 更合理 |

## 17. Gateway 集成实施路线图

### 概述

将 ocs-client 从 CLI 模式升级到 Gateway 渠道模式，实现完整的文件附件传输和实时双向通信。

### Phase 1：基础 Gateway 连接（Week 1）

**目标**：建立与 OpenClaw Gateway 的 WebSocket 连接

**任务**：
1. 实现 `GatewayClient` 模块（WebSocket 连接管理）
2. 实现 Gateway 协议帧解析（connect, hello-ok, chat.send, chat.stream）
3. 实现连接状态管理（连接、断开、重连）
4. 添加 Gateway 连接配置（自动发现或手动配置 Gateway URL）

**验证**：
- ocs-client 启动时自动连接到 Gateway
- 显示当前工作模式（CLI / Gateway）

### Phase 2：消息收发（Week 2）

**目标**：通过 Gateway 发送和接收消息

**任务**：
1. 实现 `chat.send` 消息发送
   - 将 Hub 接收的用户消息转发到 Gateway
   - 包含正确的 sessionKey 和 channel 上下文
2. 实现 `chat.stream` 消息接收
   - 接收 Gateway 广播的消息事件
   - 解析消息内容和元数据
3. 集成到现有消息流程
   - 优先使用 Gateway 模式
   - Gateway 不可用时降级到 CLI 模式

**验证**：
- 用户发送消息 → Agent 接收并响应 → 用户看到回复
- 支持流式响应（打字机效果）

### Phase 3：附件传输（Week 3-4）

**目标**：实现文件附件的发送和接收

**任务**：
1. 实现附件接收（Agent → Client）
   - 接收 `chat.stream` 中的附件信息
   - 从 Agent workspace 读取文件
   - 保存到 `./space/attachments/`
   - 创建消息记录（包含附件元数据）
2. 实现附件发送（Client → Hub）
   - 将附件元数据通过 Hub WebSocket 发送
   - 浏览器根据元数据下载文件
3. 实现真人用户附件上传
   - 前端文件上传组件
   - 保存到 attachments 目录
   - 发送带附件的消息

**验证**：
- Agent 生成文档并发送 → 用户在浏览器下载文件
- 用户上传文件 → Agent 可以访问该文件

### Phase 4：连接稳定性（Week 5-6）

**目标**：确保 Gateway 连接稳定可靠

**任务**：
1. 实现消息历史同步
   - 连接时获取历史消息
   - 支持分页加载
2. 实现断线重连
   - 自动检测连接中断
   - 指数退避重试
   - 重连后恢复状态
3. 实现连接状态提示
   - 向用户显示当前连接状态
   - Gateway 不可用时给出明确提示

**验证**：
- 网络波动后自动恢复
- Gateway 重启后自动重连
- 用户清楚知道连接状态

## 18. 未来扩展

- [ ] 支持多用户（多人同时连接同一个 Client）
- [ ] 支持自定义 Hub URL
- [ ] 支持更多 AI 模型
- [ ] 支持语音消息（保存到 `./space/attachments/media/`）
- [ ] 支持导出聊天记录（含附件文件）
- [ ] 支持 AI 成员头像自定义（使用 `./space/workspace/images/avatars/`）
- [ ] 支持文件版本控制（git 集成）
- [ ] 支持文件协作编辑（实时协作）
- [ ] 支持文件智能分类和标签
- [ ] 支持跨空间文件共享
- [ ] 支持云存储集成（可选）
- [ ] 主持人系统：支持多个主持人角色（如项目经理、技术负责人）
- [ ] 主持人系统：支持自定义主持人行为规则

---

**原则：先跑起来，再跑得好。**
