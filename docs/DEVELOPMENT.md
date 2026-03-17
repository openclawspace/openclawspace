# Development Guide

## Project Structure

```
openclawspace/
├── ocs-client/           # Local AI team service
│   ├── src/             # TypeScript source
│   ├── dist/            # Compiled JavaScript
│   ├── package.json
│   └── tsconfig.json
├── ocs-hub/             # WebSocket relay + Web UI
│   ├── packages/
│   │   ├── ocs-hub-service/   # Node.js WebSocket server
│   │   └── ocs-hub-web/       # React SPA
│   └── docker-compose.yml
├── docs/                # Documentation
├── scripts/             # Build scripts
├── package.json         # Root package.json
└── README.md
```

## Setting Up Development Environment

### Prerequisites

- Node.js >= 18
- npm >= 9
- Git
- OpenClaw (for AI functionality)

### Clone Repository

```bash
git clone https://github.com/yourusername/openclawspace.git
cd openclawspace
```

### Install Dependencies

**Root:**
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

## Development Workflow

### 1. Start OpenClaw Gateway

```bash
openclaw gateway run
```

### 2. Build ocs-client

```bash
cd ocs-client
npm run build
npm link  # For global access
```

Watch mode:
```bash
npm run dev
```

### 3. Start ocs-hub (for Web UI)

```bash
cd ocs-hub
docker-compose up
```

Or manually:

```bash
# Service
cd ocs-hub/packages/ocs-hub-service
npm run dev

# Web (in another terminal)
cd ocs-hub/packages/ocs-hub-web
npm run dev
```

### 4. Run ocs-client

```bash
openclawspace --hub ws://localhost:8787/ws
```

### 5. Open Browser

Navigate to `http://localhost:3000` and enter the token.

## Code Organization

### ocs-client/src/

| File | Purpose |
|------|---------|
| `cli.ts` | CLI entry point using Commander |
| `hub-client.ts` | WebSocket client for Hub communication |
| `space-manager.ts` | Core business logic - spaces, members, messages |
| `database.ts` | SQLite database layer (sql.js) |
| `openclaw-client.ts` | OpenClaw CLI wrapper |
| `gateway-client.ts` | OpenClaw Gateway WebSocket client |
| `ai-discussion-controller.ts` | AI silence detection and orchestration |
| `user-profile.ts` | User identity management |
| `logger.ts` | File + console logging |
| `ai-i18n.ts` | AI prompt internationalization |
| `templates/` | Team templates and SOUL.md generators |

### ocs-hub-service/src/

| File | Purpose |
|------|---------|
| `index.ts` | Main server - HTTP + WebSocket |

### ocs-hub-web/src/

| File | Purpose |
|------|---------|
| `App.tsx` | Main React application |
| `index.css` | Tailwind CSS styles |
| `i18n.ts` | i18next configuration |
| `locales/` | Translation files |
| `components/` | React components |

## Building

### ocs-client

```bash
cd ocs-client
npm run build        # TypeScript compilation
npm run build:watch  # Watch mode
```

Output: `dist/` folder with compiled JavaScript

### ocs-hub-service

```bash
cd ocs-hub/packages/ocs-hub-service
npm run build
```

### ocs-hub-web

```bash
cd ocs-hub/packages/ocs-hub-web
npm run build        # Production build
npm run dev          # Development server
```

Output: `dist/` folder with static assets

## Testing

### Run Tests

```bash
# ocs-client
cd ocs-client
npm test

# ocs-hub-service
cd ocs-hub/packages/ocs-hub-service
npm test
```

### Test Structure

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

## Code Style

### TypeScript Configuration

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

### Linting

```bash
# ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Prettier
npm run format
```

### Naming Conventions

- **Files:** kebab-case.ts
- **Classes:** PascalCase
- **Functions:** camelCase
- **Constants:** UPPER_SNAKE_CASE
- **Interfaces:** PascalCase with descriptive names

Example:
```typescript
// Good
interface SpaceConfig {
  name: string;
  maxMembers: number;
}

class SpaceManager {
  private readonly DEFAULT_TIMEOUT = 30000;

  async createSpace(config: SpaceConfig): Promise<Space> {
    // implementation
  }
}
```

## Debugging

### VS Code Configuration

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

### Debug Logging

Enable verbose logging:

```typescript
// In code
logger.debug('Detailed info', { data });
```

Check logs:
```bash
tail -f ~/.openclawspace/logs/ocs-client-$(date +%Y-%m-%d).log
```

### WebSocket Debugging

Use Chrome DevTools Network tab to inspect WebSocket messages.

## Database Migrations

When changing database schema:

1. Update `database.ts` schema definition
2. Add migration logic in `migrateTables()`
3. Test with existing database

Example migration:
```typescript
private async migrateTables(): Promise<void> {
  // Check if column exists
  const result = this.db.exec(
    "SELECT COUNT(*) FROM pragma_table_info('members') WHERE name='role'"
  );

  if (result[0].values[0][0] === 0) {
    // Add new column
    this.db.run(`ALTER TABLE members ADD COLUMN role TEXT DEFAULT 'member'`);
  }
}
```

## Adding New Features

### Feature Checklist

- [ ] Update relevant source files
- [ ] Add/update tests
- [ ] Update documentation
- [ ] Update CHANGELOG.md
- [ ] Ensure backward compatibility

### Adding a New Message Type

1. Add type to `HubClient.handleMessage()` switch
2. Add handler method
3. Update browser UI to handle new type
4. Document in API.md

### Adding a New Database Entity

1. Define interface in `database.ts`
2. Add table schema in `initTables()`
3. Add CRUD methods to `Database` class
4. Expose through `SpaceManager`
5. Wire up in `HubClient`

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Update documentation
6. Submit PR with clear description

### Commit Message Format

```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Build/tooling

Example:
```
feat(space-manager): add pause/resume functionality

- Add isPaused field to spaces table
- Implement pauseSpace() and resumeSpace() methods
- Add UI controls for pause/resume

Closes #123
```

## Release Process

### Version Bump

```bash
# Update version
npm version patch  # or minor, major

# Build
npm run build

# Tag
git tag v1.0.0
git push origin v1.0.0
```

### Publish to npm

```bash
npm publish
```

### Docker Images

```bash
cd ocs-hub
docker-compose build
docker-compose push
```

## Troubleshooting Development Issues

### Build Errors

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Module Not Found

```bash
# Rebuild after changes
npm run build

# Link again
npm link
```

### Database Locked

```bash
# Kill any running instances
pkill -f "openclawspace"

# Remove lock file (if exists)
rm ~/.openclawspace/data.db-journal
```

### Port Already in Use

```bash
# Find process
lsof -i :8787

# Kill process
kill -9 <PID>
```

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [sql.js Documentation](https://sql.js.org/)
- [ws Library](https://github.com/websockets/ws)
- [Commander.js](https://github.com/tj/commander.js/)
