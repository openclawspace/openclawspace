# 开发指南

## 项目结构

```
openclawspace/
├── ocs-client/           # 本地 AI 团队服务
│   ├── src/             # TypeScript 源码
│   ├── dist/            # 编译后的 JavaScript
│   ├── package.json
│   └── tsconfig.json
├── ocs-hub/             # WebSocket 中继 + Web UI
│   ├── packages/
│   │   ├── ocs-hub-service/   # Node.js WebSocket 服务器
│   │   └── ocs-hub-web/       # React SPA
│   └── docker-compose.yml
├── docs/                # 文档
├── scripts/             # 构建脚本
├── package.json         # 根 package.json
└── README.md
```

## 设置开发环境

### 前置条件

- Node.js >= 18
- npm >= 9
- Git
- OpenClaw (用于 AI 功能)

### 克隆仓库

```bash
git clone https://github.com/yourusername/openclawspace.git
cd openclawspace
```

### 安装依赖

**根目录:**
```bash
npm install
```

**ocs-client:**
```bash
cd ocs-client
npm install
```

**ocs-hub-service:**
```bash
cd ocs-hub/packages/ocs-hub-service
npm install
```

**ocs-hub-web:**
```bash
cd ocs-hub/packages/ocs-hub-web
npm install
```

## 开发工作流

### 1. 启动 OpenClaw Gateway

```bash
openclaw gateway run
```

### 2. 构建 ocs-client

```bash
cd ocs-client
npm run build
npm link  # 用于全局访问
```

监视模式:
```bash
npm run dev
```

### 3. 启动 ocs-hub (用于 Web UI)

```bash
cd ocs-hub
docker-compose up
```

或手动启动:

```bash
# Service
cd ocs-hub/packages/ocs-hub-service
npm run dev

# Web (在另一个终端)
cd ocs-hub/packages/ocs-hub-web
npm run dev
```

### 4. 运行 ocs-client

```bash
openclawspace --hub ws://localhost:8787/ws
```

### 5. 打开浏览器

访问 `http://localhost:3000` 并输入令牌。

## 代码组织

### ocs-client/src/

| 文件 | 用途 |
|------|------|
| `cli.ts` | 使用 Commander 的 CLI 入口 |
| `hub-client.ts` | 与 Hub 通信的 WebSocket 客户端 |
| `space-manager.ts` | 核心业务逻辑 - 空间、成员、消息 |
| `database.ts` | SQLite 数据库层 (sql.js) |
| `openclaw-client.ts` | OpenClaw CLI 包装器 |
| `gateway-client.ts` | OpenClaw Gateway WebSocket 客户端 |
| `ai-discussion-controller.ts` | AI 沉默检测和编排 |
| `user-profile.ts` | 用户身份管理 |
| `logger.ts` | 文件 + 控制台日志 |
| `ai-i18n.ts` | AI 提示国际化 |
| `templates/` | 团队模板和 SOUL.md 生成器 |

### ocs-hub-service/src/

| 文件 | 用途 |
|------|------|
| `index.ts` | 主服务器 - HTTP + WebSocket |

### ocs-hub-web/src/

| 文件 | 用途 |
|------|------|
| `App.tsx` | 主 React 应用 |
| `index.css` | Tailwind CSS 样式 |
| `i18n.ts` | i18next 配置 |
| `locales/` | 翻译文件 |
| `components/` | React 组件 |

## 构建

### ocs-client

```bash
cd ocs-client
npm run build        # TypeScript 编译
npm run build:watch  # 监视模式
```

输出: `dist/` 文件夹包含编译后的 JavaScript

### ocs-hub-service

```bash
cd ocs-hub/packages/ocs-hub-service
npm run build
```

### ocs-hub-web

```bash
cd ocs-hub/packages/ocs-hub-web
npm run build        # 生产构建
npm run dev          # 开发服务器
```

输出: `dist/` 文件夹包含静态资源

## 测试

### 运行测试

```bash
# ocs-client
cd ocs-client
npm test

# ocs-hub-service
cd ocs-hub/packages/ocs-hub-service
npm test
```

### 测试结构

```
src/
├── __tests__/
│   ├── unit/
│   │   ├── database.test.ts
│   │   ├── space-manager.test.ts
│   │   └── hub-client.test.ts
│   └── integration/
│       └── full-workflow.test.ts
```

## 代码风格

### TypeScript 配置

**ocs-client/tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  }
}
```

### 代码检查

```bash
# ESLint
npm run lint

# 修复可自动修复的问题
npm run lint:fix

# Prettier
npm run format
```

### 命名规范

- **文件:** kebab-case.ts
- **类:** PascalCase
- **函数:** camelCase
- **常量:** UPPER_SNAKE_CASE
- **接口:** PascalCase，描述性名称

示例:
```typescript
// 良好
interface SpaceConfig {
  name: string;
  maxMembers: number;
}

class SpaceManager {
  private readonly DEFAULT_TIMEOUT = 30000;

  async createSpace(config: SpaceConfig): Promise<Space> {
    // 实现
  }
}
```

## 调试

### VS Code 配置

**.vscode/launch.json:**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug ocs-client",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/ocs-client/dist/cli.js",
      "args": ["--hub", "ws://localhost:8787/ws"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### 调试日志

启用详细日志:

```typescript
// 在代码中
logger.debug('Detailed info', { data });
```

检查日志:
```bash
tail -f ~/.openclawspace/logs/ocs-client-$(date +%Y-%m-%d).log
```

### WebSocket 调试

使用 Chrome DevTools 网络标签页检查 WebSocket 消息。

## 数据库迁移

修改数据库 Schema 时:

1. 更新 `database.ts` Schema 定义
2. 在 `migrateTables()` 中添加迁移逻辑
3. 使用现有数据库测试

迁移示例:
```typescript
private async migrateTables(): Promise<void> {
  // 检查列是否存在
  const result = this.db.exec(
    "SELECT COUNT(*) FROM pragma_table_info('members') WHERE name='role'"
  );

  if (result[0].values[0][0] === 0) {
    // 添加新列
    this.db.run(`ALTER TABLE members ADD COLUMN role TEXT DEFAULT 'member'`);
  }
}
```

## 添加新功能

### 功能清单

- [ ] 更新相关源文件
- [ ] 添加/更新测试
- [ ] 更新文档
- [ ] 更新 CHANGELOG.md
- [ ] 确保向后兼容

### 添加新消息类型

1. 在 `HubClient.handleMessage()` switch 中添加类型
2. 添加处理方法
3. 更新浏览器 UI 以处理新类型
4. 在 API.md 中记录

### 添加新数据库实体

1. 在 `database.ts` 中定义接口
2. 在 `initTables()` 中添加表 Schema
3. 向 `Database` 类添加 CRUD 方法
4. 通过 `SpaceManager` 暴露
5. 在 `HubClient` 中连接

## 贡献

### 拉取请求流程

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 运行测试和代码检查
5. 更新文档
6. 提交 PR 并附上清晰描述

### 提交信息格式

```
type(scope): subject

body

footer
```

类型:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档
- `style`: 格式化
- `refactor`: 代码重构
- `test`: 测试
- `chore`: 构建/工具

示例:
```
feat(space-manager): 添加暂停/恢复功能

- 向 spaces 表添加 isPaused 字段
- 实现 pauseSpace() 和 resumeSpace() 方法
- 为暂停/恢复添加 UI 控件

关闭 #123
```

## 发布流程

### 版本提升

```bash
# 更新版本
npm version patch  # 或 minor, major

# 构建
npm run build

# 打标签
git tag v1.0.0
git push origin v1.0.0
```

### 发布到 npm

```bash
npm publish
```

### Docker 镜像

```bash
cd ocs-hub
docker-compose build
docker-compose push
```

## 开发问题故障排除

### 构建错误

```bash
# 清理并重新构建
rm -rf dist node_modules
npm install
npm run build
```

### 找不到模块

```bash
# 更改后重新构建
npm run build

# 再次链接
npm link
```

### 数据库锁定

```bash
# 终止任何运行中的实例
pkill -f "openclawspace"

# 删除锁定文件 (如果存在)
rm ~/.openclawspace/data.db-journal
```

### 端口已被占用

```bash
# 查找进程
lsof -i :8787

# 终止进程
kill -9 <PID>
```

## 资源

- [TypeScript 手册](https://www.typescriptlang.org/docs/)
- [sql.js 文档](https://sql.js.org/)
- [ws 库](https://github.com/websockets/ws)
- [Commander.js](https://github.com/tj/commander.js/)
