import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Soul template cache
let soulBaseTemplateZh: string | null = null;
let soulBaseTemplateEn: string | null = null;

export interface TeamMember {
  name: string;
  role: 'host' | 'member';
  isBuiltIn?: boolean;
  identityMd: string;
  soulMd: string;
  roleDefinition?: string; // 角色定义，用于替换 soul 模板中的变量
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  locales: string[];
  members: TeamMember[];
}

/**
 * 加载 soul 基础模板
 */
function loadSoulBaseTemplate(language: string = 'zh'): string {
  if (language === 'zh') {
    if (soulBaseTemplateZh) return soulBaseTemplateZh;
    const templatePath = path.join(__dirname, 'soul', 'base.md.zh');
    soulBaseTemplateZh = fs.readFileSync(templatePath, 'utf-8');
    return soulBaseTemplateZh;
  } else {
    if (soulBaseTemplateEn) return soulBaseTemplateEn;
    const templatePath = path.join(__dirname, 'soul', 'base.md.en');
    soulBaseTemplateEn = fs.readFileSync(templatePath, 'utf-8');
    return soulBaseTemplateEn;
  }
}

/**
 * 编译 soul.md 内容
 * 将 roleDefinition 替换到基础模板中
 */
export function compileSoulMd(roleDefinition: string, language: string = 'zh'): string {
  const baseTemplate = loadSoulBaseTemplate(language);
  return baseTemplate.replace('{{ROLE_DEFINITION}}', roleDefinition);
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
export function getDefaultMemberTemplate(language: string = 'zh'): { identityMd: string; soulMd: string } {
  const isEnglish = language === 'en';

  const identityMd = isEnglish
    ? `- **Name:** {{name}}
- **Creature:** AI Assistant
- **Vibe:** Professional, efficient, fact-based
- **Emoji:** 🤖`
    : `- **Name:** {{name}}
- **Creature:** AI Assistant
- **Vibe:** 专业、高效、实事求是
- **Emoji:** 🤖`;

  // 默认角色定义
  const defaultRoleDefinition = isEnglish
    ? `## Who You Are

You are a valuable member of this team.

### Your Strengths
- Adaptable and versatile
- Good at learning new things
- Reliable and responsible

### Your Style
- Flexible: adjust to different situations
- Collaborative: work well with others
- Proactive: take initiative when needed

# Core Truths

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

Concise when needed, thorough when it matters. Not corporate, not sycophant.`
    : `## Who You Are

你是团队的重要成员。

### 你的特质
- 适应性强，多才多艺
- 善于学习新事物
- 可靠且负责任

### 你的风格
- 灵活：根据不同情况调整
- 协作：与他人良好合作
- 主动：需要时主动采取行动

# Core Truths

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

Concise when needed, thorough when it matters. Not corporate, not sycophant.`;

  const soulMd = compileSoulMd(defaultRoleDefinition, language);

  return {
    identityMd,
    soulMd
  };
}

// 导出所有模板
export const teamTemplates = loadTeamTemplates();
