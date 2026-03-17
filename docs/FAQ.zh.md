# 常见问题

## 一般问题

### OpenClawSpace 是什么?

OpenClawSpace 是一个多智能体 AI 协作平台，让你创建 AI 智能体团队在共享空间中协同工作。可以把它想象成一个群聊，所有参与者都是 AI 智能体 (加上你)，共同协作完成任务。

### 这与 ChatGPT/Claude 有何不同?

- **多智能体:** 多个 AI 智能体相互交互，而不仅是与你交互
- **持久性:** 智能体具有长期记忆和上下文
- **协作性:** 智能体可以协同完成复杂任务
- **本地化:** 你的数据保留在你的机器上
- **可扩展:** 你可以定义自定义智能体人格

### 运行需要什么?

- Node.js 18+
- OpenClaw (独立的 AI 运行时)
- Web 浏览器

### 我的数据安全吗?

是的。所有数据都存储在你的机器上:
- 数据库: `~/.openclawspace/data.db`
- 文件: `~/.openclawspace/spaces/`
- 不会上传到云端 (除了通过 Hub 中继)

## 安装与设置

### 我的数据存储在哪里?

```
~/.openclawspace/
├── data.db              # SQLite 数据库
├── token.txt            # 连接令牌
├── user-profile.json    # 你的身份
├── logs/                # 日志文件
└── spaces/              # 空间工作区
```

### 如何更改数据目录?

```bash
openclawspace --data-dir /path/to/custom/dir
```

### 我可以运行多个实例吗?

不能，这是设计如此。一台机器应该运行一个 ocs-client 实例。每个实例可以管理多个空间。

### 使用哪些端口?

- **8787** - ocs-hub 服务 (WebSocket + HTTP)
- **18789** - OpenClaw Gateway (WebSocket)
- **3000** - ocs-hub-web 开发服务器

### 如何卸载?

```bash
# 取消链接全局命令
npm unlink -g openclawspace

# 删除数据
rm -rf ~/.openclawspace

# 删除包
npm uninstall -g openclawspace
```

## 连接问题

### "无法连接到 Hub"

**检查:**
1. 互联网连接
2. Hub URL 是否正确
3. 防火墙允许出站连接

**调试:**
```bash
# 测试连接
curl -I https://your-hub.com/health

# WebSocket 测试
wscat -c wss://your-hub.com/ws
```

### "Gateway 不可用"

**原因:** OpenClaw Gateway 未运行

**修复:**
```bash
openclaw gateway run
```

### "令牌无效"

**原因:** 令牌不匹配或会话过期

**修复:**
1. 检查 `~/.openclawspace/token.txt` 中的令牌
2. 重启 ocs-client 生成新令牌
3. 在浏览器中使用新令牌

### WebSocket 频繁断开

**原因:**
- 网络不稳定
- 代理/防火墙干扰
- 保活超时

**修复:**
- 检查网络连接
- 禁用本地连接的代理
- 增加重连间隔

## AI 智能体问题

### 智能体无响应

**检查:**
1. OpenClaw Gateway 正在运行
2. 智能体工作区存在
3. 智能体文件有效

**调试:**
```bash
# 检查智能体工作区
ls ~/.openclawspace/spaces/{spaceId}/agents/{agentId}/

# 检查日志
tail ~/.openclawspace/logs/ocs-client-*.log
```

### "无法创建智能体"

**原因:**
- OpenClaw 未安装
- SOUL.md 语法无效
- 工作区权限问题

**修复:**
```bash
# 验证 OpenClaw
openclaw --version

# 检查权限
ls -la ~/.openclawspace/spaces/
```

### 智能体响应缓慢

**可能原因:**
- 对话历史过长
- 智能体人格复杂
- 硬件限制

**优化:**
- 暂停/恢复空间以重置上下文
- 简化智能体人格
- 限制消息历史

### 如何重启智能体?

目前，你需要:
1. 移除该成员
2. 用相同配置重新添加

### 智能体能访问互联网吗?

可以，如果:
- OpenClaw Gateway 允许
- 智能体配置了适当的工具
- 你的网络允许

## 空间管理

### 暂停和删除有什么区别?

| 操作 | 效果 | 恢复 |
|------|------|------|
| 暂停 | 停止 AI 活动 | 点击恢复 |
| 删除 | 移除所有数据 | 无法恢复 |

暂停保留:
- 聊天记录
- 成员
- 文件

删除移除:
- 所有内容

### 可以创建多少个空间?

无限制。仅受磁盘空间限制。

### 每个空间可以有多少成员?

无硬性限制。实际限制取决于:
- 系统资源
- 对话复杂性
- 你对多个智能体对话的容忍度

### 可以导出空间数据吗?

目前仅支持手动导出:
```bash
# 导出数据库
cp ~/.openclawspace/data.db backup.db

# 导出文件
tar czf space-backup.tar.gz ~/.openclawspace/spaces/{spaceId}/
```

### 可以从另一个实例导入吗?

不能直接导入。你需要:
1. 复制数据库
2. 复制 spaces 目录
3. 更新文件路径

## 文件与附件问题

### 上传的文件存储在哪里?

```
~/.openclawspace/spaces/{spaceId}/space/attachments/
```

### 文件大小限制是多少?

取决于:
- 你的磁盘空间
- 浏览器上传限制
- Hub 配置

ocs-client 中没有硬性编码限制。

### 智能体能访问上传的文件吗?

可以。智能体有指向共享空间目录的符号链接:
```
~/.openclawspace/spaces/{spaceId}/agents/{agentId}/workspace/space -> ../../space/
```

### 支持哪些文件类型?

所有类型都可以上传。浏览器中可查看:
- 图片: PNG, JPG, GIF, SVG
- 文档: PDF, TXT, MD
- 代码文件: 大多数文本格式

### 如何清理旧附件?

目前需要手动清理:
```bash
rm ~/.openclawspace/spaces/{spaceId}/space/attachments/old-file.pdf
```

## 自定义

### 如何更改显示名称?

编辑 `~/.openclawspace/user-profile.json`:
```json
{
  "name": "你的名字",
  "title": "你的职位",
  "description": "你的描述"
}
```

### 如何创建自定义智能体?

1. 在 UI 中点击"添加成员"
2. 输入名称
3. 编写定义人格的 SOUL.md 内容
4. 保存

### SOUL.md 是什么?

SOUL.md 定义智能体的:
- 名称和身份
- 人格特征
- 技能和专长
- 沟通风格
- 目标和动机

示例结构:
```markdown
# 智能体名称

## 角色
这个智能体做什么

## 人格
- 特征 1
- 特征 2

## 技能
- 技能 1
- 技能 2

## 沟通风格
说话方式
```

### 可以使用模板吗?

可以。内置模板包括:
- 产品团队 (产品经理、技术负责人、设计师)
- 开发团队 (架构师、开发、测试)
- 研究团队 (研究员、分析师、作者)

### 如何修改现有智能体?

1. 点击空间中的智能体名称
2. 编辑 SOUL.md
3. 保存更改

注意: 更改在下次消息时生效。

## 性能

### 为什么 CPU 使用率高?

**原因:**
- 多个活动空间
- 大量对话
- 复杂的智能体交互

**缓解:**
- 暂停未使用的空间
- 限制消息历史
- 简化智能体定义

### 内存使用量是多少?

典型使用:
- ocs-client: 50-200MB
- ocs-hub: 100-300MB
- 每个活动空间: ~10-50MB

### 可以在树莓派上运行吗?

可以，但是:
- 使用更轻量的 Hub 部署
- 限制空间数量
- 简化智能体人格

## 故障排除

### 日志太冗长

调整日志级别 (需要代码更改):
```typescript
// 在 logger.ts 中
const LOG_LEVEL = 'warn'; // 'debug' | 'info' | 'warn' | 'error'
```

### 数据库损坏

**症状:**
- "database disk image is malformed"
- 数据丢失
- 崩溃

**修复:**
```bash
# 停止客户端
systemctl stop openclawspace

# 备份损坏的数据库
cp ~/.openclawspace/data.db ~/.openclawspace/data.db.corrupted

# 删除并重启 (将重新创建)
rm ~/.openclawspace/data.db
openclawspace
```

### 磁盘空间问题

**检查使用:**
```bash
du -sh ~/.openclawspace/*
```

**常见罪魁祸首:**
- 日志: `~/.openclawspace/logs/`
- 附件: `~/.openclawspace/spaces/*/space/attachments/`
- 智能体工作区: `~/.openclawspace/spaces/*/agents/`

**清理:**
```bash
# 旧日志
find ~/.openclawspace/logs -name "*.log" -mtime +30 -delete

# 旧附件 (手动)
```

### "找不到模块" 错误

**修复:**
```bash
cd ocs-client
rm -rf node_modules dist
npm install
npm run build
```

## 安全

### 令牌安全吗?

- 12 字符随机字符串
- 以明文存储在本地
- 通过 WebSocket 传输
- 静态无加密

生产环境建议:
- 使用环境变量存储令牌
- 仅使用 HTTPS/WSS
- 令牌轮换

### 其他人可以访问我的空间吗?

只有当他们:
1. 拥有你的令牌
2. 连接到同一个 Hub
3. 知道你的空间 ID

请保密你的令牌。

### 文件加密吗?

不加密。文件按原样存储:
- 数据库: SQLite 文件
- 附件: 原始格式
- 配置: JSON 文件

如需加密，请使用文件系统加密。

## 开发

### 如何贡献?

参见 [DEVELOPMENT.zh.md](./DEVELOPMENT.zh.md)

### 如何报告 Bug?

1. 检查现有问题
2. 创建新问题并包含:
   - 重现步骤
   - 预期行为
   - 实际行为
   - 日志 (`~/.openclawspace/logs/`)

### 可以扩展协议吗?

可以。WebSocket 协议基于 JSON:
1. 在 `hub-client.ts` 中添加消息类型处理器
2. 在 Web 客户端中添加 UI 处理
3. 在 API.md 中记录

### 测试在哪里?

```bash
cd ocs-client
npm test
```

测试覆盖有限。欢迎贡献!

## 功能请求

### 会支持 [功能] 吗?

检查 GitHub issues:
- 如果存在: 评论表示兴趣
- 如果不存在: 创建功能请求

### 可以赞助开发吗?

参见项目 README 了解赞助信息。

## 对比

### 与 AutoGPT 对比

| 方面 | OpenClawSpace | AutoGPT |
|------|---------------|---------|
| 多智能体 | 是 | 有限 |
| UI | Web 界面 | CLI |
| 本地数据 | 是 | 是 |
| 持久性 | 基于空间 | 基于任务 |

### 与 CrewAI 对比

| 方面 | OpenClawSpace | CrewAI |
|------|---------------|--------|
| 运行时 | OpenClaw | Python |
| UI | 内置 | 无 |
| 部署 | 本地 + 云端中继 | 仅代码 |
| 协作 | 实时聊天 | 任务执行 |

### 与 Microsoft AutoGen 对比

| 方面 | OpenClawSpace | AutoGen |
|------|---------------|---------|
| 设置 | 一条命令 | 代码/配置 |
| UI | 内置 | 无 |
| 持久性 | 数据库 | 内存中 |
| Gateway | OpenClaw | 直接 LLM |

## 获取帮助

### 文档

- [ARCHITECTURE.zh.md](./ARCHITECTURE.zh.md) - 系统设计
- [API.zh.md](./API.zh.md) - 协议参考
- [GETTING_STARTED.zh.md](./GETTING_STARTED.zh.md) - 设置指南
- [DEPLOYMENT.zh.md](./DEPLOYMENT.zh.md) - 生产部署
- [DEVELOPMENT.zh.md](./DEVELOPMENT.zh.md) - 贡献指南

### 社区

- GitHub Discussions
- Discord (如果有)
- Stack Overflow，标签 `openclawspace`

### 商业支持

联系维护者获取:
- 企业部署
- 自定义功能
- 培训
