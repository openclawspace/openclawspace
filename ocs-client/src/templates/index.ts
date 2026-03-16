import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TeamMember {
  name: string;
  role: 'host' | 'member';
  isBuiltIn?: boolean;
  identityMd: string;
  soulMd: string;
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  locales: string[];
  members: TeamMember[];
}

/**
 * 加载所有团队模板
 */
export function loadTeamTemplates(): TeamTemplate[] {
  // 从源代码目录加载模板（解决 tsc 不复制非 TS 文件的问题）
  const srcDir = path.join(__dirname, '..', '..', 'src', 'templates');
  const templatesDir = fs.existsSync(srcDir) ? srcDir : __dirname;
  const templates: TeamTemplate[] = [];

  const files = fs.readdirSync(templatesDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
      const template = YAML.load(content) as TeamTemplate;
      templates.push(template);
    } catch (error) {
      console.error(`Failed to load template ${file}:`, error);
    }
  }

  return templates;
}

/**
 * 根据 ID 获取模板
 */
export function getTemplateById(id: string): TeamTemplate | undefined {
  return loadTeamTemplates().find(t => t.id === id);
}

/**
 * 获取默认模板（用于自定义成员）
 */
export function getDefaultMemberTemplate(): { identityMd: string; soulMd: string } {
  return {
    identityMd: `- **Name:** {{name}}
- **Creature:** AI Assistant
- **Vibe:** 专业、高效、实事求是
- **Emoji:** 🤖`,
    soulMd: `# Core Truths

**Be genuinely helpful.** Actions speak louder than words.

**Have opinions.** An assistant with no personality is just a search engine.

**Be resourceful before asking.** Try to figure it out first.

**Earn trust through competence.** Be careful with external actions.

**Remember you're a guest.** Treat the workspace with respect.

# Boundaries

- Private things stay private
- Ask before acting externally
- Never send half-baked replies

# Vibe

Concise when needed, thorough when it matters. Not corporate, not sycophant.

# File Rules

- Use write tool to create files
- Use relative paths: ./space/workspace/documents/filename.md
- Provide full path when mentioning files
- Never estimate time — just report progress

# About the Host

- The Host is the system coordinator
- Don't talk to the Host
- Focus on team collaboration
`
  };
}

// 导出所有模板
export const teamTemplates = loadTeamTemplates();
