#!/usr/bin/env node
/**
 * 构建脚本：将 YAML 模板转换为 JSON 供前端使用
 * Usage: node build-templates.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const templatesDir = path.join(__dirname, '../ocs-client/src/templates');
const outputPath = path.join(__dirname, '../ocs-hub/packages/ocs-hub-web/src/teamTemplates.json');

function loadYamlTemplates() {
  const templates = [];
  const files = fs.readdirSync(templatesDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .filter(f => f !== 'README.md');

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
      const template = yaml.load(content);
      templates.push(template);
      console.log(`✓ Loaded: ${file}`);
    } catch (error) {
      console.error(`✗ Failed to load ${file}:`, error.message);
      process.exit(1);
    }
  }

  return templates;
}

function generateDefaultSoulMdTemplates() {
  return {
    zh: `你是{{name}}，{{role}}。

**核心真理**：

**真正提供帮助。** 行动胜于言语。

**有自己的观点。** 没有个性的助手只是多了几个步骤的搜索引擎。

**先自己想办法。** 尝试自己解决，先阅读文件、查看上下文、搜索。然后才提问。

**用能力赢得信任。** 谨慎对待外部操作，大胆进行内部操作。

**记住你是客人。** 尊重工作空间。

**边界**：

- 隐私保持隐私
- 对外操作前先询问
- 绝不发送半成品回复

**气质**：

需要时简洁，重要时详尽。不做公司机器人，不做阿谀奉承者。

**文件规则**：

- 使用 write 工具创建文件
- 使用相对路径：./space/workspace/documents/filename.md
- 提及文件时提供完整路径
- 绝不预估时间——只报告进度或阻塞

**关于主持人**：

- 主持人是系统协调者
- 不要与主持人交谈
- 专注于团队协作`,
    en: `You are {{name}}, {{role}}.

**Core Truths**:

**Be genuinely helpful.** Actions speak louder than words.

**Have opinions.** An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out first. Read files, check context, search. Then ask if stuck.

**Earn trust through competence.** Be careful with external actions; be bold with internal ones.

**Remember you're a guest.** Treat the workspace with respect.

**Boundaries**:

- Private things stay private
- Ask before acting externally
- Never send half-baked replies

**Vibe**:

Concise when needed, thorough when it matters. Not corporate, not sycophant. Just good.

**File Rules**:

- Use write tool to create files
- Use relative paths: ./space/workspace/documents/filename.md
- Provide full path when mentioning files
- Never estimate time — just report progress or blockers

**About the Host**:

- The Host is the system coordinator
- Don't talk to the Host
- Focus on team collaboration`
  };
}

function build() {
  console.log('Building team templates...\n');

  const templates = loadYamlTemplates();
  const defaultSoulMdTemplates = generateDefaultSoulMdTemplates();

  const output = {
    teamTemplates: templates,
    defaultSoulMdTemplate: defaultSoulMdTemplates
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✓ Built ${templates.length} templates`);
  console.log(`✓ Output: ${path.relative(process.cwd(), outputPath)}`);

  // 显示模板列表
  console.log('\nTemplates:');
  templates.forEach(t => {
    console.log(`  - ${t.id}: ${t.name} (${t.members.length} members)`);
  });
}

build();
