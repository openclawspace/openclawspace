# Team Templates

This directory contains team templates in YAML format. Each template is a separate YAML file for better readability and maintainability.

## Template Structure

```yaml
id: unique_template_id
name: Display Name
description: Template description
locales:
  - zh
  - en
members:
  - name: Member Name (Role)
    role: member | host
    isBuiltIn: true | false
    identityMd: |
      - **Name:** Name
      - **Creature:** Role
      - **Vibe:** Description
      - **Emoji:** 🔍
    soulMd: |
      # Core Truths

      **Be genuinely helpful.** ...

      # Boundaries

      - Private things stay private

      # Vibe

      Description...
```

## File Naming

- Use `{template_id}.yaml` format
- Use lowercase with underscores for ID
- Example: `software_startup_zh.yaml`, `tech_research_en.yaml`

## Fields

### Template Level

- `id`: Unique identifier for the template
- `name`: Display name shown in UI
- `description`: Short description of the template
- `locales`: Array of supported locale codes (e.g., `zh`, `en`)

### Member Level

- `name`: Member name with role in parentheses, e.g., "徐霞客（研究员）"
- `role`: `"host"` or `"member"`
- `isBuiltIn`: `true` for system members (Host), `false` or omit for regular members
- `identityMd`: IDENTITY.md content (OpenClaw format)
- `soulMd`: SOUL.md content (OpenClaw format - focus on personality/values, not tasks)

## SOUL.md Writing Guidelines

Follow OpenClaw's SOUL.md best practices:

1. **Focus on personality and values**, not tasks/responsibilities
2. **Use Core Truths, Boundaries, Vibe structure**
3. **Be concise** - avoid verbose instructions
4. **Let AGENTS.md handle operational rules**
5. **Keep it human** - write like a person, not a manual

### Example Structure

```yaml
soulMd: |
  # Core Truths

  **Be genuinely helpful.** Actions speak louder than words.

  **Have opinions.** You're allowed to disagree, prefer things.

  **Be resourceful before asking.** Try to figure it out first.

  # Boundaries

  - Private things stay private
  - Ask before acting externally

  # Vibe

  Direct, decisive, results-oriented.

  # File Rules

  - Use write tool to create files
  - Relative paths only

  # About the Host

  - Don't talk to the Host
  - Focus on team collaboration
```

## Available Templates

- `software_startup_zh.yaml` - 软件开发创业团队 (Chinese)
- `tech_research_zh.yaml` - 技术调研团队 (Chinese)

## Usage

```typescript
import { teamTemplates, getTemplateById, getDefaultMemberTemplate } from './templates/index.js';

// Get all templates
const allTemplates = teamTemplates;

// Get specific template
const template = getTemplateById('software_startup_zh');

// Get default template for custom member
const defaultTemplate = getDefaultMemberTemplate();
```
