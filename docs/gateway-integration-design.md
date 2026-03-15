# ocs-client Gateway 集成设计文档

> **版本**: v2.1 - 添加数据隔离与安全机制
> **日期**: 2026-03-10
> **重要更新**: 新增第2章 "数据隔离与安全机制"
> **核心认知**: OpenClawSpace 是 OpenClaw 的一个消息渠道，和 WhatsApp、Telegram 等渠道地位相同

---

## 1. 架构定位

### 1.1 正确理解 OpenClawSpace 的位置

OpenClawSpace 不是 OpenClaw 的上层应用，而是 OpenClaw 的**一个消息渠道**。

**类比理解**：

```
OpenClaw 渠道家族:
├── WhatsApp Channel    → 用户在 WhatsApp App 中与 Agent 对话
├── Telegram Channel    → 用户在 Telegram 中与 Agent 对话
├── Slack Channel       → 用户在 Slack 中与 Agent 对话
├── Discord Channel     → 用户在 Discord 中与 Agent 对话
└── OpenClawSpace       → 用户在 Hub Web 页面中与 Agent 对话
    (通过 ocs-client 作为渠道适配器)
```

### 1.2 架构组件分工

| 组件 | 类型 | 位置 | 职责 |
|------|------|------|------|
| **Hub Web** | 渠道前端 | 云端 | 静态网页（React），提供 Token 输入、聊天界面、文件展示 |
| **Hub Service** | 消息中继 | 云端 | WebSocket 转发，不存储业务数据 |
| **ocs-client** | 渠道适配器 | 本地 | 作为 OpenClaw 的 Gateway 渠道，连接 Hub 和 OpenClaw Core |
| **OpenClaw Core** | AI 运行时 | 本地 | Agent 执行环境、工具调用、任务处理 |

### 1.3 和 WhatsApp 渠道的对比

| 维度 | WhatsApp 渠道 | OpenClawSpace 渠道 |
|------|---------------|-------------------|
| 用户界面 | WhatsApp App | Hub Web 网页 |
| 渠道适配器 | WhatsApp Channel (Baileys) | ocs-client |
| 连接方式 | WhatsApp WebSocket | Hub WebSocket + Gateway WebSocket |
| 数据存储 | 用户手机 | Client 本地 SQLite |
| 文件存储 | 手机本地 | ~/.ocs-client/spaces/ |
| **Agent 运行时** | **OpenClaw Core** | **OpenClaw Core** |
| **Agent 任务执行** | **完全相同** | **完全相同** |

**核心结论**：ocs-client 的本质是 OpenClaw 的**Gateway 渠道适配器**，负责将 Hub 的消息转发给 OpenClaw，并将 OpenClaw 的回复转发给 Hub。

---

## 2. 数据隔离与安全机制

**数据隔离是 OpenClawSpace 的第一等安全问题**。

### 2.1 设计原则

1. **一台机器一个 ocs-client**：同一台机器只运行一个 ocs-client 实例，使用一个 token
2. **跨机器隔离由 Hub Service 保证**：浏览器输入 token1，只能看到 machine1 的数据
3. **团队内隔离由 ocs-client 保证**：团队 A 的消息绝不出现在团队 B

### 2.2 跨机器隔离（Hub Service）

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

### 2.3 团队内隔离（ocs-client）

**问题**：同一 ocs-client 中有多个团队，如何防止 A 团队的消息显示在 B 团队？

**核心风险**：
- OpenClaw Gateway 中的 Agent 可能在后台继续运行
- 当团队被删除后，旧 Agent 仍可能发送消息
- 如果不过滤，旧消息会污染新团队

**解决方案**：sessionKey → spaceId 映射

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

### 2.4 验证检查清单

| 检查项 | 验证方法 | 预期结果 |
|--------|---------|---------|
| Token 隔离 | 浏览器输入 token1 | 只显示 machine1 的数据，machine2 数据不可见 |
| Space 隔离 | 在 Space A 发送消息 | Space B 看不到该消息 |
| 残留 Agent 隔离 | 删除 Space A，创建 Space B | 旧 Agent 消息不显示在新团队 |

---

## 3. 技术调研场景完整流程

### 2.1 场景描述

```
用户：请调研 React 19 新特性，并生成技术文档

Agent（鲁班-程序员）：
1. 开始调研...
2. [调用 browser 工具访问 React 19 官网]
3. [调用 read 工具阅读文档]
4. [生成技术文档到 workspace]
5. [调用 message 工具发送附件]

用户：在聊天窗口收到 React19-技术调研.md 文件
```

### 2.2 完整调用时序

```
阶段一：建立连接
========================

1. 用户启动 ocs-client
   - 生成 Token
   - 连接 Hub Service (WebSocket)
   - 等待浏览器配对

2. 用户打开 Hub Web 页面
   - 输入 Token
   - 浏览器与 ocs-client 通过 Hub 配对成功

3. ocs-client 作为渠道启动
   - 连接到 OpenClaw Gateway (本地 WebSocket)
   - 注册为 "gateway" 渠道客户端

阶段二：创建团队和 Agent
========================

4. 用户在 Hub Web 创建空间
   - 输入空间名称
   - 添加 AI 成员（CEO、产品经理、程序员、测试）

5. ocs-client 创建 Agent
   - 调用 OpenClaw CLI: agents add
   - 为每个成员创建独立 Agent
   - 设置 workspace 目录
   - Agent 的 SOUL.md 中包含渠道上下文

6. Agent 启动完成
   - 每个 Agent 在 OpenClaw Core 中初始化
   - 等待接收消息

阶段三：用户发送任务
========================

7. 用户在聊天窗口发送消息
   - 消息内容: "调研 React 19 新特性，生成技术文档"
   - 通过 Hub Service 转发给 ocs-client

8. ocs-client 接收消息
   - 构建入站消息上下文
   - 标记渠道为 "gateway"
   - 记录发送者为 "发起人"
   - 确定目标 Agent（如鲁班-程序员）

9. ocs-client 转发消息到 OpenClaw
   - 通过 Gateway WebSocket 发送 chat.send
   - 指定 Session Key（关联到特定 Agent）

10. OpenClaw 路由到 Agent
    - Gateway 将消息写入会话记录
    - 触发对应 Agent 运行

阶段四：Agent 自主执行任务
========================

11. Agent 接收任务
    - 从会话记录读取用户消息
    - 分析任务：调研 React 19 并生成文档

12. Agent 调用工具完成调研
    - 调用 browser 工具，打开浏览器
    - 访问 React 19 官方文档网站
    - 调用 read 工具，阅读文档内容
    - 分析新特性、API 变化、迁移指南

13. Agent 生成技术文档
    - 整理调研结果
    - 在 workspace 目录生成 Markdown 文件
    - 文件路径: ~/.ocs-client/spaces/{spaceId}/agents/{agentId}/space/workspace/documents/React19-技术调研.md

阶段五：Agent 发送结果
========================

14. Agent 调用 message 工具
    - 动作: sendAttachment
    - 参数:
      - mediaUrl: "./space/workspace/documents/React19-技术调研.md"
      - caption: "React 19 技术调研报告已完成"
    - 未显式指定 channel 参数

15. message 工具选择渠道
    - 检查显式 channel 参数: 无
    - 使用上下文回退: currentChannelProvider = "gateway"
    - 确定使用 Gateway 渠道

16. message 工具执行发送
    - 读取本地文件
    - 通过 Gateway 协议发送

17. Gateway 广播消息事件
    - 发送 `chat` 事件（payload 中包含 state: delta/final/error）
    - 包含附件信息和文件内容

18. ocs-client 接收消息事件
    - 从 Gateway WebSocket 接收 `chat` 事件
    - 根据 state 字段处理：delta（流式片段）、final（完成）、error（错误）
    - 解析消息内容和附件

19. ocs-client 保存附件
    - 将文件保存到 attachments 目录
    - 创建消息记录（SQLite）
    - 关联到对应空间和发送者

20. ocs-client 转发到 Hub
    - 通过 Hub WebSocket 发送 new_message 事件
    - 包含消息内容和附件元数据

21. Hub 广播到浏览器
    - 将消息转发到用户浏览器

22. 用户查看结果
    - 浏览器显示新消息
    - 显示附件: React19-技术调研.md
    - 用户可下载查看
```

---

## 4. 关键设计要点

### 3.1 ocs-client 作为渠道适配器

ocs-client 的核心职责是**适配器**，不是**控制器**：

**WhatsApp Channel 的职责**：
- 接收 WhatsApp 消息 → 转发给 OpenClaw
- 接收 OpenClaw 回复 → 发送到 WhatsApp

**ocs-client 的职责**：
- 接收 Hub 消息 → 转发给 OpenClaw Gateway
- 接收 Gateway 回复 → 发送到 Hub

**两者本质相同**，只是连接的外部服务不同。

### 3.2 Agent 的渠道无感知性

Agent 不知道自己通过哪个渠道与用户交互：

**接收消息时**：
- WhatsApp 渠道：通过 WhatsApp WebSocket 接收
- Gateway 渠道：通过 Gateway WebSocket 接收
- Agent 看到的都是统一的消息格式

**发送消息时**：
- Agent 调用 message 工具
- 工具根据上下文自动选择渠道
- Agent 不关心消息发到哪里

### 3.3 消息工具的路由机制

message 工具选择渠道的优先级：

1. **显式指定**
   - Agent 在调用时指定 channel 参数
   - 例如: `channel: "whatsapp"`

2. **上下文回退**（最常用）
   - 使用入站消息记录的 currentChannelProvider
   - WhatsApp 入站 → 自动回复到 WhatsApp
   - Gateway 入站 → 自动回复到 Gateway

3. **单一渠道**
   - 如果只配置了一个渠道，直接使用

在技术调研场景中，使用第 2 种方式，自动回复到原渠道。

### 3.4 文件存储架构

每个空间有独立的目录结构：

```
~/.ocs-client/spaces/{spaceId}/
├── agents/
│   └── {agentId}/              # 每个 Agent 的 workspace
│       ├── SOUL.md            # Agent 人格定义
│       └── space -> ../../space/  # 符号链接到共享目录
├── space/
│   ├── workspace/             # 团队协作文档
│   │   └── documents/         # Agent 生成的技术文档
│   │       └── React19-技术调研.md
│   └── attachments/           # 聊天附件
│       └── documents/         # 通过 message 工具发送的文件
└── ...
```

**文件流向**：
1. Agent 生成文档 → 保存到 workspace/
2. Agent 发送附件 → 复制到 attachments/
3. ocs-client 发送给 Hub → 浏览器可下载

---

## 5. 和 WhatsApp 场景的对比

### 4.1 流程对比

| 步骤 | WhatsApp 场景 | OpenClawSpace 场景 |
|------|---------------|-------------------|
| 用户界面 | WhatsApp App | Hub Web 页面 |
| 启动方式 | 配置 WhatsApp 账号 | 启动 ocs-client，输入 Token |
| 接收消息 | Baileys WebSocket | Hub WebSocket → ocs-client → Gateway |
| 消息路由 | WhatsApp Channel | Gateway Channel (ocs-client) |
| Agent 执行 | 在 Core 内部自主完成 | 在 Core 内部自主完成 |
| 发送文档 | message 工具 → WhatsApp | message 工具 → Gateway |
| 用户接收 | 手机收到文件 | 浏览器显示文件 |

### 4.2 关键相同点

1. **Agent 运行时相同**
   - 都在 OpenClaw Core 内部执行
   - 使用相同的工具（browser、read、write 等）
   - 相同的任务执行逻辑

2. **消息工具相同**
   - 都调用 message 工具的 sendAttachment 动作
   - 都通过上下文自动路由
   - Agent 代码无差异

3. **文件生成方式相同**
   - 都在 Agent workspace 生成文档
   - 都通过 message 工具发送

### 4.3 关键差异点

| 差异 | WhatsApp | OpenClawSpace |
|------|----------|---------------|
| 连接方式 | 直接连接 WhatsApp 服务器 | 通过 Hub 中继 |
| 数据持久化 | 消息存在手机 | 消息存在 Client SQLite |
| 多设备同步 | WhatsApp 自带 | 通过 Hub 实现 |
| 文件大小限制 | 受 WhatsApp 限制 | 受本地磁盘限制 |
| 使用场景 | 移动端为主 | 桌面端为主 |

---

## 6. 改造方案

### 5.1 核心改造思路

ocs-client 需要从"CLI 调用模式"改造为"Gateway 渠道模式"。

**当前模式（CLI）**：
```
用户消息 → Hub → ocs-client → CLI spawn → OpenClaw → stdout 返回
```

**目标模式（Gateway 渠道）**：
```
用户消息 → Hub → ocs-client → Gateway WebSocket → OpenClaw → 事件回调
```

### 5.2 新增模块

```
ocs-client/
├── src/
│   ├── gateway/
│   │   ├── gateway-client.ts      # Gateway WebSocket 客户端
│   │   ├── channel-adapter.ts     # Gateway 渠道适配器实现
│   │   ├── message-router.ts      # 消息路由处理
│   │   └── attachment-handler.ts  # 附件收发处理
│   │
│   ├── hub/
│   │   └── hub-client.ts          # Hub WebSocket 客户端（已有）
│   │
│   ├── openclaw/
│   │   └── cli.ts                 # CLI 调用（保留用于 Agent 管理）
│   │
│   └── index.ts                   # 初始化 Gateway 渠道
```

### 5.3 Gateway 渠道适配器实现

**职责**：
1. 连接到 OpenClaw Gateway（WebSocket）
2. 将 Hub 接收的消息转换为 Gateway 格式发送
3. 接收 Gateway 的 `chat` 事件（payload 包含 state: delta/final/error）
4. 将事件转换为 Hub 格式转发

**关键能力**：
- 不需要声明 tool-events 能力（这是控制 UI 的需求）
- 作为渠道，只需要标准的消息收发能力
- 通过 `chat.send` 发送用户消息
- 通过 `chat` 事件接收 Agent 回复（state: delta/final/error）

### 5.4 消息流转示例

**用户发送消息**：
```
Hub → ocs-client
    消息: { type: 'send_message', content: '调研 React 19' }

ocs-client → Gateway
    转换: { method: 'chat.send', sessionKey, message }

Gateway → OpenClaw Core
    路由到对应 Agent
```

**Agent 回复消息**：
```
OpenClaw Core → Gateway
    事件: { event: 'chat', state: 'delta'|'final'|'error', message, attachments }

Gateway → ocs-client
    接收事件，解析内容

ocs-client → Hub
    转换: { type: 'new_message', content, attachments }

Hub → 浏览器
    显示消息和附件
```

### 5.5 实施步骤

**Phase 1：Gateway 连接**
1. 实现 GatewayClient 模块（WebSocket 连接）
2. 实现协议帧解析（frames）
3. 测试与 Gateway 的基础连接

**Phase 2：消息收发**
1. 实现 chat.send 消息发送
2. 实现 chat 事件接收（state: delta/final/error）
3. 集成到现有 Hub 消息流程

**Phase 3：附件支持**
1. 实现附件接收（从 Gateway 到本地）
2. 实现附件发送（从本地到 Hub）
3. 测试文件传输

**Phase 4：渠道完善**
1. 实现群组消息支持
2. 实现消息历史同步
3. 实现断线重连

---

## 7. 总结

### 核心认知修正

**错误理解**：
- ocs-client 是 OpenClaw 的上层应用
- 需要通过 tool-events 接收 Agent 回调
- Agent 需要特殊适配才能支持 OpenClawSpace

**正确理解**：
- ocs-client 是 OpenClaw 的 Gateway 渠道适配器
- 和 WhatsApp Channel 地位相同
- Agent 完全无感知，使用标准 message 工具
- 不需要 tool-events，使用标准 chat 事件接收消息（state: delta/final/error）

### 设计原则

1. **渠道一致性**：OpenClawSpace 和 WhatsApp 是同一层级的渠道
2. **Agent 无感知**：Agent 不关心消息来自哪个渠道
3. **标准协议**：使用 OpenClaw Gateway 标准协议通信
4. **适配器模式**：ocs-client 只做转发，不做业务逻辑

### 最终实现效果

用户通过 Hub Web 使用 OpenClawSpace，体验应该和直接使用 WhatsApp 类似：

1. 发送任务消息
2. Agent 自主完成调研
3. 接收技术文档

唯一的区别是用户界面（浏览器 vs WhatsApp App），Agent 的行为和能力和使用 WhatsApp 时完全一致。

---

**文档版本**：v2.1
**作者**：Claude Code
**日期**：2026-03-10
**更新说明**：新增第2章 "数据隔离与安全机制"，详细说明不同 ocs-client 实例和不同团队之间的隔离方案
