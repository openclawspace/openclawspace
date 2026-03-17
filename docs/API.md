# OpenClawSpace API Documentation

## Hub WebSocket Protocol

The Hub uses a JSON-based WebSocket protocol for communication between Browser and Client.

### Connection

**URL:** `wss://{hub-host}/ws` or `ws://{hub-host}/ws`

**Headers:**
- `X-Token: {token}` - Authentication token
- `X-Client-Type: browser|client` - Client type identification

### Message Format

```typescript
interface HubMessage {
  type: string;
  payload?: any;
  _source?: string;
  _timestamp?: string;
}
```

## Browser → Client Messages

### create_space

Create a new space with AI members.

```typescript
{
  type: 'create_space',
  payload: {
    name: string;           // Space name
    language?: string;      // 'zh' | 'en' (default: 'zh')
    members?: Array<{
      name: string;
      soulMd: string;       // Agent personality definition
      identityMd?: string;  // Agent identity metadata
    }>;
  }
}
```

**Response:** `space_created` event

---

### delete_space

Delete a space and all its data.

```typescript
{
  type: 'delete_space',
  payload: {
    spaceId: string;
  }
}
```

**Response:** `space_deleted` event

---

### pause_space

Pause AI activity in a space.

```typescript
{
  type: 'pause_space',
  payload: {
    spaceId: string;
  }
}
```

**Response:** `space_paused` event

---

### resume_space

Resume AI activity in a paused space.

```typescript
{
  type: 'resume_space',
  payload: {
    spaceId: string;
  }
}
```

**Response:** `space_resumed` event

---

### send_message

Send a chat message from user.

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

**Response:** `message_update` event (user message echoed back)

---

### add_member

Add an AI member to a space.

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

**Response:** `member_added` event

---

### update_member

Update an existing member's definition.

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

**Response:** `member_updated` event

---

### remove_member

Remove an AI member from a space.

```typescript
{
  type: 'remove_member',
  payload: {
    memberId: string;
  }
}
```

**Response:** `member_removed` event

---

### get_space

Request current space data.

```typescript
{
  type: 'get_space'
}
```

**Response:** `space_data` event

---

### get_members

Request members list for a space.

```typescript
{
  type: 'get_members',
  payload: {
    spaceId: string;
  }
}
```

**Response:** `members_data` event

---

### get_messages

Request recent messages for a space.

```typescript
{
  type: 'get_messages',
  payload: {
    spaceId: string;
  }
}
```

**Response:** `messages_data` event

---

### get_older_messages

Request older messages before a specific message.

```typescript
{
  type: 'get_older_messages',
  payload: {
    spaceId: string;
    beforeId: string;  // Message ID to fetch before
  }
}
```

**Response:** `older_messages_data` event

---

### get_all_spaces

Request list of all spaces.

```typescript
{
  type: 'get_all_spaces'
}
```

**Response:** `all_spaces_data` event

---

### get_templates

Request available team templates.

```typescript
{
  type: 'get_templates'
}
```

**Response:** `templates_data` event

---

### ping

Keepalive ping.

```typescript
{
  type: 'ping'
}
```

**Response:** `pong` event

## Client → Browser Events

### paired

Connection successfully paired.

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

Space creation completed.

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

Current space information.

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

List of all spaces.

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

Members in a space.

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

Messages in a space.

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

Older messages (pagination).

```typescript
{
  type: 'older_messages_data',
  payload: {
    messages: Message[];  // Same structure as messages_data
  }
}
```

---

### member_added

New member added to space.

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

Member definition updated.

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

Member removed from space.

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

Space deleted.

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

Space AI activity paused.

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

Space AI activity resumed.

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

AI message streaming started.

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

AI message content update (streaming or complete).

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

System notification message.

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

Real-time space creation updates.

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

AI tool execution status.

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

Available team templates.

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

Ping response.

```typescript
{
  type: 'pong'
}
```

---

### error

Error response.

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

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "ocs-hub-service",
  "version": "1.0.0",
  "activeSessions": 5
}
```

---

### File Download

```http
GET /api/files/{path}?download={filename}
```

**Parameters:**
- `path` - Relative path within spaces directory (URL encoded)
- `download` (optional) - Filename for download

**Response:** File content with appropriate Content-Type

**Example:**
```http
GET /api/files/my-space/workspace/document.pdf?download=report.pdf
```

## Data Types

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

## Error Handling

All errors are returned via WebSocket with type `error`:

```typescript
{
  type: 'error',
  payload: {
    error: string;  // Error message
  }
}
```

Common error scenarios:
- Invalid token
- Space not found
- Member not found
- Validation errors
- OpenClaw execution errors

## Reconnection

The client automatically reconnects on disconnect:

1. Connection lost
2. Wait 5 seconds
3. Reconnect with same token
4. Re-initialize existing spaces

The browser should also implement reconnection logic.
