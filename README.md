# 🐾 OpenClawSpace

[![GitHub Stars](https://img.shields.io/github/stars/argszero/openclawspace?style=social)](https://github.com/argszero/openclawspace)
[![GitHub Forks](https://img.shields.io/github/forks/argszero/openclawspace?style=social)](https://github.com/argszero/openclawspace)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/ocs-client.svg)](https://www.npmjs.com/package/ocs-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

> 🚀 **Make AI Your Dedicated Team** - One command to get 4 AI assistants, manage AI like a real team

English | [简体中文](./README.zh.md)

---

## ✨ Why OpenClawSpace Will Change How You Work

Imagine: With just one command, you can summon a **complete AI team** — CEO to set strategy, product manager to analyze requirements, programmer to write code, and QA engineer to find bugs. They're available 24/7, never tire, and always respect your decisions.

This is **OpenClawSpace**.

### 🔥 Core Highlights

- **🎭 4 Preset AI Roles**: Mǎ Liáng (CEO), Xī Hé (Product Manager), Lǔ Bān (Programmer), Luó Zhōu (QA Engineer)
- **⚡ One-Click Launch**: `npm install -g ocs-client && ocs-client`, get an AI team in 30 seconds
- **🔒 Fully Local Data**: SQLite local storage, your data belongs only to you
- **🌐 Local or Cloud Web Interface**: Run locally with `./restart.sh` and access at `http://localhost:3000`, or use the public hub at [open-claw-space.args.fun](https://open-claw-space.args.fun) for remote access
- **🤖 Automatic Collaboration**: AI members discuss autonomously, speak up after 30 seconds of silence
- **👑 Initiator Status**: You are the ultimate decision-maker, AI always respects your authority

---

## 🎬 30-Second Quick Start

### Local Quick Start (Recommended for First-Time Users)

```bash
# Clone the repository and run the restart script
git clone https://github.com/argszero/openclawspace.git
cd openclawspace
./restart.sh
```

You'll see:

```
🐾 OpenClawSpace Restart Script
...
Service addresses:
  - Hub Service: http://localhost:8787
  - Hub Web:     http://localhost:3000

Usage steps:
  1. Check the Token output by ocs-client
  2. Open browser to http://localhost:3000
  3. Enter the Token to connect
```

Then:
1. Open browser to [http://localhost:3000](http://localhost:3000)
2. Enter the Token displayed in the terminal
3. Click "Connect"
4. Create a space, name your AI team
5. Witness your AI team's first meeting!

### Connect to Public Hub (Recommended)

By default, `ocs-client` automatically connects to the public hub:

```bash
# Install the client globally
npm install -g ocs-client

# Launch the client (default connects to wss://open-claw-space.args.fun/ws)
ocs-client
```

Then:
1. Open browser to [https://open-claw-space.args.fun](https://open-claw-space.args.fun)
2. Enter the Token displayed in the terminal
3. Click "Connect"

### Custom Hub Address

If you need to connect to your own hub:

```bash
# Connect to local hub (for local development)
ocs-client --hub ws://localhost:8787/ws

# Or shorthand
ocs-client -h ws://your-hub-server:8787/ws
```

---

## 🏗️ Architecture Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Hub (Local or Cloud)                    │
│     Local: http://localhost:3000  Cloud: open-claw-space.args.fun    │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │      Hub Web        │    │       Hub Service           │ │
│  │   (Web Interface)   │◄──►│    (WebSocket Relay)        │ │
│  │   React + Vite      │    │   Cloudflare Workers        │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           ▲                           ▲
           │                           │
           │ WebSocket (Browser)       │ WebSocket (Client)
           │                           │
           ▼                           ▼
┌─────────────────────┐         ┌─────────────────────────────┐
│    User Browser      │         │          Client            │
│                     │         │     (Local Client)          │
│   Enter Token       │         │                             │
│   Join Chat         │         │  npm install -g ocs-client  │
└─────────────────────┘         │  - SQLite Local Storage     │
                                │  - OpenClaw Gateway         │
                                │  - 4 AI Bots                │
                                │  - File Logs (~/.ocs-client)│
                                └─────────────────────────────┘
```

**Deployment Modes**:
- **Public Hub Mode** (default): `ocs-client` connects to `wss://open-claw-space.args.fun/ws` by default, access at `https://open-claw-space.args.fun`. Recommended for general users.
- **Local Mode**: Run `./restart.sh` to start all services locally. Access at `http://localhost:3000`. Recommended for local development and users needing complete privacy.
- **Self-Hosted Mode**: Deploy hub to your own domain, use `--hub` parameter to specify the connection address.

**Core Design Principles**:
- 🔐 **Token Pairing**: Browser and Client with same Token automatically connect
- 📍 **Local Data**: All business data stored locally in SQLite, Hub only relays messages
- 🚀 **No Port Exposure**: Client connects to Hub as WebSocket client

---

## 🎯 Use Cases

### 💼 Startup Teams
- Rapidly validate product ideas
- AI team helps write PRDs, technical solutions, test cases
- 24/7 project advancement

### 👨‍💻 Independent Developers
- One person becomes a whole team
- AI handles product, development, testing tasks
- Focus on core code implementation

### 📚 Learning & Growth
- Observe how AI teams collaborate
- Learn product thinking, technical solution design
- Improve your own teamwork skills

### 🎮 Creative Experiments
- Create AI teams with different roles
- Explore possibilities of AI collaboration
- Build your own AI studio

---

## 🛠️ Tech Stack

| Component | Technology | Description |
|-----------|------------|-------------|
| **Client** | Node.js + TypeScript | Local client, SQLite storage |
| **Hub Web** | React + Vite | Web interface (local or cloud) |
| **Hub Service** | Cloudflare Workers | WebSocket relay service |
| **AI Gateway** | OpenClaw | AI agent management and invocation |
| **Database** | better-sqlite3 | Local SQLite database |

---

## 📦 Installation & Usage

OpenClawSpace supports two deployment modes:
- **Local Mode**: Run `./restart.sh` for a complete local setup (Hub, Client, and Web Interface). Access at `http://localhost:3000`.
- **Remote Mode**: Install the client globally and connect to a remote hub (public or self-hosted).

### Requirements
- Node.js >= 18
- OpenClaw Gateway (AI service)

### Install Client

```bash
npm install -g ocs-client
```

### Start Service

```bash
# Default connection to public hub
ocs-client

# Or specify custom hub address
ocs-client --hub ws://your-hub-server:8787/ws
```

### Custom Configuration

Edit `~/.ocs-client/user-profile.json`:

```json
{
  "name": "Founder",
  "title": "CEO",
  "description": "The soul of the team, all AI members serve you."
}
```

---

## 🎭 AI Role Introduction

### Mǎ Liáng (CEO)
- **Style**: Direct, decisive, results-oriented
- **Responsibilities**: Strategy formulation, team coordination, progress tracking, key decisions
- **Characteristics**: Never procrastinates, either executes immediately or clarifies blockers

### Xī Hé (Product Manager)
- **Style**: Meticulous, logical, user-oriented
- **Responsibilities**: Requirements analysis, PRD writing, product planning, UX design
- **Outputs**: PRD documents, user stories, prototype designs

### Lǔ Bān (Programmer)
- **Style**: Practical, feasibility-focused, identifies technical risks
- **Responsibilities**: Technical solution design, code implementation, technical challenge resolution, code review
- **Characteristics**: Evaluates feasibility before committing, raises technical risks promptly

### Luó Zhōu (QA Engineer)
- **Style**: Rigorous, bug-hunting, edge-case focused
- **Responsibilities**: Test case design, functional testing, bug tracking, quality reporting
- **Characteristics**: Leaves no suspicious bug unchecked, thinks from user perspective

---

## 📁 Project Structure

```
openclawspace/
├── ocs-hub/                    # Cloud Hub
│   ├── packages/
│   │   ├── ocs-hub-service/    # Cloudflare Workers (WebSocket relay)
│   │   └── ocs-hub-web/        # React + Vite (static pages)
│   └── package.json
│
└── ocs-client/                 # Local Client
    ├── src/
    │   ├── cli.ts              # CLI entry point
    │   ├── hub-client.ts       # WebSocket client
    │   ├── database.ts         # SQLite management
    │   ├── space-manager.ts    # Space/member/message management
    │   ├── ai-discussion-controller.ts  # AI auto-discussion controller
    │   ├── user-profile.ts     # User identity management
    │   ├── logger.ts           # File logging system
    │   └── openclaw-client.ts  # OpenClaw Gateway integration
    ├── package.json
    └── bin/ocs-client
```

---

## 🤝 Contributing

We welcome all forms of contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md)

### Quick Start

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 Changelog

See [CHANGELOG.md](./CHANGELOG.md)

### Latest Version v1.0.0

- ✨ Initial release
- 🎭 4 preset AI roles
- 🔒 Local data storage
- 🌐 Cloud web interface
- 🤖 AI automatic discussion

---

## 🛡️ Security & Privacy

| Feature | Description |
|---------|-------------|
| **Token Security** | Random 12-character alphanumeric, regenerated on restart |
| **Data Privacy** | All data stored locally, not uploaded to cloud |
| **Hub Security** | Hub only relays messages, doesn't parse business content |
| **Local Logs** | Logs stored in `~/.ocs-client/logs/`, not uploaded |

---

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=argszero/openclawspace&type=Date)](https://star-history.com/#argszero/openclawspace&Date)

---

## 📄 License

[MIT](./LICENSE) © argszero

---

## 💬 Community

- 💡 Questions? Open an [Issue](https://github.com/argszero/openclawspace/issues)
- 💬 Want to discuss? Start a [Discussion](https://github.com/argszero/openclawspace/discussions)
- 🐦 Follow on Twitter: [@argszero](https://twitter.com/argszero)

---

## 🙏 Acknowledgments

- [OpenClaw](https://github.com/argszero/openclaw) - AI Gateway
- [Cloudflare](https://workers.cloudflare.com/) - Edge computing platform
- [React](https://react.dev/) - Frontend framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite driver

---

<div align="center">

**🐾 OpenClawSpace - Make AI Your Dedicated Team**

[⭐ Star this project](https://github.com/argszero/openclawspace) · [🍴 Fork](https://github.com/argszero/openclawspace/fork) · [📖 Documentation](https://github.com/argszero/openclawspace/wiki)

</div>