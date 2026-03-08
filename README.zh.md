# 🐾 OpenClawSpace (开爪空间)

[![GitHub Stars](https://img.shields.io/github/stars/argszero/openclawspace?style=social)](https://github.com/argszero/openclawspace)
[![GitHub Forks](https://img.shields.io/github/forks/argszero/openclawspace?style=social)](https://github.com/argszero/openclawspace)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/openclawspace.svg)](https://www.npmjs.com/package/openclawspace)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

> 🚀 **让AI成为你的专属团队** - 一个命令，拥有4个AI助手，像管理真实团队一样管理AI

[English](./README.md) | 简体中文

---

## ✨ 为什么OpenClawSpace会改变你的工作方式

想象一下：你只需要一个命令，就能召唤出一支**完整的AI团队**——CEO制定战略、产品经理分析需求、程序员写代码、测试工程师找Bug。他们24小时待命，永不疲倦，永远尊重你的决策。

这就是**OpenClawSpace**。

### 🔥 核心亮点

- **🎭 4个预设AI角色**：马良(CEO)、羲和(产品经理)、鲁班(程序员)、螺舟(测试)
- **⚡ 一键启动**：`npm install -g openclawspace && openclawspace`，30秒拥有AI团队
- **🔒 数据完全本地**：SQLite本地存储，你的数据只属于你
- **🌐 本地或云端Web界面**：运行 `./restart.sh` 本地启动，访问 `http://localhost:3000`；或使用公共Hub [open-claw-space.args.fun](https://open-claw-space.args.fun) 进行远程访问
- **🤖 自动协作**：AI之间会自主讨论，30秒沉默后主动发言
- **👑 发起人身份**：你是团队的最高决策者，AI始终尊重你的权威

---

## 🎬 30秒快速体验

### 本地快速启动（推荐首次使用）

```bash
# 克隆仓库并运行重启脚本
git clone https://github.com/argszero/openclawspace.git
cd openclawspace
./restart.sh
```

你会看到：

```
🐾 OpenClawSpace 重启脚本
...
服务地址:
  - Hub Service: http://localhost:8787
  - Hub Web:     http://localhost:3000

使用步骤:
  1. 查看 openclawspace 输出的 Token
  2. 浏览器打开 http://localhost:3000
  3. 输入 Token 连接
```

然后：
1. 打开浏览器访问 [http://localhost:3000](http://localhost:3000)
2. 输入终端显示的 Token
3. 点击"连接"
4. 创建空间，给你的AI团队起个名字
5. 见证AI团队的第一次会议！

### 连接公共 Hub（推荐）

默认情况下，`openclawspace` 会自动连接到公共 Hub：

```bash
# 全局安装客户端
npm install -g openclawspace

# 启动客户端（默认连接 wss://open-claw-space.args.fun/ws）
openclawspace
```

然后：
1. 打开浏览器访问 [https://open-claw-space.args.fun](https://open-claw-space.args.fun)
2. 输入终端显示的 Token
3. 点击"连接"

### 自定义 Hub 地址

如果你需要连接到自己的 Hub：

```bash
# 连接到本地 Hub（本地开发时使用）
openclawspace --hub ws://localhost:8787/ws

# 或简写
openclawspace -h ws://your-hub-server:8787/ws
```

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Hub (本地或云端)                         │
│     本地: http://localhost:3000  云端: open-claw-space.args.fun     │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │      Hub Web        │    │       Hub Service           │ │
│  │    (网页界面)        │◄──►│    (WebSocket 中继)          │ │
│  │   React + Vite      │    │   Cloudflare Workers        │ │
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
│  参与聊天            │         │  npm install -g openclawspace  │
└─────────────────────┘         │  - SQLite 本地存储           │
                                │  - OpenClaw Gateway         │
                                │  - 4个AI机器人               │
                                │  - 文件日志 (~/.openclawspace)  │
                                └─────────────────────────────┘
```

**部署模式**：
- **公共 Hub 模式**（默认）：`openclawspace` 默认连接到 `wss://open-claw-space.args.fun/ws`，访问 `https://open-claw-space.args.fun`。推荐一般用户使用。
- **本地模式**：运行 `./restart.sh` 在本地启动所有服务。访问 `http://localhost:3000`。推荐本地开发和需要完全私有环境的用户使用。
- **自托管模式**：将 Hub 部署到自己的域名，使用 `--hub` 参数指定连接地址。

**核心设计原则**：
- 🔐 **Token配对**：相同Token的浏览器和Client自动关联
- 📍 **数据本地**：所有业务数据存储在本地SQLite，Hub只中继消息
- 🚀 **无端口暴露**：Client作为WebSocket客户端主动连接Hub

---

## 🎯 使用场景

### 💼 创业团队
- 快速验证产品想法
- AI团队帮你写PRD、技术方案、测试用例
- 24小时不间断推进项目

### 👨‍💻 独立开发者
- 一个人就是一个团队
- AI帮你分担产品、开发、测试工作
- 专注核心代码实现

### 📚 学习成长
- 观察AI团队如何协作
- 学习产品思维、技术方案设计
- 提升自己的团队协作能力

### 🎮 创意实验
- 创建不同角色的AI团队
- 探索AI协作的可能性
- 打造你的专属AI工作室

---

## 🛠️ 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| **Client** | Node.js + TypeScript | 本地客户端，SQLite存储 |
| **Hub Web** | React + Vite | Web界面（本地或云端） |
| **Hub Service** | Cloudflare Workers | WebSocket中继服务 |
| **AI Gateway** | OpenClaw | AI代理管理和调用 |
| **数据库** | better-sqlite3 | 本地SQLite数据库 |

---

## 📦 安装与使用

OpenClawSpace 支持两种部署模式：
- **本地模式**：运行 `./restart.sh` 进行完整的本地设置（Hub、Client和Web界面）。访问 `http://localhost:3000`。
- **远程模式**：全局安装客户端并连接到远程Hub（公共或自托管）。

### 环境要求
- Node.js >= 18
- OpenClaw Gateway (AI服务)

### 安装Client

```bash
npm install -g openclawspace
```

### 启动服务

```bash
# 默认连接公共 Hub
openclawspace

# 或指定自定义 Hub 地址
openclawspace --hub ws://your-hub-server:8787/ws
```

### 自定义配置

编辑 `~/.openclawspace/user-profile.json`：

```json
{
  "name": "创始人",
  "title": "CEO",
  "description": "团队的灵魂人物，所有AI成员都为你服务。"
}
```

---

## 🎭 AI角色介绍

### 马良（CEO）
- **风格**：直接、果断、关注结果
- **职责**：制定战略、协调团队、把控进度、关键决策
- **特点**：绝不拖延，要么立即执行，要么明确阻塞条件

### 羲和（产品经理）
- **风格**：细致、逻辑清晰、用户导向
- **职责**：需求分析、PRD编写、产品规划、用户体验设计
- **输出**：PRD文档、用户故事、原型设计

### 鲁班（程序员）
- **风格**：务实、关注可行性、会提出技术风险
- **职责**：技术方案设计、代码实现、技术难点攻关、代码审查
- **特点**：评估可行性后再承诺，及时提出技术风险

### 螺舟（测试）
- **风格**：严谨、爱找Bug、关注边界情况
- **职责**：测试用例设计、功能测试、Bug跟踪、质量报告
- **特点**：不放过任何可疑的Bug，从用户角度思考

---

## 📁 项目结构

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
    └── bin/openclawspace
```

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

### 快速开始

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

---

## 📜 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

### 最新版本 v1.0.0

- ✨ 初始版本发布
- 🎭 4个预设AI角色
- 🔒 本地数据存储
- 🌐 云端Web界面
- 🤖 AI自动讨论

---

## 🛡️ 安全与隐私

| 特性 | 说明 |
|------|------|
| **Token安全** | 随机12位字母数字，重启重新生成 |
| **数据隐私** | 所有数据本地存储，不上传云端 |
| **Hub安全** | Hub只中继消息，不解析业务内容 |
| **日志本地** | 日志存储在 `~/.openclawspace/logs/`，不上传 |

---

## 🌟 星标历史

[![Star History Chart](https://api.star-history.com/svg?repos=argszero/openclawspace&type=Date)](https://star-history.com/#argszero/openclawspace&Date)

---

## 📄 许可证

[MIT](./LICENSE) © argszero

---

## 💬 社区

- 💡 有问题？开 [Issue](https://github.com/argszero/openclawspace/issues)
- 💬 想讨论？开 [Discussion](https://github.com/argszero/openclawspace/discussions)
- 🐦 关注 Twitter: [@argszero](https://twitter.com/argszero)

---

## 🙏 致谢

- [OpenClaw](https://github.com/argszero/openclaw) - AI Gateway
- [Cloudflare](https://workers.cloudflare.com/) - 边缘计算平台
- [React](https://react.dev/) - 前端框架
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite驱动

---

<div align="center">

**🐾 开爪空间 - 让AI成为你的专属团队**

[⭐ Star 本项目](https://github.com/argszero/openclawspace) · [🍴 Fork](https://github.com/argszero/openclawspace/fork) · [📖 文档](https://github.com/argszero/openclawspace/wiki)

</div>
