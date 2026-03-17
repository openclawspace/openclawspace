# OpenClawSpace API 文档

## Hub WebSocket 协议

Hub 使用基于 JSON 的 WebSocket 协议进行浏览器与客户端之间的通信。

### 连接

**URL:** `wss://{hub-host}/ws` 或 `ws://{hub-host}/ws`

**请求头:**
- `X-Token: {token}` - 认证令牌
- `X-Client-Type: browser|client` - 客户端类型标识

### 消息格式

```typescript
interface HubMessage {
  type: string;
  payload?: any;
  _source?: string;
  _timestamp?: string;
}
```

## 浏览器 → 客户端消息

### create_space

创建带有 AI 成员的新空间。

```typescript
{
  type: 'create_space',
  payload: {
    name: string;           // 空间名称
    language?: string;      // 'zh' | 'en' (默认: 'zh')
    members?: Array<{
      name: string;
      soulMd: string;       // 智能体人格定义
      identityMd?: string;  // 智能体身份元数据
    }>;
  }
}
```

**响应:** `space_created` 事件

---

### delete_space

删除空间及其所有数据。

```typescript
{
  type: 'delete_space',
  payload: {
    spaceId: string;
  }
}
```

**响应:** `space_deleted` 事件

---

### pause_space

暂停空间中的 AI 活动。

```typescript
{
  type: 'pause_space',
  payload: {
    spaceId: string;
  }
}
```

**响应:** `space_paused` 事件

---

### resume_space

恢复已暂停空间中的 AI 活动。

```typescript
{
  type: 'resume_space',
  payload: {
    spaceId: string;
  }
}
```

**响应:** `space_resumed` 事件

---

### send_message

从用户发送聊天消息。

```typescript
{
  type: 'send_message',
  payload: {
    spaceId: string;
    content: string;
    attachments?: Array<{
      id: string;
      type: 'image' | 'document' | 'media' | 'file';
      originalName: string;
      storedName: string;
      relativePath: string;
      fileSize: number;
      mimeType: string;
    }>;
  }
}
```

**响应:** `message_update` 事件 (用户消息回显)

---

### add_member

向空间添加 AI 成员。

```typescript
{
  type: 'add_member',
  payload: {
    spaceId: string;
    name: string;
    soulMd: string;
    identityMd?: string;
  }
}
```

**响应:** `member_added` 事件

---

### update_member

更新现有成员的定义。

```typescript
{
  type: 'update_member',
  payload: {
    memberId: string;
    name: string;
    soulMd: string;
    identityMd?: string;
  }
}
```

**响应:** `member_updated` 事件

---

### remove_member

从空间中移除 AI 成员。

```typescript
{
  type: 'remove_member',
  payload: {
    memberId: string;
  }
}
```

**响应:** `member_removed` 事件

---

### get_space

请求当前空间数据。

```typescript
{
  type: 'get_space'
}
```

**响应:** `space_data` 事件

---

### get_members

请求空间的成员列表。

```typescript
{
  type: 'get_members',
  payload: {
    spaceId: string;
  }
}
```

**响应:** `members_data` 事件

---

### get_messages

请求空间的近期消息。

```typescript
{
  type: 'get_messages',
  payload: {
    spaceId: string;
  }
}
```

**响应:** `messages_data` 事件

---

### get_older_messages

请求特定消息之前的旧消息。

```typescript
{
  type: 'get_older_messages',
  payload: {
    spaceId: string;
    beforeId: string;  // 获取此 ID 之前的消息
  }
}
```

**响应:** `older_messages_data` 事件

---

### get_all_spaces

请求所有空间列表。

```typescript
{
  type: 'get_all_spaces'
}
```

**响应:** `all_spaces_data` 事件

---

### get_templates

请求可用的团队模板。

```typescript
{
  type: 'get_templates'
}
```

**响应:** `templates_data` 事件

---

### ping

心跳保活。

```typescript
{
  type: 'ping'
}
```

**响应:** `pong` 事件

## 客户端 → 浏览器事件

### paired

连接配对成功。

```typescript
{
  type: 'paired',
  payload: {
    token: string;
    clientInfo?: any;
  }
}
```

---

### space_created

空间创建完成。

```typescript
{
  type: 'space_created',
  payload: {
    space: {
      id: string;
      name: string;
      createdAt: string;
      isPaused: boolean;
      language?: string;
    };
    members: Member[];
  }
}
```

---

### space_data

当前空间信息。

```typescript
{
  type: 'space_data',
  payload: {
    space: {
      id: string;
      name: string;
      createdAt: string;
      isPaused: boolean;
      pausedAt?: string;
      language?: string;
    } | null;
  }
}
```

---

### all_spaces_data

所有空间列表。

```typescript
{
  type: 'all_spaces_data',
  payload: {
    spaces: Array<{
      id: string;
      name: string;
      createdAt: string;
      isPaused: boolean;
      pausedAt?: string;
      language?: string;
    }>;
  }
}
```

---

### members_data

空间中的成员。

```typescript
{
  type: 'members_data',
  payload: {
    members: Array<{
      id: string;
      spaceId: string;
      name: string;
      soulMd: string;
      identityMd?: string;
      agentId: string;
      isBuiltIn?: boolean;
      role?: 'host' | 'member';
    }>;
  }
}
```

---

### messages_data

空间中的消息。

```typescript
{
  type: 'messages_data',
  payload: {
    messages: Array<{
      id: string;
      spaceId: string;
      senderId: string;
      content: string;
      timestamp: string;
      isStreaming?: boolean;
      attachments?: Attachment[];
    }>;
  }
}
```

---

### older_messages_data

旧消息 (分页)。

```typescript
{
  type: 'older_messages_data',
  payload: {
    messages: Message[];  // 与 messages_data 结构相同
  }
}
```

---

### member_added

新成员已添加到空间。

```typescript
{
  type: 'member_added',
  payload: {
    member: Member;
  }
}
```

---

### member_updated

成员定义已更新。

```typescript
{
  type: 'member_updated',
  payload: {
    member: Member;
  }
}
```

---

### member_removed

成员已从空间移除。

```typescript
{
  type: 'member_removed',
  payload: {
    memberId: string;
  }
}
```

---

### space_deleted

空间已删除。

```typescript
{
  type: 'space_deleted',
  payload: {
    spaceId: string;
  }
}
```

---

### space_paused

空间 AI 活动已暂停。

```typescript
{
  type: 'space_paused',
  payload: {
    spaceId: string;
    isPaused: boolean;
    pausedAt?: string;
    reason?: string;
  }
}
```

---

### space_resumed

空间 AI 活动已恢复。

```typescript
{
  type: 'space_resumed',
  payload: {
    spaceId: string;
    isPaused: boolean;
  }
}
```

---

### message_start

AI 消息流开始。

```typescript
{
  type: 'message_start',
  payload: {
    message: {
      id: string;
      spaceId: string;
      senderId: string;
      content: string;
      timestamp: string;
      isStreaming: true;
    };
    senderName: string;
  }
}
```

---

### message_update

AI 消息内容更新 (流式或完成)。

```typescript
{
  type: 'message_update',
  payload: {
    message: {
      id: string;
      spaceId: string;
      senderId: string;
      content: string;
      timestamp: string;
      isStreaming: boolean;
      attachments?: Attachment[];
    };
    senderName?: string;
  }
}
```

---

### system_message

系统通知消息。

```typescript
{
  type: 'system_message',
  payload: {
    message: {
      id: string;
      spaceId: string;
      senderId: 'system';
      content: string;
      timestamp: string;
      senderName: string;
    };
  }
}
```

---

### space_creation_progress

空间创建实时更新。

```typescript
{
  type: 'space_creation_progress',
  payload: {
    message: string;
  }
}
```

---

### tool_status_update

AI 工具执行状态。

```typescript
{
  type: 'tool_status_update',
  payload: {
    memberId: string;
    messageId: string;
    toolStatuses: Array<{
      toolCallId: string;
      toolName: string;
      phase: 'start' | 'update' | 'result';
      args?: Record<string, unknown>;
      startedAt: number;
      endedAt?: number;
    }>;
  }
}
```

---

### templates_data

可用的团队模板。

```typescript
{
  type: 'templates_data',
  payload: {
    templates: Array<{
      id: string;
      name: string;
      description: string;
      members: Array<{
        name: string;
        role: string;
        personality: string;
      }>;
    }>;
  }
}
```

---

### pong

Ping 响应。

```typescript
{
  type: 'pong'
}
```

---

### error

错误响应。

```typescript
{
  type: 'error',
  payload: {
    message?: string;
    error: string;
  }
}
```

## HTTP API

### 健康检查

```http
GET /health
```

**响应:**
```json
{
  "status": "ok",
  "service": "ocs-hub-service",
  "version": "1.0.0",
  "activeSessions": 5
}
```

---

### 文件下载

```http
GET /api/files/{path}?download={filename}
```

**参数:**
- `path` - 空间目录内的相对路径 (URL 编码)
- `download` (可选) - 下载文件名

**响应:** 文件内容，附带适当的 Content-Type

**示例:**
```http
GET /api/files/my-space/workspace/document.pdf?download=report.pdf
```

## 数据类型

### Attachment

```typescript
interface Attachment {
  id: string;
  messageId: string;
  type: 'image' | 'document' | 'media' | 'file';
  originalName: string;
  storedName: string;
  relativePath: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  createdAt: string;
}
```

### Member

```typescript
interface Member {
  id: string;
  spaceId: string;
  name: string;
  soulMd: string;
  identityMd?: string;
  agentId: string;
  isBuiltIn?: boolean;
  role?: 'host' | 'member';
}
```

### Message

```typescript
interface Message {
  id: string;
  spaceId: string;
  senderId: string;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  attachments?: Attachment[];
}
```

### Space

```typescript
interface Space {
  id: string;
  name: string;
  createdAt: string;
  isPaused: boolean;
  pausedAt?: string;
  language?: string;
}
```

## 错误处理

所有错误都通过 WebSocket 以 `error` 类型返回:

```typescript
{
  type: 'error',
  payload: {
    error: string;  // 错误消息
  }
}
```

常见错误场景:
- 令牌无效
- 空间不存在
- 成员不存在
- 验证错误
- OpenClaw 执行错误

## 重连

客户端在断开连接时会自动重连:

1. 连接丢失
2. 等待 5 秒
3. 使用相同令牌重连
4. 重新初始化现有空间

浏览器也应实现重连逻辑。
