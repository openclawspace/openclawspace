import { spawn } from 'child_process';
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

export interface AgentResponse {
  text: string;
  done: boolean;
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
   * 创建 Agent
   */
  async createAgent(name: string, soulMd: string): Promise<OpenClawAgent> {
    const agentId = this.normalizeAgentId(name);
    const workspaceDir = path.join(this.baseDir, 'workspaces', agentId);

    // 确保工作目录存在
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

    // 创建 agent（使用非交互模式）- 使用120秒超时，因为初始化可能需要较长时间
    const createCmd = `openclaw agents add ${agentId} --workspace ${workspaceDir} --non-interactive`;
    await this.execCommand(createCmd, 120000);

    // 直接写入 SOUL.md 到工作目录
    const soulPath = path.join(workspaceDir, 'SOUL.md');
    fs.writeFileSync(soulPath, soulMd, 'utf-8');

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
   * 删除 Agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const cmd = `openclaw agents delete ${agentId} --force`;
    await this.execCommand(cmd);
  }

  /**
   * 发送消息给 Agent 并获取回复
   */
  async sendMessage(agentId: string, message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 使用新的命令格式: openclaw agent --agent <id> --message <text>
      const args = ['agent', '--agent', agentId, '--message', message];

      if (this.gatewayToken) {
        args.push('--token', this.gatewayToken);
      }

      const child = spawn('openclaw', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      // 设置 120 秒超时（给 OpenClaw 足够时间处理）
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`openclaw agent timeout after 120s: ${agentId}`));
      }, 120000);

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`openclaw agent failed: ${errorOutput || output}`));
          return;
        }

        // 提取回复内容（去掉思考过程等）
        const response = this.extractResponse(output);
        resolve(response);
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * 运行 Agent 并实时获取输出
   */
  async runAgentStream(
    agentId: string,
    message: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['agent', '--agent', agentId, '--message', message];

      if (this.gatewayToken) {
        args.push('--token', this.gatewayToken);
      }

      const child = spawn('openclaw', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        onChunk(chunk);
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`openclaw agent failed: ${errorOutput}`));
          return;
        }
        resolve();
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
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

  /**
   * 提取回复内容
   */
  private extractResponse(output: string): string {
    // 去掉 ANSI 颜色码
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

    // 过滤掉 OpenClaw 内部日志行
    const lines = cleanOutput
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        if (!line) return false;
        // 过滤 OpenClaw 内部日志
        if (line.startsWith('[') && line.includes(']')) {
          // 形如 [agents/auth-profiles], [INFO], [DEBUG] 等
          if (line.match(/^\[[\w\-/]+\]\s/)) return false;
        }
        // 过滤其他已知日志前缀
        if (line.startsWith('🎯') || line.startsWith('🚀') || line.startsWith('✅')) {
          return false;
        }
        return true;
      });

    return lines.join('\n').trim();
  }
}
