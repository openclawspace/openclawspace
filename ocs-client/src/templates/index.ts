import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
 * 简单的 YAML 解析器 - 只支持我们需要的结构
 */
function parseSimpleYaml(content: string): TeamTemplate {
  const lines = content.split('\n');
  const result: Partial<TeamTemplate> = { members: [] };
  let currentMember: Partial<TeamMember> | null = null;
  let currentField: string | null = null;
  let currentValue: string[] = [];

  const saveCurrentField = () => {
    if (!currentField || currentValue.length === 0) return;
    const value = currentValue.join('\n').trim();

    if (currentMember) {
      if (currentField === 'name') currentMember.name = value;
      else if (currentField === 'role') currentMember.role = value as 'host' | 'member';
      else if (currentField === 'isBuiltIn') currentMember.isBuiltIn = value === 'true';
      else if (currentField === 'identityMd') currentMember.identityMd = value;
      else if (currentField === 'soulMd') currentMember.soulMd = value;
    } else {
      if (currentField === 'id') result.id = value;
      else if (currentField === 'name') result.name = value;
      else if (currentField === 'description') result.description = value;
      else if (currentField === 'locales') {
        result.locales = value.split('\n').map(l => l.trim().replace(/^- /, '')).filter(Boolean);
      }
    }
    currentValue = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行
    if (!trimmed) {
      if (currentField) {
        saveCurrentField();
        currentField = null;
      }
      continue;
    }

    // 新的顶级字段
    if (!line.startsWith(' ') && !line.startsWith('-') && trimmed.includes(':')) {
      saveCurrentField();
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex);
      const value = trimmed.substring(colonIndex + 1).trim();
      currentField = key;

      // 如果有值在同一行，直接保存
      if (value) {
        currentValue = [value];
        saveCurrentField();
        currentField = null;
        currentValue = [];
      }

      if (key === 'members') {
        // members 开始，不需要值
        currentField = null;
      }
      continue;
    }

    // 新的 member 项
    if (line.startsWith('  - name:')) {
      if (currentMember && result.members) {
        result.members.push(currentMember as TeamMember);
      }
      currentMember = {};
      currentField = 'name';
      currentValue = [trimmed.replace(/^- name:\s*/, '')];
      continue;
    }

    // member 的字段
    if (currentMember && line.startsWith('    ') && trimmed.includes(':')) {
      saveCurrentField();
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex);
      const value = trimmed.substring(colonIndex + 1).trim();
      currentField = key;

      // 如果有值在同一行（且不是 | 多行标记），直接保存
      if (value && value !== '|') {
        currentValue = [value];
        saveCurrentField();
        currentField = null;
        currentValue = [];
      }
      continue;
    }

    // 多行文本（以 | 开始）
    if (trimmed === '|') {
      // 下一行开始是多行内容
      continue;
    }

    // 收集多行值
    if (currentField && line.startsWith('      ')) {
      currentValue.push(line.slice(6));
    }
  }

  // 保存最后一个字段和成员
  saveCurrentField();
  if (currentMember && result.members) {
    result.members.push(currentMember as TeamMember);
  }

  return result as TeamTemplate;
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
      const template = parseSimpleYaml(content);
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
