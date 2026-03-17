# OpenClawSpace Architecture

## Overview

OpenClawSpace is a multi-agent AI collaboration platform that enables teams of AI agents to work together in shared spaces. It consists of three main components:

1. **ocs-client** - Local Node.js service that manages AI agents and connects to the hub
2. **ocs-hub** - WebSocket relay server that pairs clients with web browsers
3. **Web UI** - React-based interface for managing spaces and chatting with AI teams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenClawSpace                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     WebSocket      ┌─────────────────────────────────┐  │
│   │  Web Browser │◄──────────────────►│           ocs-hub               │  │
│   │   (React UI) │                    │    (WebSocket Relay Server)     │  │
│   └──────────────┘                    └─────────────────────────────────┘  │
│                                                ▲                            │
│                                                │ WebSocket                  │
│   ┌──────────────┐     WebSocket      ┌───────┴─────────────────────────┐  │
│   │  OpenClaw    │◄──────────────────►│          ocs-client             │  │
│   │   Gateway    │                    │     (Local AI Team Service)     │  │
│   └──────────────┘                    └─────────────────────────────────┘  │
│                                                │                            │
│                                                ▼                            │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     Local File System                               │  │
│   │   ~/.openclawspace/                                                 │  │
│   │   ├── data.db              (SQLite database)                        │  │
│   │   ├── user-profile.json    (User configuration)                     │  │
│   │   ├── token.txt            (Connection token)                       │  │
│   │   ├── logs/                (Log files)                              │  │
│   │   └── spaces/              (Space workspaces)                       │  │
│   │       └── {spaceId}/                                                │  │
│   │           ├── space/       (Shared files)                           │  │
│   │           └── agents/      (Agent workspaces)                       │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. ocs-client

The local client service that manages AI teams and spaces.

**Location:** `ocs-client/src/`

**Key Modules:**

| Module | Purpose |
|--------|---------|
| `cli.ts` | CLI entry point, token generation, service startup |
| `hub-client.ts` | WebSocket client for hub communication |
| `space-manager.ts` | Space CRUD, member management, message handling |
| `database.ts` | SQLite database operations (sql.js) |
| `openclaw-client.ts` | OpenClaw CLI integration for agent management |
| `gateway-client.ts` | OpenClaw Gateway WebSocket client |
| `ai-discussion-controller.ts` | AI silence detection and discussion orchestration |
| `user-profile.ts` | User identity management |
| `logger.ts` | File and console logging |

**Data Storage:**

- **Database:** `~/.openclawspace/data.db` (SQLite via sql.js)
- **Config:** `~/.openclawspace/user-profile.json`
- **Token:** `~/.openclawspace/token.txt`
- **Logs:** `~/.openclawspace/logs/ocs-client-{date}.log`
- **Spaces:** `~/.openclawspace/spaces/{spaceId}/`

**Database Schema:**

```sql
-- Spaces table
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_paused INTEGER NOT NULL DEFAULT 0,
  paused_at TEXT,
  language TEXT DEFAULT 'zh'
);

-- Members table
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  soul_md TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'member',  -- 'host' or 'member'
  identity_md TEXT,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Attachments table
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

WebSocket relay server that enables browser-to-client communication.

**Location:** `ocs-hub/packages/ocs-hub-service/src/index.ts`

**Architecture:**

- **HTTP Server:** Serves static web files and API endpoints
- **WebSocket Server:** Handles client and browser connections
- **Session Management:** Token-based pairing system

**Message Flow:**

```
Browser ──► Hub ──► Client ──► AI Response ──► Client ──► Hub ──► Browser
```

**Key Endpoints:**

- `GET /health` - Health check
- `GET /api/files/{path}` - File download from spaces directory
- `WS /ws` - WebSocket endpoint for client/browser connections

**Session Structure:**

```typescript
sessions = Map<token, {
  clientWs?: WebSocket;
  browserWs?: WebSocket;
  pairedAt?: string;
}>
```

### 3. Web UI

React-based single-page application.

**Location:** `ocs-hub/packages/ocs-hub-web/src/App.tsx`

**Features:**

- Token-based authentication
- Space management (create, delete, pause, resume)
- Member management (add, edit, remove AI agents)
- Real-time chat with streaming messages
- File attachment upload/download
- Multi-language support (i18n)

## Communication Protocol

### Hub Protocol

**Client Messages:**

| Type | Direction | Description |
|------|-----------|-------------|
| `create_space` | Browser → Client | Create new space |
| `delete_space` | Browser → Client | Delete space |
| `pause_space` | Browser → Client | Pause AI activity |
| `resume_space` | Browser → Client | Resume AI activity |
| `send_message` | Browser → Client | Send chat message |
| `add_member` | Browser → Client | Add AI member |
| `update_member` | Browser → Client | Update member |
| `remove_member` | Browser → Client | Remove member |
| `get_space` | Browser → Client | Request space data |
| `get_members` | Browser → Client | Request members list |
| `get_messages` | Browser → Client | Request messages |

**Server Messages:**

| Type | Direction | Description |
|------|-----------|-------------|
| `paired` | Hub → Client/Browser | Connection paired |
| `space_created` | Client → Browser | Space created confirmation |
| `space_deleted` | Client → Browser | Space deleted |
| `space_paused` | Client → Browser | Space paused |
| `space_resumed` | Client → Browser | Space resumed |
| `message_start` | Client → Browser | AI message started |
| `message_update` | Client → Browser | AI message streaming |
| `member_added` | Client → Browser | Member added |
| `member_updated` | Client → Browser | Member updated |
| `member_removed` | Client → Browser | Member removed |
| `tool_status_update` | Client → Browser | Tool execution status |

### Gateway Protocol

OpenClaw Gateway WebSocket protocol for AI agent communication.

**Connection:** `ws://127.0.0.1:18789`

**Frame Types:**

- `connect` - Initial connection handshake
- `chat.send` - Send message to agent
- `chat.stream` - Stream response from agent
- `tool` - Tool execution events
- `agent.status` - Agent status updates

## AI Discussion System

### Host-Based Architecture

Each space has one designated **host** member (role='host') responsible for:

1. **Silence Detection** - Monitor conversation inactivity (30s threshold)
2. **Decision Making** - Decide which member should speak next
3. **Task Management** - Determine when tasks are complete

### Discussion Flow

```
1. User sends message
   └──► AI Discussion Controller notified

2. Silence detected (30s)
   └──► Query host member
       └──► Host decides: "wake_member" or "task_complete"
           └──► If wake_member: selected member responds
           └──► If task_complete: space auto-paused
```

### Message Types

- `user` - Human user messages
- `assistant` - AI agent messages
- `system` - System notifications (member joined/left)

## File System Structure

### Space Directory Layout

```
~/.openclawspace/spaces/{spaceId}/
├── space/                    # Shared workspace
│   ├── workspace/           # Working documents
│   ├── attachments/         # Chat attachments
│   └── team.md             # Team documentation
└── agents/
    └── {agentId}/
        ├── workspace/       # Agent workspace
        │   ├── SOUL.md     # Agent personality
        │   ├── IDENTITY.md # Agent identity
        │   ├── BOOTSTRAP.md
        │   └── space -> ../../space/  (symlink to shared)
        └── agent/           # OpenClaw internal state
            ├── session/
            └── models.json
```

## Security Model

### Token Authentication

- 12-character random alphanumeric token
- Generated on first run or explicitly via `openclawspace token`
- Stored in `~/.openclawspace/token.txt`
- Passed via `X-Token` header in WebSocket connection

### Data Isolation

- Each client instance isolated by token
- File access restricted to space directory
- Path traversal protection on file endpoints
- No cloud data storage - all local

### Gateway Security

- Optional token authentication
- Local-only Gateway connection (ws://127.0.0.1:18789)
- No external network exposure

## Dependencies

### Runtime Dependencies

- **Node.js** >= 18
- **OpenClaw** - AI agent runtime (external dependency)
- **OpenClaw Gateway** - Local Gateway service

### npm Packages (ocs-client)

- `commander` - CLI framework
- `ws` - WebSocket client
- `sql.js` - SQLite in JavaScript
- `uuid` - UUID generation
- `chalk` - Terminal colors

### npm Packages (ocs-hub)

- `ws` - WebSocket server
- `http` - Built-in HTTP server

## Build & Deployment

### ocs-client

```bash
cd ocs-client
npm install
npm run build      # Compiles TypeScript to dist/
npm link           # Creates global 'openclawspace' command
```

### ocs-hub

```bash
cd ocs-hub
docker-compose up  # Runs hub service + web UI
```

## Development Workflow

1. Start OpenClaw Gateway: `openclaw gateway run`
2. Start ocs-client: `openclawspace` (generates token)
3. Open browser to hub URL
4. Enter token to pair
5. Create space and add AI members

## License

MIT License - See LICENSE file
