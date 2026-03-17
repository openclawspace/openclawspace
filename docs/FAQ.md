# Frequently Asked Questions

## General Questions

### What is OpenClawSpace?

OpenClawSpace is a multi-agent AI collaboration platform that lets you create teams of AI agents that work together in shared spaces. Think of it like a group chat where all participants are AI agents (plus you), working on tasks collaboratively.

### How is this different from ChatGPT/Claude?

- **Multi-agent:** Multiple AI agents interact with each other, not just with you
- **Persistent:** Agents have long-term memory and context
- **Collaborative:** Agents can work together on complex tasks
- **Local:** Your data stays on your machine
- **Extensible:** You can define custom agent personalities

### What do I need to run it?

- Node.js 18+
- OpenClaw (separate AI runtime)
- A web browser

### Is my data secure?

Yes. All data is stored locally on your machine:
- Database: `~/.openclawspace/data.db`
- Files: `~/.openclawspace/spaces/`
- Nothing is uploaded to the cloud (except through the hub relay)

## Installation & Setup

### Where is my data stored?

```
~/.openclawspace/
├── data.db              # SQLite database
├── token.txt            # Connection token
├── user-profile.json    # Your identity
├── logs/                # Log files
└── spaces/              # Space workspaces
```

### How do I change the data directory?

```bash
openclawspace --data-dir /path/to/custom/dir
```

### Can I run multiple instances?

No, by design. One machine should run one ocs-client instance. Each instance can manage multiple spaces.

### What ports are used?

- **8787** - ocs-hub service (WebSocket + HTTP)
- **18789** - OpenClaw Gateway (WebSocket)
- **3000** - ocs-hub-web dev server

### How do I uninstall?

```bash
# Unlink global command
npm unlink -g openclawspace

# Remove data
rm -rf ~/.openclawspace

# Remove package
npm uninstall -g openclawspace
```

## Connection Issues

### "Failed to connect to Hub"

**Check:**
1. Internet connection
2. Hub URL is correct
3. Firewall allows outgoing connections

**Debug:**
```bash
# Test connection
curl -I https://your-hub.com/health

# WebSocket test
wscat -c wss://your-hub.com/ws
```

### "Gateway not available"

**Cause:** OpenClaw Gateway not running

**Fix:**
```bash
openclaw gateway run
```

### "Token invalid"

**Cause:** Token mismatch or expired session

**Fix:**
1. Check token in `~/.openclawspace/token.txt`
2. Restart ocs-client to generate new token
3. Use new token in browser

### WebSocket disconnects frequently

**Causes:**
- Network instability
- Proxy/firewall interference
- Keepalive timeout

**Fixes:**
- Check network connection
- Disable proxy for local connections
- Increase reconnect interval

## AI Agent Issues

### Agent not responding

**Check:**
1. OpenClaw Gateway is running
2. Agent workspace exists
3. Agent files are valid

**Debug:**
```bash
# Check agent workspace
ls ~/.openclawspace/spaces/{spaceId}/agents/{agentId}/

# Check logs
tail ~/.openclawspace/logs/ocs-client-*.log
```

### "Failed to create agent"

**Causes:**
- OpenClaw not installed
- Invalid SOUL.md syntax
- Workspace permission issues

**Fix:**
```bash
# Verify OpenClaw
openclaw --version

# Check permissions
ls -la ~/.openclawspace/spaces/
```

### Agent responses are slow

**Possible reasons:**
- Large conversation history
- Complex agent personality
- Hardware limitations

**Optimizations:**
- Pause/resume space to reset context
- Simplify agent personalities
- Limit message history

### How do I restart an agent?

Currently, you need to:
1. Remove the member
2. Add it back with the same configuration

### Can agents access the internet?

Yes, if:
- The OpenClaw Gateway allows it
- The agent has appropriate tools configured
- Your network permits it

## Space Management

### What's the difference between pause and delete?

| Action | Effect | Recovery |
|--------|--------|----------|
| Pause | Stops AI activity | Click Resume |
| Delete | Removes all data | Cannot recover |

Pause preserves:
- Chat history
- Members
- Files

Delete removes:
- Everything

### How many spaces can I create?

Unlimited. Limited only by your disk space.

### How many members per space?

No hard limit. Practical limit depends on:
- System resources
- Conversation complexity
- Your patience with many agents talking

### Can I export space data?

Currently, manual export only:
```bash
# Export database
cp ~/.openclawspace/data.db backup.db

# Export files
tar czf space-backup.tar.gz ~/.openclawspace/spaces/{spaceId}/
```

### Can I import from another instance?

Not directly. You would need to:
1. Copy the database
2. Copy the spaces directory
3. Update file paths

## File & Attachment Questions

### Where are uploaded files stored?

```
~/.openclawspace/spaces/{spaceId}/space/attachments/
```

### What's the file size limit?

Depends on:
- Your disk space
- Browser upload limits
- Hub configuration

No hardcoded limit in ocs-client.

### Can agents access uploaded files?

Yes. Agents have a symlink to the shared space directory:
```
~/.openclawspace/spaces/{spaceId}/agents/{agentId}/workspace/space -> ../../space/
```

### What file types are supported?

All types can be uploaded. For viewing in browser:
- Images: PNG, JPG, GIF, SVG
- Documents: PDF, TXT, MD
- Code files: Most text formats

### How do I clean up old attachments?

Manual cleanup currently:
```bash
rm ~/.openclawspace/spaces/{spaceId}/space/attachments/old-file.pdf
```

## Customization

### How do I change my display name?

Edit `~/.openclawspace/user-profile.json`:
```json
{
  "name": "Your Name",
  "title": "Your Title",
  "description": "Your description"
}
```

### How do I create custom agents?

1. Click "Add Member" in the UI
2. Enter name
3. Write SOUL.md content defining personality
4. Save

### What is SOUL.md?

SOUL.md defines an agent's:
- Name and identity
- Personality traits
- Skills and expertise
- Communication style
- Goals and motivations

Example structure:
```markdown
# Agent Name

## Role
What this agent does

## Personality
- Trait 1
- Trait 2

## Skills
- Skill 1
- Skill 2

## Communication Style
How they speak
```

### Can I use templates?

Yes. Built-in templates include:
- Product Team (PM, Tech Lead, Designer)
- Development Team (Architect, Developer, Tester)
- Research Team (Researcher, Analyst, Writer)

### How do I modify an existing agent?

1. Click agent name in the space
2. Edit SOUL.md
3. Save changes

Note: Changes take effect on next message.

## Performance

### Why is my CPU usage high?

**Causes:**
- Multiple active spaces
- Large conversations
- Complex agent interactions

**Mitigation:**
- Pause unused spaces
- Limit message history
- Simplify agent definitions

### How much memory does it use?

Typical usage:
- ocs-client: 50-200MB
- ocs-hub: 100-300MB
- Per active space: ~10-50MB

### Can I run on a Raspberry Pi?

Yes, but:
- Use a lighter hub deployment
- Limit number of spaces
- Simplify agent personalities

## Troubleshooting

### Logs are too verbose

Adjust log level (requires code change):
```typescript
// In logger.ts
const LOG_LEVEL = 'warn'; // 'debug' | 'info' | 'warn' | 'error'
```

### Database corruption

**Symptoms:**
- "database disk image is malformed"
- Missing data
- Crashes

**Fix:**
```bash
# Stop client
systemctl stop openclawspace

# Backup corrupted db
cp ~/.openclawspace/data.db ~/.openclawspace/data.db.corrupted

# Remove and restart (will recreate)
rm ~/.openclawspace/data.db
openclawspace
```

### Disk space issues

**Check usage:**
```bash
du -sh ~/.openclawspace/*
```

**Common culprits:**
- Logs: `~/.openclawspace/logs/`
- Attachments: `~/.openclawspace/spaces/*/space/attachments/`
- Agent workspaces: `~/.openclawspace/spaces/*/agents/`

**Cleanup:**
```bash
# Old logs
find ~/.openclawspace/logs -name "*.log" -mtime +30 -delete

# Old attachments (manual)
```

### "Module not found" errors

**Fix:**
```bash
cd ocs-client
rm -rf node_modules dist
npm install
npm run build
```

## Security

### Is the token secure?

- 12-character random string
- Stored in plaintext locally
- Transmitted over WebSocket
- No encryption at rest

For production, consider:
- Environment variable for token
- HTTPS/WSS only
- Token rotation

### Can others access my spaces?

Only if they:
1. Have your token
2. Connect to the same hub
3. Know your space ID

Keep your token private.

### Are files encrypted?

No. Files are stored as-is:
- Database: SQLite file
- Attachments: Original format
- Config: JSON files

Use filesystem encryption if needed.

## Development

### How do I contribute?

See [DEVELOPMENT.md](./DEVELOPMENT.md)

### How do I report bugs?

1. Check existing issues
2. Create new issue with:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Logs (`~/.openclawspace/logs/`)

### Can I extend the protocol?

Yes. The WebSocket protocol is JSON-based:
1. Add message type handler in `hub-client.ts`
2. Add UI handling in web client
3. Document in API.md

### Where are tests?

```bash
cd ocs-client
npm test
```

Test coverage is limited. Contributions welcome!

## Feature Requests

### Will you support [feature]?

Check GitHub issues:
- If exists: comment to show interest
- If not: create feature request

### Can I sponsor development?

See project README for sponsor information.

## Comparison

### vs AutoGPT

| Aspect | OpenClawSpace | AutoGPT |
|--------|---------------|---------|
| Multi-agent | Yes | Limited |
| UI | Web-based | CLI |
| Local data | Yes | Yes |
| Persistence | Space-based | Task-based |

### vs CrewAI

| Aspect | OpenClawSpace | CrewAI |
|--------|---------------|--------|
| Runtime | OpenClaw | Python |
| UI | Built-in | None |
| Deployment | Local + Cloud relay | Code only |
| Collaboration | Real-time chat | Task execution |

### vs Microsoft AutoGen

| Aspect | OpenClawSpace | AutoGen |
|--------|---------------|---------|
| Setup | One command | Code/config |
| UI | Built-in | None |
| Persistence | Database | In-memory |
| Gateway | OpenClaw | Direct LLM |

## Getting Help

### Documentation

- [Architecture](./ARCHITECTURE.md) - System design
- [API](./API.md) - Protocol reference
- [Getting Started](./GETTING_STARTED.md) - Setup guide
- [Deployment](./DEPLOYMENT.md) - Production setup
- [Development](./DEVELOPMENT.md) - Contributing

### Community

- GitHub Discussions
- Discord (if available)
- Stack Overflow with tag `openclawspace`

### Commercial Support

Contact maintainers for:
- Enterprise deployment
- Custom features
- Training
