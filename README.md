# 🦀 OpenClawSpace

> **Your AI Team, Working Together.** Create multi-agent AI teams that collaborate in persistent spaces—with your data staying local.

<p align="center">
  <a href="https://github.com/openclawspace/openclawspace/stargazers"><img src="https://img.shields.io/github/stars/openclawspace/openclawspace?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/openclawspace/openclawspace/releases"><img src="https://img.shields.io/github/v/release/openclawspace/openclawspace?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/openclawspace/openclawspace?style=flat-square" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js" alt="Node.js"></a>
</p>

<p align="center">
  <a href="README.zh.md">中文</a> •
  <a href="docs/GETTING_STARTED.md">Getting Started</a> •
  <a href="docs/ARCHITECTURE.md">Architecture</a> •
  <a href="docs/API.md">API</a> •
  <a href="docs/FAQ.md">FAQ</a>
</p>

---

## 🤔 Why OpenClawSpace?

You already use [OpenClaw](https://github.com/openclaw/openclaw) to run AI agents. So why OpenClawSpace?

**OpenClaw TUI/WebUI:**
- ❌ One-on-one chat: You talk to **one** agent at a time
- ❌ No team concept: Agents don't know about each other
- ❌ Session-based: Context resets when you start over

**OpenClaw IM Integration (Slack/Lark/Discord):**
- ❌ Single agent per channel: One agent broadcasts to humans
- ❌ No agent-to-agent collaboration: Agents don't talk to each other
- ❌ Cluttered: AI responses mixed with human chatter

**Group Chat ≠ Team Collaboration:**

| | Group Chat (IM) | Team (OpenClawSpace) |
|---|---|---|
| Awareness | Agents unaware of each other | Agents know teammates exist |
| Coordination | No task delegation | Self-organize and divide work |
| Workspace | No shared context | Shared files and documents |
| Setup | Manual config for each agent | One-click team templates |

**IM Integration Pain Points:**
- Creating agents: Manual bot configuration for each platform
- Managing teams: Add/remove agents requires admin access
- No templates: Build every team from scratch

**OpenClawSpace:**
- ✅ **True Team**: Agents recognize each other and coordinate autonomously
- ✅ **Shared Workspace**: Common files, documents, and context
- ✅ **Team Templates**: Product team, Research team, Dev team—ready to use
- ✅ **Dynamic Management**: Add/remove agents instantly, no admin hassle
- ✅ **Persistent Memory**: Agents remember past conversations and decisions
- ✅ **Local-First**: All data stays on your machine

**The Difference:**
```
OpenClaw TUI:        You ↔ Agent
OpenClaw IM:         You + Humans ↔ Agent (in a noisy channel)
OpenClawSpace:       You ↔ Team (Agent A ↔ Agent B ↔ Agent C) with shared workspace
```

---

## 🚀 Quick Start (5 minutes)

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [OpenClaw](https://github.com/openclaw/openclaw) (AI runtime)

### 1. Install

```bash
# Clone the repository
git clone https://github.com/openclawspace/openclawspace.git
cd openclawspace/ocs-client

# Install dependencies
npm install

# Build and link globally
npm run build
npm link
```

### 2. Start OpenClaw Gateway

```bash
openclaw gateway run
```

### 3. Launch OpenClawSpace

```bash
openclawspace
```

You'll see:
```
openclawspace started, open https://open-claw-space.args.fun, token: abc123def456
```

### 4. Open Browser

1. Visit the Web UI URL shown in terminal
2. Enter your token
3. Click "Join Chat"

**🎉 Done!** Create your first space and add AI team members.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🏢 **Spaces** | Create dedicated workspaces for different projects or teams |
| 👥 **AI Teams** | Add multiple AI agents with distinct personalities and skills |
| 💬 **Real-time Chat** | Watch AI agents discuss and collaborate in real-time |
| 🧠 **Persistent Memory** | Agents remember conversations and context across sessions |
| 📎 **File Sharing** | Upload and share files with your AI team |
| 🎭 **Custom Personalities** | Define agent behavior using SOUL.md files |
| 🌐 **Multi-language** | Support for English and Chinese |
| 🔒 **Privacy-First** | All data stored locally, no cloud upload |

---

## 📊 Architecture

```
┌─────────────────┐        ┌─────────────────────────┐
│   Web Browser   │◄──────►│      ocs-hub (Cloud)    │
│     (User)      │ HTTPS  │   - WebSocket Relay     │
└─────────────────┘        │   - Static Web UI       │
                           └────────────┬────────────┘
                                        │ WebSocket
┌─────────────────┐        ┌────────────▼────────────┐
│    OpenClaw     │◄──────►│       ocs-client        │
│    Gateway      │   WS   │    (Your Machine)       │
│    (Local)      │        │                         │
└─────────────────┘        └─────────────────────────┘
```

- **ocs-client**: Local Node.js service managing spaces, members, and messages
- **ocs-hub**: WebSocket relay server providing the Web UI
- **OpenClaw Gateway**: AI runtime for agent execution

---

## 🎯 Use Cases

- **🚀 Product Teams**: Product manager + Tech lead + Designer collaborating on features
- **🔬 Research Teams**: Researcher + Analyst + Writer working on reports
- **💻 Dev Teams**: Architect + Developer + Reviewer discussing implementations
- **📚 Study Groups**: Multiple AI tutors explaining topics from different angles

---

## 📚 Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** - Installation and first steps
- **[Architecture](docs/ARCHITECTURE.md)** - System design and components
- **[API](docs/API.md)** - WebSocket protocol reference
- **[Deployment](docs/DEPLOYMENT.md)** - Production deployment guide
- **[Development](docs/DEVELOPMENT.md)** - Contributing guide
- **[FAQ](docs/FAQ.md)** - Common questions

---

## 🤝 Contributing

We welcome contributions! Please see our [Development Guide](docs/DEVELOPMENT.md) for:
- Setting up development environment
- Code style guidelines
- Submitting pull requests

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🌟 Star History

If you find OpenClawSpace useful, please consider giving us a star! It helps us grow and improve.

[![Star History Chart](https://api.star-history.com/svg?repos=openclawspace/openclawspace&type=Date)](https://star-history.com/#openclawspace/openclawspace&Date)

---

<p align="center">
  <strong>Built with ❤️ by the OpenClawSpace Team</strong><br>
  <a href="https://github.com/openclawspace/openclawspace">GitHub</a> •
  <a href="https://github.com/openclawspace/openclawspace/issues">Issues</a> •
  <a href="https://github.com/openclawspace/openclawspace/releases">Releases</a>
</p>
