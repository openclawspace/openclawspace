# OpenClaw Gateway 协议规范

## 1. 协议概述

OpenClaw Gateway 使用 WebSocket 作为传输层，采用 JSON 格式进行通信。协议支持请求-响应模式和事件订阅模式。

**连接地址**: `ws://127.0.0.1:18789` (默认)

## 2. 基础帧结构

所有消息都包装在顶层帧结构中：

```typescript
interface GatewayFrame {
  type: "req" | "res" | "event" | "hello-ok";
  // 根据 type 不同，包含不同字段
}
```

### 2.1 请求帧 (RequestFrame)

客户端发送请求：

```typescript
{
  type: "req",
  id: string;        // 请求唯一ID (用于匹配响应)
  method: string;    // 方法名
  params?: unknown;  // 请求参数
}
```

### 2.2 响应帧 (ResponseFrame)

服务器返回响应：

```typescript
{
  type: "res",
  id: string;           // 对应请求的ID
  ok: boolean;          // 是否成功
  payload?: unknown;    // 成功时的返回数据
  error?: ErrorShape;   // 失败时的错误信息
}
```

### 2.3 事件帧 (EventFrame)

服务器主动推送事件：

```typescript
{
  type: "event",
  event: string;        // 事件名称
  payload?: unknown;    // 事件数据
  seq?: number;         // 序列号(递增)
  stateVersion?: {      // 状态版本
    presence?: number;
    health?: number;
  };
}
```

### 2.4 错误结构

```typescript
interface ErrorShape {
  code: string;           // 错误码
  message: string;        // 错误消息
  details?: unknown;      // 详细信息
  retryable?: boolean;    // 是否可重试
  retryAfterMs?: number;  // 建议重试间隔
}
```

## 3. 连接流程

### 3.1 连接挑战

WebSocket 连接建立后，服务器立即发送：

```typescript
{
  type: "event",
  event: "connect.challenge",
  payload: {
    nonce: string;  // 随机字符串
    ts: number;     // 时间戳
  }
}
```

### 3.2 连接请求

客户端发送 `connect` 请求：

```typescript
{
  type: "req",
  id: "connect-1",
  method: "connect",
  params: {
    minProtocol: 3,      // 最小协议版本
    maxProtocol: 3,      // 最大协议版本
    client: {
      id: string;         // 客户端ID
      version: string;    // 客户端版本
      platform: string;   // 平台(darwin/linux/win32)
      mode: string;       // 模式(frontend/backend/headless)
    },
    role?: string;        // 角色(operator/admin)
    scopes?: string[];    // 权限范围
    caps?: string[];      // 能力列表
    auth?: { token?: string };  // 认证令牌
  }
}
```

### 3.3 连接成功

服务器返回 `hello-ok`：

```typescript
{
  type: "hello-ok",
  protocol: 3,
  server: {
    version: string;
    connId: string;      // 连接ID
  },
  features: {
    methods: string[];   // 支持的方法列表
    events: string[];    // 支持的事件列表
  },
  snapshot: Snapshot,    // 运行时快照
  policy: {
    maxPayload: number;        // 最大负载
    maxBufferedBytes: number;  // 最大缓冲字节
    tickIntervalMs: number;    // tick间隔
  }
}
```

## 4. 方法列表 (RPC Methods)

### 4.1 系统方法

| 方法 | 说明 | 参数 | 返回 |
|------|------|------|------|
| `connect` | 建立连接 | ConnectParams | HelloOk |
| `system-presence` | 获取在线状态 | - | SystemPresence[] |
| `system-event` | 发送系统事件 | { text, ... } | { ok: true } |
| `last-heartbeat` | 获取最后一次心跳 | - | HeartbeatEvent |
| `set-heartbeats` | 设置心跳开关 | { enabled: boolean } | { ok: true } |
| `shutdown` | 关闭Gateway | - | - |

### 4.2 聊天方法

| 方法 | 说明 | 参数 |
|------|------|------|
| `chat.send` | 发送消息 | ChatSendParams |
| `chat.history` | 获取历史记录 | { sessionKey, limit? } |
| `chat.abort` | 中断聊天 | { sessionKey, runId? } |
| `chat.inject` | 注入消息 | { sessionKey, message, label? } |

**ChatSendParams**:
```typescript
{
  sessionKey: string;      // 会话标识符
  message: string;         // 用户消息
  idempotencyKey: string;  // 幂等键
  timeoutMs?: number;      // 超时时间
  thinking?: string;       // 思考级别
  deliver?: boolean;       // 是否投递到外部渠道
  attachments?: unknown[]; // 附件
}
```

**返回**:
```typescript
{
  runId: string;      // 运行ID
  sessionKey: string; // 会话标识符
}
```

### 4.3 Agent 管理方法

| 方法 | 说明 |
|------|------|
| `agent` | Agent 相关操作 |
| `agent.wait` | 等待Agent完成 |
| `agents.list` | 列出所有Agent |
| `agents.create` | 创建Agent |
| `agents.update` | 更新Agent |
| `agents.delete` | 删除Agent |
| `agents.files.list` | 列出Agent文件 |
| `agents.files.get` | 获取Agent文件 |
| `agents.files.set` | 设置Agent文件 |

### 4.4 会话管理方法

| 方法 | 说明 |
|------|------|
| `sessions.list` | 列会话 |
| `sessions.preview` | 预览会话 |
| `sessions.resolve` | 解析会话 |
| `sessions.patch` | 修补会话 |
| `sessions.reset` | 重置会话 |
| `sessions.delete` | 删除会话 |
| `sessions.compact` | 压缩会话 |
| `sessions.usage` | 会话使用情况 |

### 4.5 节点方法

| 方法 | 说明 |
|------|------|
| `node.list` | 列出节点 |
| `node.describe` | 描述节点 |
| `node.event` | 发送节点事件 |
| `node.invoke` | 调用节点 |
| `node.invoke.result` | 返回调用结果 |
| `node.pending.ack` | 确认待处理 |
| `node.pending.drain` | 排空待处理 |
| `node.pending.enqueue` | 加入待处理队列 |

### 4.6 节点配对方法

| 方法 | 说明 |
|------|------|
| `node.pair.request` | 请求配对 |
| `node.pair.list` | 列出配对请求 |
| `node.pair.approve` | 批准配对 |
| `node.pair.reject` | 拒绝配对 |
| `node.pair.verify` | 验证配对 |

### 4.7 设备配对方法

| 方法 | 说明 |
|------|------|
| `device.pair.list` | 列出设备配对 |
| `device.pair.approve` | 批准设备配对 |
| `device.pair.reject` | 拒绝设备配对 |
| `device.pair.remove` | 移除设备配对 |

### 4.8 设备令牌方法

| 方法 | 说明 |
|------|------|
| `device.token.rotate` | 轮换令牌 |
| `device.token.revoke` | 撤销令牌 |

### 4.9 配置方法

| 方法 | 说明 |
|------|------|
| `config.get` | 获取配置 |
| `config.set` | 设置配置 |
| `config.apply` | 应用配置 |
| `config.patch` | 补丁配置 |
| `config.schema` | 获取配置模式 |
| `config.schema.lookup` | 查找配置模式 |

### 4.10 模型方法

| 方法 | 说明 |
|------|------|
| `models.list` | 列出模型 |

### 4.11 技能方法

| 方法 | 说明 |
|------|------|
| `skills.status` | 技能状态 |
| `skills.bins` | 技能仓库 |
| `skills.install` | 安装技能 |
| `skills.update` | 更新技能 |

### 4.12 工具方法

| 方法 | 说明 |
|------|------|
| `tools.catalog` | 工具目录 |

### 4.13 定时任务方法

| 方法 | 说明 |
|------|------|
| `cron.list` | 列出定时任务 |
| `cron.status` | 定时任务状态 |
| `cron.add` | 添加定时任务 |
| `cron.update` | 更新定时任务 |
| `cron.remove` | 移除定时任务 |
| `cron.run` | 运行定时任务 |
| `cron.runs` | 定时任务运行记录 |

### 4.14 执行审批方法

| 方法 | 说明 |
|------|------|
| `exec.approvals.get` | 获取审批状态 |
| `exec.approvals.set` | 设置审批状态 |
| `exec.approvals.node.get` | 获取节点审批 |
| `exec.approvals.node.set` | 设置节点审批 |
| `exec.approval.request` | 请求审批 |
| `exec.approval.waitDecision` | 等待审批决定 |
| `exec.approval.resolve` | 解决审批 |

### 4.15 日志方法

| 方法 | 说明 |
|------|------|
| `logs.tail` | 获取日志 |

### 4.16 推送测试方法

| 方法 | 说明 |
|------|------|
| `push.test` | 测试推送 |

### 4.17 向导方法

| 方法 | 说明 |
|------|------|
| `wizard.start` | 启动向导 |
| `wizard.next` | 下一步 |
| `wizard.cancel` | 取消向导 |
| `wizard.status` | 向导状态 |

### 4.18 对话方法

| 方法 | 说明 |
|------|------|
| `talk.mode` | 对话模式 |
| `talk.config` | 对话配置 |

### 4.19 渠道方法

| 方法 | 说明 |
|------|------|
| `channels.status` | 渠道状态 |
| `channels.logout` | 渠道登出 |

### 4.20 Web登录方法

| 方法 | 说明 |
|------|------|
| `web.login.start` | 开始Web登录 |
| `web.login.wait` | 等待Web登录 |

### 4.21 Secret方法

| 方法 | 说明 |
|------|------|
| `secrets.resolve` | 解析Secret |

## 5. 事件列表

### 5.1 系统事件

| 事件 | 说明 | Payload |
|------|------|---------|
| `connect.challenge` | 连接挑战 | `{ nonce: string, ts: number }` |
| `tick` | 周期保活 | `{ ts: number }` |
| `shutdown` | 服务关闭 | `{ reason: string, restartExpectedMs?: number }` |
| `health` | 健康状态 | HealthSummary |
| `presence` | 在线状态 | `{ presence: SystemPresence[] }` |
| `heartbeat` | 心跳事件 | HeartbeatEvent |

### 5.2 聊天事件

| 事件 | 说明 |
|------|------|
| `chat` | 聊天流事件 |

**ChatEvent 结构**:
```typescript
{
  runId: string;           // 运行ID
  sessionKey: string;      // 会话标识符
  seq: number;             // 序列号
  state: "delta" | "final" | "aborted" | "error";
  message?: {
    role: "assistant";
    content: Array<{ type: "text", text: string }>;
    timestamp: number;
  };
  errorMessage?: string;
  usage?: unknown;
  stopReason?: string;
}
```

**State 说明**:
- `delta`: 流式增量更新，message 包含当前累积的完整文本
- `final`: 正常结束，message 包含最终文本(可能为空)
- `aborted`: 被中断，可能包含部分文本
- `error`: 发生错误，通过 errorMessage 说明

### 5.3 Agent 事件

| 事件 | 说明 |
|------|------|
| `agent` | Agent 执行事件 |

**AgentEvent 结构**:
```typescript
{
  runId: string;
  stream: "assistant" | "tool" | "lifecycle" | "error";
  seq: number;
  ts: number;
  sessionKey?: string;
  data?: {
    phase?: "start" | "end" | "error";
    text?: string;        // assistant 文本
    delta?: string;       // 增量文本
    tool?: string;        // 工具名
    // ... 工具相关数据
  };
}
```

### 5.4 执行审批事件

| 事件 | 说明 | 所需Scope |
|------|------|-----------|
| `exec.approval.requested` | 审批请求 | `operator.approvals` |
| `exec.approval.resolved` | 审批解决 | `operator.approvals` |

### 5.5 设备配对事件

| 事件 | 说明 | 所需Scope |
|------|------|-----------|
| `device.pair.requested` | 设备配对请求 | `operator.pairing` |
| `device.pair.resolved` | 设备配对完成 | `operator.pairing` |

### 5.6 节点配对事件

| 事件 | 说明 | 所需Scope |
|------|------|-----------|
| `node.pair.requested` | 节点配对请求 | `operator.pairing` |
| `node.pair.resolved` | 节点配对完成 | `operator.pairing` |

### 5.7 语音唤醒事件

| 事件 | 说明 |
|------|------|
| `voicewake.changed` | 语音唤醒触发词变化 |

### 5.8 定时任务事件

| 事件 | 说明 |
|------|------|
| `cron` | 定时任务状态事件 |

### 5.9 对话模式事件

| 事件 | 说明 |
|------|------|
| `talk.mode` | 对话模式变更 |

### 5.10 更新事件

| 事件 | 说明 |
|------|------|
| `update.available` | 新版本可用 |

## 6. Session Key 格式

Session Key 用于标识 Agent 会话：

```
agent:{agentId}:{rest}
```

示例：
```
agent:主持人-mmlzvsxr-3r2gjs:ocs-1741774612345
```

Gateway 通过解析 sessionKey 来：
- 确定目标 Agent
- 路由消息到正确的工作空间
- 隔离不同会话的数据

## 7. 错误码

| 错误码 | 说明 |
|--------|------|
| `UNAUTHORIZED` | 未授权 |
| `FORBIDDEN` | 禁止访问 |
| `NOT_FOUND` | 资源不存在 |
| `VALIDATION_ERROR` | 参数验证失败 |
| `TIMEOUT` | 超时 |
| `RATE_LIMITED` | 速率限制 |
| `INTERNAL_ERROR` | 内部错误 |
| `INVALID_REQUEST` | 无效请求 |

## 8. 权限范围 (Scopes)

| Scope | 说明 |
|-------|------|
| `operator.admin` | 管理员权限(可访问所有事件) |
| `operator.approvals` | 审批权限 |
| `operator.pairing` | 配对权限 |

## 9. 客户端能力 (Capabilities)

| Capability | 说明 |
|------------|------|
| `tool-events` | 接收工具事件 |

## 10. 关键常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `TICK_INTERVAL_MS` | 30000 | Tick间隔(30秒) |
| `HEALTH_REFRESH_INTERVAL_MS` | 60000 | 健康刷新间隔(60秒) |
| `MAX_BUFFERED_BYTES` | 2MB | 最大缓冲字节 |
| `DEDUPE_TTL_MS` | 300000 | 去重TTL(5分钟) |
| `CHAT_HISTORY_TEXT_MAX_CHARS` | 12000 | 历史文本最大字符 |

## 11. 使用示例

### 11.1 连接 Gateway

```javascript
const ws = new WebSocket('ws://127.0.0.1:18789');

// 等待 connect.challenge
ws.onmessage = (event) => {
  const frame = JSON.parse(event.data);

  if (frame.type === 'event' && frame.event === 'connect.challenge') {
    // 发送 connect 请求
    ws.send(JSON.stringify({
      type: 'req',
      id: 'connect-1',
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'my-client',
          version: '1.0.0',
          platform: 'darwin',
          mode: 'backend'
        },
        role: 'operator',
        scopes: ['operator.admin'],
        auth: { token: 'your-token' }
      }
    }));
  }

  if (frame.type === 'hello-ok') {
    console.log('Connected!');
  }
};
```

### 11.2 发送消息

```javascript
// 发送 chat.send 请求
ws.send(JSON.stringify({
  type: 'req',
  id: 'chat-1',
  method: 'chat.send',
  params: {
    sessionKey: 'agent:my-agent:session-123',
    message: 'Hello!',
    idempotencyKey: 'unique-key-123',
    timeoutMs: 300000
  }
}));

// 监听响应
ws.onmessage = (event) => {
  const frame = JSON.parse(event.data);

  if (frame.type === 'res' && frame.id === 'chat-1') {
    console.log('Send result:', frame.payload);
    // { runId: '...', sessionKey: '...' }
  }

  if (frame.type === 'event' && frame.event === 'chat') {
    const { state, message } = frame.payload;
    if (state === 'delta') {
      console.log('Streaming:', message.content[0].text);
    } else if (state === 'final') {
      console.log('Final:', message?.content[0]?.text);
    }
  }
};
```

## 12. 注意事项

1. **消息去重**: 使用 `idempotencyKey` 避免重复发送
2. **超时处理**: 建议设置 5 分钟超时
3. **心跳保持**: 服务器会发送 `tick` 事件，客户端应保持连接
4. **慢消费者**: 如果缓冲超过 2MB，连接会被关闭
5. **dropIfSlow**: 某些事件(如 delta)可能因慢消费被丢弃
