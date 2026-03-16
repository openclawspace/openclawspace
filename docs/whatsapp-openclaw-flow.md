# WhatsApp + OpenClaw 技术调研场景调用流程

> 描述用户在 WhatsApp 中让 OpenClaw Agent 完成技术调研并接收文档的完整流程

---

## 架构概述

OpenClaw 运行在用户本地机器上，包含以下核心组件：

1. **OpenClaw Core**：Agent 运行时环境，负责执行所有 AI 任务
2. **Gateway**：本地 WebSocket 服务，管理 Agent 连接和消息流转
3. **WhatsApp Channel**：连接 WhatsApp Web 的适配器，使用 Baileys 库实现

WhatsApp 是 OpenClaw 的一个消息渠道（Channel），和 Telegram、Slack、Discord 等渠道地位相同。

用户手机上的 WhatsApp 通过 WhatsApp 服务器与 OpenClaw 建立连接。

---

## 完整调用流程

### 阶段一：用户发起任务

1. **用户发送消息**
   - 用户在 WhatsApp 中发送文本消息："请调研 React 19 新特性，生成技术文档"
   - 消息通过 WhatsApp 服务器到达 OpenClaw

2. **WhatsApp 渠道接收消息**
   - OpenClaw 的 WhatsApp Channel 监听到新消息
   - 提取消息内容、发送者信息、时间戳等元数据
   - 验证发送者身份和权限

3. **构建消息上下文**
   - OpenClaw 创建入站消息上下文
   - 记录当前渠道标识为 "whatsapp"
   - 生成会话标识（Session Key），用于关联后续的 Agent 交互

4. **路由到 Agent**
   - Gateway 根据配置的路由规则，将消息分配给对应的 Agent
   - 启动 Agent 运行会话

---

### 阶段二：Agent 自主执行任务

5. **Agent 接收任务**
   - Agent 从会话记录中读取用户消息
   - 分析任务需求：调研 React 19 新特性并生成文档

6. **Agent 自主完成调研**
   - Agent 调用 browser 工具，打开浏览器访问 React 19 官方文档
   - Agent 调用 read 工具，阅读并分析文档内容
   - Agent 可能还会调用 search 工具，搜索相关技术文章和示例
   - 整个过程完全在 OpenClaw Core 内部完成，无需外部干预

7. **Agent 生成技术文档**
   - Agent 整理调研结果
   - 在本地 workspace 目录生成 Markdown 格式的技术文档
   - 文档包含 React 19 的新特性介绍、使用示例、迁移指南等内容

---

### 阶段三：Agent 发送文档

8. **Agent 调用消息工具**
   - Agent 调用 message 工具的 sendAttachment 动作
   - 指定要发送的文档路径
   - 添加说明文字："React 19 技术调研报告已完成"

9. **渠道自动选择**
   - message 工具检查是否有显式指定的渠道
   - 如果没有，使用工具上下文中记录的渠道信息
   - 由于入站消息来自 WhatsApp，自动选择 WhatsApp 渠道

10. **目标解析**
    - 从入站消息上下文中获取发送者的 WhatsApp JID
    - 验证发送者是否在允许列表中

11. **发送附件**
    - WhatsApp outbound adapter 读取本地文档文件
    - 通过 Baileys 库调用 WhatsApp Web API
    - 将文档作为文件消息发送到用户 WhatsApp

12. **用户接收文档**
    - 用户手机 WhatsApp 收到新消息
    - 显示文档文件名和说明文字
    - 用户可以下载查看完整的技术调研报告

---

## 关键概念说明

### 渠道（Channel）

OpenClaw 支持多种消息渠道，包括：
- 即时通讯：WhatsApp、Telegram、Slack、Discord
- 本地界面：OpenClawSpace（Gateway）、Web UI
- 其他：Email、SMS 等

每个渠道都有独立的 inbound（接收）和 outbound（发送）适配器。

### Agent 的渠道无感知性

Agent 在执行任务时不知道自己通过哪个渠道与用户交互：

- 接收消息：通过统一的会话层，不区分渠道来源
- 发送消息：调用 message 工具，由工具根据上下文自动选择渠道
- 执行任务：完全在 Core 内部运行，与渠道无关

这意味着同一个 Agent 可以同时服务多个渠道的用户，行为完全一致。

### 消息工具的路由机制

message 工具选择渠道的优先级：

1. 显式指定：Agent 在调用时明确指定 channel 参数
2. 上下文回退：使用入站消息记录的 currentChannelProvider
3. 单一渠道：如果只配置了一个渠道，直接使用

在技术调研场景中，通常使用第 2 种方式，自动回复到原渠道。

---

## 和 OpenClawSpace 的对比

| 维度 | WhatsApp + OpenClaw | OpenClawSpace |
|------|---------------------|---------------|
| 用户界面 | WhatsApp App | Hub Web 网页 |
| Agent 运行环境 | OpenClaw Core | OpenClaw Core |
| 消息接收方式 | WhatsApp WebSocket | Gateway WebSocket |
| 渠道标识 | whatsapp | gateway |
| 附件接收方式 | 手机接收文件 | 浏览器显示文件 |
| 数据存储位置 | 用户手机 | 本地 SQLite + 文件系统 |

### 本质相同点

两者都是 OpenClaw 的消息渠道：

- Agent 完全无感知：不知道自己通过哪个渠道交互
- 使用相同的 message 工具发送消息和附件
- 都通过上下文自动路由
- Agent 的核心逻辑（调研、生成文档）完全相同

### 流程差异

唯一差异在消息收发环节：

- **WhatsApp**：通过 Baileys 库连接 WhatsApp Web，消息格式为 WhatsApp 协议
- **OpenClawSpace**：通过 Gateway WebSocket，消息格式为 OpenClaw 内部协议

Agent 的任务执行逻辑完全一致，都是：
1. 接收任务消息
2. 自主调研（browser、read 等工具）
3. 生成文档到 workspace
4. 调用 message 工具发送结果

---

## 总结

**WhatsApp + OpenClaw 技术调研流程**：

1. 用户在 WhatsApp 发送任务
2. WhatsApp 渠道接收并路由到 Agent
3. Agent 在 Core 内部自主完成调研和文档生成
4. Agent 调用 message 工具发送文档
5. 工具自动选择 WhatsApp 渠道
6. 文档发送到用户手机

**核心认知**：OpenClawSpace 和 WhatsApp 是同一层级的消息渠道，Agent 的核心能力（调研、文档生成）完全在 OpenClaw Core 内部完成，与渠道无关。

这意味着：
- 如果用户通过 WhatsApp 发送任务，Agent 在 WhatsApp 回复
- 如果用户通过 OpenClawSpace 发送任务，Agent 在 OpenClawSpace 回复
- Agent 的执行逻辑完全相同，只是回复的渠道不同
