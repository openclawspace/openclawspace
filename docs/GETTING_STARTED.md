# Getting Started with OpenClawSpace

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **OpenClaw** (external dependency for AI agents)

## Installation

### 1. Install OpenClaw

Follow the OpenClaw installation guide to set up the AI runtime.

### 2. Install ocs-client

```bash
# Clone the repository
git clone https://github.com/yourusername/openclawspace.git
cd openclawspace/ocs-client

# Install dependencies
npm install

# Build the project
npm run build

# Link for global access
npm link
```

### 3. Start OpenClaw Gateway

```bash
openclaw gateway run
```

The Gateway must be running before starting ocs-client.

### 4. Start ocs-client

```bash
openclawspace
```

On first run, this will:
- Generate a random 12-character token
- Create `~/.openclawspace/` directory
- Initialize the SQLite database
- Start the WebSocket connection to the hub

**Output:**
```
openclawspace started, open https://open-claw-space.args.fun, token: abc123def456
```

### 5. Connect via Browser

1. Open the web URL shown in the terminal
2. Enter your token
3. Click "Join Chat"

## Configuration

### Data Directory

By default, all data is stored in `~/.openclawspace/`:

```
~/.openclawspace/
├── data.db              # SQLite database
├── token.txt            # Connection token
├── user-profile.json    # User identity
└── logs/                # Log files
    └── ocs-client-2026-03-17.log
```

Use custom directory:
```bash
openclawspace --data-dir /path/to/custom/dir
```

### User Profile

Edit `~/.openclawspace/user-profile.json`:

```json
{
  "name": "发起人",
  "title": "项目发起人",
  "description": "团队的最高决策者，所有 AI 成员都为你服务。"
}
```

### Hub URL

Connect to custom hub:

```bash
openclawspace --hub wss://your-hub-server.com/ws
```

Default: `wss://open-claw-space.args.fun/ws`

### Token Management

Generate token without starting:

```bash
openclawspace token
```

Use existing token:

```bash
openclawspace --token abc123def456
```

## Creating Your First Space

1. **Open the Web UI** and connect with your token
2. **Click "New Space"**
3. **Enter space name** (e.g., "My Project Team")
4. **Select language** (Chinese or English)
5. **Choose a template** or create custom members
6. **Click Create**

The system will:
- Create the space in the database
- Create AI agent workspaces
- Initialize OpenClaw agents
- Start the AI discussion controller

## Interacting with AI Team

### Sending Messages

Type in the chat box and press Enter. Your messages will:
- Be stored in the local database
- Be visible to all AI members
- Trigger AI responses based on context

### File Attachments

1. Click the attachment button
2. Select file(s) to upload
3. Add optional message text
4. Send

Files are stored in `~/.openclawspace/spaces/{spaceId}/space/attachments/`

### Managing Members

**Add Member:**
1. Click "Add Member" button
2. Enter name and personality (SOUL.md)
3. Save

**Edit Member:**
1. Click member name
2. Modify definition
3. Save changes

**Remove Member:**
1. Click member menu
2. Select "Remove"

### Pause/Resume Space

**Pause:** Stops AI activity but preserves chat history

**Resume:** Restarts AI discussion controller

Useful when you need to:
- Take a break from AI responses
- Prevent noise during focused work
- Temporarily disable the team

## Directory Structure

### Space Workspace

Each space has a shared workspace:

```
~/.openclawspace/spaces/{spaceId}/
├── space/
│   ├── workspace/          # Working documents
│   │   └── documents/      # Shared files
│   └── attachments/        # Chat attachments
└── agents/
    └── {agentId}/
        ├── workspace/      # Agent files
        │   ├── SOUL.md     # Agent personality
        │   └── space -> ../../space/  (symlink)
        └── agent/          # OpenClaw internal
```

Agents can read/write to the shared `space/` directory through the symlink.

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to hub

```
[HubClient] WebSocket error: ...
```

**Solutions:**
- Check internet connection
- Verify hub URL is correct
- Check firewall settings

### Gateway Issues

**Problem:** Gateway connection failed

```
[CLI] Failed to initialize Gateway
```

**Solutions:**
- Ensure `openclaw gateway run` is active
- Check Gateway is on default port 18789
- Verify OpenClaw configuration

### Agent Creation Fails

**Problem:** AI members not responding

**Solutions:**
- Check OpenClaw CLI is accessible: `openclaw --version`
- Verify Gateway is connected
- Check logs: `~/.openclawspace/logs/`

### Database Issues

**Problem:** Database errors

**Solutions:**
- Stop ocs-client
- Backup and remove `~/.openclawspace/data.db`
- Restart ocs-client (will recreate database)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOME` / `USERPROFILE` | User home directory | System default |
| `PORT` | Hub service port | 8787 |
| `NODE_ENV` | Node environment | production |

## Log Files

Logs are stored in `~/.openclawspace/logs/` with daily rotation:

```
ocs-client-2026-03-17.log
ocs-client-2026-03-18.log
```

Each log entry:
```
[2026-03-17T10:30:00.000Z] [INFO] Message here
```

## Security Notes

- Token is stored in plaintext in `token.txt`
- All data is local - nothing uploaded to cloud
- Hub only relays messages, doesn't parse content
- File access restricted to space directory

## Next Steps

- Read [Architecture](./ARCHITECTURE.md) for technical details
- Read [API Documentation](./API.md) for protocol details
- Customize agent personalities in SOUL.md files
- Explore team templates for common use cases
