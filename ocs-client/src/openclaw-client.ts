import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface OpenClawAgent {
  id: string;
  name: string;
  workspace: string;
}

/**
 * OpenClaw Client - 调用 openclaw CLI 管理 Agent
 */
export class OpenClawClient {
  private gatewayUrl: string;
  private gatewayToken?: string;
  private baseDir: string;

  constructor(options: { gatewayUrl?: string; gatewayToken?: string } = {}) {
    this.gatewayUrl = options.gatewayUrl || 'ws://127.0.0.1:18789';
    this.gatewayToken = options.gatewayToken;
    this.baseDir = path.join(os.homedir(), '.openclaw');
  }

  /**
   * 检查 openclaw 是否安装并可用
   */
  async checkOpenClaw(): Promise<boolean> {
    try {
      await execAsync('openclaw --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 设置 OpenClaw 配置，确保 skipBootstrap 为 true
   */
  private async ensureSkipBootstrapConfig(): Promise<void> {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      let config: any = {};

      // 读取现有配置
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        try {
          config = JSON.parse(content);
        } catch (e) {
          console.error('[OpenClaw] Failed to parse config:', e);
          config = {};
        }
      }

      // 确保 agents.defaults.skipBootstrap 为 true
      if (!config.agents) {
        config.agents = {};
      }
      if (!config.agents.defaults) {
        config.agents.defaults = {};
      }

      // 只有在未设置时才设置为 true
      if (config.agents.defaults.skipBootstrap !== true) {
        config.agents.defaults.skipBootstrap = true;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log('[OpenClaw] Set agents.defaults.skipBootstrap = true');
      }
    } catch (error) {
      console.error('[OpenClaw] Failed to update config:', error);
      // 继续执行，不因为配置更新失败而中断
    }
  }

  /**
   * Create Agent
   */
  async createAgent(name: string, soulMd: string, identityMd: string, spaceId?: string, language?: string): Promise<OpenClawAgent> {
    // First ensure skipBootstrap config
    await this.ensureSkipBootstrapConfig();

    const agentId = this.normalizeAgentId(name);

    let workspaceDir: string;
    let agentDir: string;
    let agentBaseDir: string;

    if (spaceId) {
      // 使用统一的目录结构：~/.openclawspace/spaces/{spaceId}/agents/{agentId}/
      // workspace/: 存储 SOUL.md, BOOTSTRAP.md 等业务文件
      // agent/: 存储 OpenClaw 内部状态 (session, models.json 等)
      agentBaseDir = path.join(os.homedir(), '.openclawspace', 'spaces', spaceId, 'agents', agentId);
      workspaceDir = path.join(agentBaseDir, 'workspace');
      agentDir = path.join(agentBaseDir, 'agent');

      // 确保目录存在
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }

      // Create space directory structure: ~/.openclawspace/spaces/{spaceId}/space/
      const spaceDir = path.join(os.homedir(), '.openclawspace', 'spaces', spaceId, 'space');
      if (!fs.existsSync(spaceDir)) {
        fs.mkdirSync(spaceDir, { recursive: true });

        // Create shared workspace directory
        const sharedWorkspaceDir = path.join(spaceDir, 'workspace');
        fs.mkdirSync(sharedWorkspaceDir, { recursive: true });

        // Create attachments directory (for chat attachments)
        const attachmentsDir = path.join(spaceDir, 'attachments');
        fs.mkdirSync(attachmentsDir, { recursive: true });

        // Note: Subdirectories are not pre-created; agents create them as needed
      }

      // 在 agent workspace 中创建 space 目录的 symlink，指向空间共享目录
      const spaceLinkPath = path.join(workspaceDir, 'space');
      const spaceTargetPath = path.join(os.homedir(), '.openclawspace', 'spaces', spaceId, 'space');
      try {
        // 如果已存在，先删除
        if (fs.existsSync(spaceLinkPath)) {
          fs.unlinkSync(spaceLinkPath);
        }
        // 创建 symlink (使用绝对路径避免 cwd 问题)
        fs.symlinkSync(spaceTargetPath, spaceLinkPath, 'dir');
        console.log(`[OpenClaw] Created symlink: ${spaceLinkPath} -> ${spaceTargetPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[OpenClaw] Failed to create symlink: ${errorMessage}`);
        // 继续执行，不因为 symlink 失败而中断
      }
    } else {
      // 如果没有 spaceId，使用默认目录结构
      agentBaseDir = path.join(this.baseDir, 'agents', agentId);
      workspaceDir = path.join(agentBaseDir, 'workspace');
      agentDir = path.join(agentBaseDir, 'agent');

      // 确保目录存在
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }
    }

    // 创建 agent（使用非交互模式）- 使用120秒超时，因为初始化可能需要较长时间
    // 同时指定 workspace 和 agentDir，确保两者都在预期位置
    const createCmd = `openclaw agents add ${agentId} --workspace ${workspaceDir} --agent-dir ${agentDir} --non-interactive`;
    await this.execCommand(createCmd, 120000);

    // 直接写入 SOUL.md 到工作目录
    const soulPath = path.join(workspaceDir, 'SOUL.md');
    fs.writeFileSync(soulPath, soulMd, 'utf-8');

    // 写入 IDENTITY.md，提供身份元数据
    const identityPath = path.join(workspaceDir, 'IDENTITY.md');
    fs.writeFileSync(identityPath, identityMd, 'utf-8');

    // Write custom BOOTSTRAP.md based on language
    const bootstrapPath = path.join(workspaceDir, 'BOOTSTRAP.md');
    const isEnglish = language === 'en';
    const customBootstrap = isEnglish ? `# Agent Identity Bootstrap

You are fully configured and ready to start working.

**Important**: Please read the SOUL.md file directly to understand your identity, responsibilities, and code of conduct.

- Your name and role are defined in detail in SOUL.md
- Follow the guidelines and workflows in SOUL.md
- No need to ask "who am I"; start working based on the SOUL.md settings

---
*This file was automatically generated by OpenClawSpace*
` : `# Agent Identity Bootstrap

你已经配置完成，可以直接开始工作。

**重要**: 请直接阅读 SOUL.md 文件了解你的身份、职责和行为准则。

- 你的名字和角色在 SOUL.md 中有详细定义
- 遵循 SOUL.md 中的行为准则和工作流程
- 不需要询问"我是谁"，直接根据 SOUL.md 的设定开始工作

---
*此文件由 OpenClawSpace 自动生成*
`;
    fs.writeFileSync(bootstrapPath, customBootstrap, 'utf-8');

    // 创建 workspace-state.json，标记 onboarding 已完成
    // 这是必需的，否则 OpenClaw 会认为这是一个全新工作区，从模板加载默认 BOOTSTRAP.md
    const openclawDir = path.join(workspaceDir, '.openclaw');
    if (!fs.existsSync(openclawDir)) {
      fs.mkdirSync(openclawDir, { recursive: true });
    }
    const statePath = path.join(openclawDir, 'workspace-state.json');
    const now = new Date().toISOString();
    const workspaceState = {
      version: 1,
      bootstrapSeededAt: now,
      onboardingCompletedAt: now
    };
    fs.writeFileSync(statePath, JSON.stringify(workspaceState, null, 2), 'utf-8');

    // 获取 agent 信息
    const listCmd = `openclaw agents list --json`;
    const { stdout } = await this.execCommand(listCmd);
    const agents = JSON.parse(stdout);
    const agent = agents.find((a: any) => a.id === agentId);

    return {
      id: agentId,
      name,
      workspace: workspaceDir
    };
  }

  /**
   * 提取 OpenClaw 实际使用的目录名（agentId 的时间戳-随机数部分）
   * 例如：主持人-mmlzvsxr-3r2gjs -> mmlzvsxr-3r2gjs
   */
  private extractOpenClawDirName(agentId: string): string | null {
    // OpenClaw 目录名格式：{timestamp}-{random}，长度为 8-15 字符左右
    const match = agentId.match(/[a-z0-9]{5,8}-[a-z0-9]{5,8}$/);
    return match ? match[0] : null;
  }

  /**
   * 删除 Agent
   */
  async deleteAgent(agentId: string, spaceId?: string): Promise<void> {
    // 先删除 OpenClaw agent 配置
    const cmd = `openclaw agents delete ${agentId} --force`;
    await this.execCommand(cmd);

    // 删除 OpenClaw 自动创建的目录（使用截断后的目录名）
    const openClawDirName = this.extractOpenClawDirName(agentId);
    if (openClawDirName) {
      const openclawAgentDir = path.join(os.homedir(), '.openclaw', 'agents', openClawDirName);
      console.log(`[OpenClaw] Checking agent directory: ${openclawAgentDir}`);
      if (fs.existsSync(openclawAgentDir)) {
        try {
          fs.rmSync(openclawAgentDir, { recursive: true, force: true });
          console.log(`[OpenClaw] Deleted agent directory: ${openclawAgentDir}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[OpenClaw] Failed to delete agent directory: ${errorMessage}`);
        }
      } else {
        console.log(`[OpenClaw] Agent directory not found: ${openclawAgentDir}`);
      }
    }

    // 删除 ocs-client 创建的目录（使用完整 agentId）
    let agentDirToDelete: string;
    if (spaceId) {
      agentDirToDelete = path.join(os.homedir(), '.openclawspace', 'spaces', spaceId, 'agents', agentId);
    } else {
      agentDirToDelete = path.join(this.baseDir, 'agents', agentId);
    }
    console.log(`[OpenClaw] Checking openclawspace agent directory: ${agentDirToDelete}`);
    if (fs.existsSync(agentDirToDelete)) {
      try {
        fs.rmSync(agentDirToDelete, { recursive: true, force: true });
        console.log(`[OpenClaw] Deleted openclawspace agent directory: ${agentDirToDelete}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[OpenClaw] Failed to delete openclawspace agent directory: ${errorMessage}`);
      }
    } else {
      console.log(`[OpenClaw] openclawspace agent directory not found: ${agentDirToDelete}`);
    }
  }

  /**
   * 获取 Agent 列表
   */
  async listAgents(): Promise<OpenClawAgent[]> {
    const cmd = `openclaw agents list --json`;
    const { stdout } = await this.execCommand(cmd);
    const agents = JSON.parse(stdout);
    return agents.map((a: any) => ({
      id: a.id,
      name: a.name,
      workspace: a.workspace
    }));
  }

  /**
   * 执行命令
   */
  private async execCommand(cmd: string, timeoutMs: number = 60000): Promise<{ stdout: string; stderr: string }> {
    console.log(`[OpenClaw] Executing: ${cmd} (timeout: ${timeoutMs}ms)`);
    try {
      const result = await execAsync(cmd, { timeout: timeoutMs });
      console.log(`[OpenClaw] Command succeeded: ${cmd}`);
      return result;
    } catch (error: any) {
      console.error(`[OpenClaw] Command failed: ${cmd}`);
      console.error(`[OpenClaw] Error: ${error.message}`);
      if (error.stderr) {
        console.error(`[OpenClaw] stderr: ${error.stderr}`);
      }
      throw new Error(`Command failed: ${cmd}\n${error.message}`);
    }
  }

  /**
   * 规范化 Agent ID - 使用 crypto 生成随机 ID，避免中文问题
   */
  private normalizeAgentId(name: string): string {
    // 生成一个基于时间戳和随机数的 ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    // 如果名字可以转换为有效的英文名，使用它作为前缀
    const prefix = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 10) || 'agent';
    return `${prefix}-${timestamp}-${random}`;
  }
}
