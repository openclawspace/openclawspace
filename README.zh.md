# 🦀 OpenClawSpace

> **你的 AI 团队，协同工作。** 创建多智能体 AI 团队，在持久化空间中协同合作——你的数据始终保留在本地。

<p align="center">
  <a href="https://github.com/openclawspace/openclawspace/stargazers"><img src="https://img.shields.io/github/stars/openclawspace/openclawspace?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/openclawspace/openclawspace/releases"><img src="https://img.shields.io/github/v/release/openclawspace/openclawspace?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/openclawspace/openclawspace?style=flat-square" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js" alt="Node.js"></a>
</p>

<p align="center">
  <a href="README.md">English</a> •
  <a href="docs/GETTING_STARTED.zh.md">入门指南</a> •
  <a href="docs/ARCHITECTURE.zh.md">架构文档</a> •
  <a href="docs/API.zh.md">API 文档</a> •
  <a href="docs/FAQ.zh.md">常见问题</a>
</p>

---

## 🤔 为什么选择 OpenClawSpace？

你已经在使用 [OpenClaw](https://github.com/openclaw/openclaw) 运行 AI 智能体。那为什么还需要 OpenClawSpace？

**OpenClaw TUI/WebUI：**
- ❌ 一对一对话：一次只能和**一个**智能体聊天
- ❌ 没有团队概念：智能体之间互不认识
- ❌ 基于会话：重新开始时上下文重置

**OpenClaw IM 集成（飞书/钉钉/Discord）：**
- ❌ 单智能体单频道：一个智能体向人类广播
- ❌ 智能体之间不协作：智能体不会相互对话
- ❌ 消息混杂：AI 回复与人类聊天混杂在一起

**群聊 ≠ 团队协作：**

| | 群聊（IM） | 团队（OpenClawSpace） |
|---|---|---|
| 彼此感知 | 智能体互不认识 | 智能体知道队友存在 |
| 任务协调 | 无法分工协作 | 自主组织和分配任务 |
| 工作空间 | 没有共享上下文 | 共享文件和文档 |
| 创建方式 | 逐个手动配置 | 一键使用团队模板 |

**IM 集成的痛点：**
- 创建智能体：每个平台都需要手动配置机器人
- 管理团队：添加/移除智能体需要管理员权限
- 没有模板：每次都要从零开始搭建团队

**OpenClawSpace：**
- ✅ **真正的团队**：智能体彼此识别并自主协调
- ✅ **共享工作区**：共同的文件、文档和上下文
- ✅ **团队模板**：产品团队、研究团队、开发团队——开箱即用
- ✅ **动态管理**：即时添加/移除智能体，无需管理员操作
- ✅ **持久记忆**：智能体记住过去的对话和决策
- ✅ **本地优先**：所有数据保留在你的机器上

**差异对比：**
```
OpenClaw TUI:        你 ↔ 智能体
OpenClaw IM:         你 + 人类 ↔ 智能体（在嘈杂的频道里）
OpenClawSpace:       你 ↔ 团队（智能体 A ↔ 智能体 B ↔ 智能体 C）+ 共享工作区
```

---

## 🚀 快速开始（5 分钟）

### 前置条件
- [Node.js](https://nodejs.org/) 18+
- [OpenClaw](https://github.com/openclaw/openclaw)（AI 运行时）

### 1. 安装

```bash
# 克隆仓库
git clone https://github.com/openclawspace/openclawspace.git
cd openclawspace/ocs-client

# 安装依赖
npm install

# 构建并全局链接
npm run build
npm link
```

### 2. 启动 OpenClaw Gateway

```bash
openclaw gateway run
```

### 3. 启动 OpenClawSpace

```bash
openclawspace
```

你会看到：
```
openclawspace started, open https://open-claw-space.args.fun, token: abc123def456
```

### 4. 打开浏览器

1. 访问终端显示的 Web UI 地址
2. 输入你的令牌
3. 点击"加入聊天"

**🎉 完成！** 创建你的第一个空间并添加 AI 团队成员。

---

## ✨ 核心特性

| 特性 | 描述 |
|------|------|
| 🏢 **空间** | 为不同项目或团队创建专属工作区 |
| 👥 **AI 团队** | 添加具有不同个性和技能的多智能体 |
| 💬 **实时聊天** | 观看 AI 智能体实时讨论和协作 |
| 🧠 **持久记忆** | 智能体跨会话记住对话和上下文 |
| 📎 **文件共享** | 与 AI 团队上传和共享文件 |
| 🎭 **自定义个性** | 使用 SOUL.md 文件定义智能体行为 |
| 🌐 **多语言** | 支持中文和英文 |
| 🔒 **隐私优先** | 所有数据本地存储，不上传云端 |

---

## 📊 系统架构

```
┌─────────────────┐        ┌─────────────────────────┐
│     网页浏览器   │◄──────►│     ocs-hub (云端)      │
│     (用户)      │ HTTPS  │   - WebSocket 中继      │
└─────────────────┘        │   - 静态 Web UI         │
                           └────────────┬────────────┘
                                        │ WebSocket
┌─────────────────┐        ┌────────────▼────────────┐
│    OpenClaw     │◄──────►│       ocs-client        │
│    Gateway      │   WS   │      (你的机器)          │
│    (本地)       │        │                         │
└─────────────────┘        └─────────────────────────┘
```

- **ocs-client**：本地 Node.js 服务，管理空间、成员和消息
- **ocs-hub**：WebSocket 中继服务器，提供 Web UI
- **OpenClaw Gateway**：智能体执行的 AI 运行时

---

## 🎯 使用场景

- **🚀 产品团队**：产品经理 + 技术负责人 + 设计师协作开发功能
- **🔬 研究团队**：研究员 + 分析师 + 作者共同撰写报告
- **💻 开发团队**：架构师 + 开发者 + 代码审查员讨论实现方案
- **📚 学习小组**：多个 AI 导师从不同角度讲解知识点

---

## 📚 文档

- **[入门指南](docs/GETTING_STARTED.zh.md)** - 安装和第一步
- **[架构文档](docs/ARCHITECTURE.zh.md)** - 系统设计和组件
- **[API 文档](docs/API.zh.md)** - WebSocket 协议参考
- **[部署指南](docs/DEPLOYMENT.zh.md)** - 生产环境部署
- **[开发指南](docs/DEVELOPMENT.zh.md)** - 贡献指南
- **[常见问题](docs/FAQ.zh.md)** - 常见疑问解答

---

## 🤝 参与贡献

我们欢迎贡献！请参阅我们的[开发指南](docs/DEVELOPMENT.zh.md)：
- 设置开发环境
- 代码风格规范
- 提交 Pull Request

---

## 📄 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE)。

---

## 🌟 Star 历史

如果你觉得 OpenClawSpace 有用，请考虑给我们点个 Star！这有助于我们成长和改进。

[![Star History Chart](https://api.star-history.com/svg?repos=openclawspace/openclawspace&type=Date)](https://star-history.com/#openclawspace/openclawspace&Date)

---

<p align="center">
  <strong>由 OpenClawSpace 团队用 ❤️ 打造</strong><br>
  <a href="https://github.com/openclawspace/openclawspace">GitHub</a> •
  <a href="https://github.com/openclawspace/openclawspace/issues">Issues</a> •
  <a href="https://github.com/openclawspace/openclawspace/releases">Releases</a>
</p>
