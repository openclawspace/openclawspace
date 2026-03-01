# OpenClawSpace (开爪空间) 设计文档

> **版本**: v2.4 - 新增空间暂停/继续控制
> **日期**: 2026-02-28
> **目标**: Hub 云端服务 + Client 本地服务，Token 配对连接

---

## 1. 产品定义

### 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         Hub (云端)                           │
│              https://open-claw-space.args.fun               │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │      Hub Web        │    │       Hub Service           │ │
│  │    (网页界面)        │◄──►│    (WebSocket 中继)          │ │
│  │                     │    │                             │ │
│  │  React 静态页面      │    │  - Token 配对管理            │ │
│  │  - Token 输入页      │    │  - 消息中继 (Web↔Client)     │ │
│  │  - 创建空间页        │    │  - 不存储业务数据            │ │
│  │  - 聊天页           │    │                             │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           ▲                           ▲
           │                           │
           │ WebSocket (浏览器)         │ WebSocket (Client 连接)
           │                           │
           ▼                           ▼
┌─────────────────────┐         ┌─────────────────────────────┐
│       用户浏览器       │         │          Client            │
│                     │         │       (本地客户端)           │
│  输入 Token          │         │                             │
│  参与聊天            │         │  npm install -g ocs-client  │
└─────────────────────┘         │  - SQLite 本地存储           │
                                │  - OpenClaw Gateway         │
                                │  - 4个AI机器人               │
                                │  - 文件日志 (~/.ocs-client)  │
                                │  - 发起人身份系统            │
                                └─────────────────────────────┘
```

**核心设计**：
- Client 没有固定 IP，作为 **WebSocket 客户端** 主动连接 Hub
- Hub 用 **Token 配对**：相同 Token 的浏览器和 Client 被关联
- Hub 只负责消息中继，不存储业务数据
- 所有数据（空间、消息、成员）存在本地 SQLite
- **发起人**：真人用户在所有空间中拥有统一身份和最高权威

### 用户使用流程

```
1. npm install -g ocs-client
2. ocs-client
   → 输出: Token: abc123xyz
   → 显示: 用户身份: 发起人 (项目发起人)
   → 自动连接 Hub WebSocket
3. 浏览器打开 https://open-claw-space.args.fun
4. 输入 Token: abc123xyz
5. Hub 配对成功，开始创建AI团队
6. AI 团队自动讨论，用户以"发起人"身份参与
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
- OpenClaw Gateway 集成
- 文件日志系统

// 无本地端口暴露！
// Client 作为 WebSocket 客户端连接 Hub
```

**核心模块**:
- `cli.ts` - CLI 入口，初始化所有组件
- `hub-client.ts` - WebSocket 客户端，处理与 Hub 的通信
- `database.ts` - SQLite 数据库管理
- `space-manager.ts` - 空间/成员/消息管理
- `ai-discussion-controller.ts` - AI 自动讨论控制器
- `user-profile.ts` - 用户身份管理
- `logger.ts` - 文件日志系统
- `openclaw-client.ts` - OpenClaw Gateway 集成

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

## 12. 安全考虑

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

## 15. 未来扩展

- [ ] 支持多用户（多人同时连接同一个 Client）
- [ ] 支持自定义 Hub URL
- [ ] 支持更多 AI 模型
- [ ] 支持文件/图片上传
- [ ] 支持语音消息
- [ ] 支持导出聊天记录
- [ ] 支持 AI 成员头像自定义

---

**原则：先跑起来，再跑得好。**
