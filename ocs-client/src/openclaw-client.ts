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

export interface AttachmentRequest {
  path: string;
  type: 'image' | 'document' | 'media' | 'file';
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
  async createAgent(name: string, soulMd: string, spaceId?: string): Promise<OpenClawAgent> {
    const agentId = this.normalizeAgentId(name);

    let workspaceDir: string;

    if (spaceId) {
      // 使用新的目录结构：~/.ocs-client/spaces/{spaceId}/agents/{agentId}/
      workspaceDir = path.join(os.homedir(), '.ocs-client', 'spaces', spaceId, 'agents', agentId);

      // 确保agent workspace目录存在
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }

      // 创建空间目录结构：~/.ocs-client/spaces/{spaceId}/space/
      const spaceDir = path.join(os.homedir(), '.ocs-client', 'spaces', spaceId, 'space');
      if (!fs.existsSync(spaceDir)) {
        fs.mkdirSync(spaceDir, { recursive: true });

        // 创建 workspace 目录（原 shared 目录）
        const workspaceDir = path.join(spaceDir, 'workspace');
        fs.mkdirSync(workspaceDir, { recursive: true });

        // 在 workspace 目录中创建子目录
        const workspaceSubdirs = ['documents', 'images', 'code', 'data'];
        for (const subdir of workspaceSubdirs) {
          const subdirPath = path.join(workspaceDir, subdir);
          if (!fs.existsSync(subdirPath)) {
            fs.mkdirSync(subdirPath, { recursive: true });
          }
        }

        // 创建 attachments 目录（新增聊天附件目录）
        const attachmentsDir = path.join(spaceDir, 'attachments');
        fs.mkdirSync(attachmentsDir, { recursive: true });

        // 在 attachments 目录中创建子目录
        const attachmentsSubdirs = ['images', 'documents', 'media', 'other', 'temp'];
        for (const subdir of attachmentsSubdirs) {
          const subdirPath = path.join(attachmentsDir, subdir);
          if (!fs.existsSync(subdirPath)) {
            fs.mkdirSync(subdirPath, { recursive: true });
          }
        }
      }

      // 在agent workspace中创建space目录的symlink，指向空间共享目录
      const spaceLinkPath = path.join(workspaceDir, 'space');
      const spaceTargetPath = path.join('..', '..', 'space'); // 指向 ../../space/
      try {
        // 如果已存在，先删除
        if (fs.existsSync(spaceLinkPath)) {
          fs.unlinkSync(spaceLinkPath);
        }
        // 创建symlink
        fs.symlinkSync(spaceTargetPath, spaceLinkPath, 'dir');
        console.log(`[OpenClaw] Created symlink: ${spaceLinkPath} -> ${spaceTargetPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[OpenClaw] Failed to create symlink: ${errorMessage}`);
        // 继续执行，不因为symlink失败而中断
      }
    } else {
      // 如果没有spaceId，使用默认的OpenClaw workspace目录
      workspaceDir = path.join(this.baseDir, 'workspaces', agentId);

      // 确保工作目录存在
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }
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
   * 发送消息给 Agent 并获取回复，同时解析附件请求
   */
  async sendMessageWithAttachments(agentId: string, message: string): Promise<{ text: string; attachments?: AttachmentRequest[] }> {
    const response = await this.sendMessage(agentId, message);

    // 解析 send_attachment 工具调用
    const attachments = this.parseAttachmentRequests(response);

    // 移除工具调用标记，保留自然语言回复
    const cleanText = this.removeToolCalls(response);

    return { text: cleanText, attachments };
  }

  /**
   * 解析附件请求
   * 检测 AI 回复中提到的文件路径，自动处理为附件
   */
  private parseAttachmentRequests(response: string): AttachmentRequest[] | undefined {
    const attachments: AttachmentRequest[] = [];

    // 从回复中提取文件路径（支持 ./space/workspace/ 开头的路径）
    // 匹配格式：./space/workspace/.../文件名.扩展名
    const pathRegex = /\.\/space\/workspace\/[^\s"'\n]+/g;
    const matches = response.match(pathRegex);

    if (matches) {
      for (const filePath of matches) {
        // 根据文件扩展名判断类型
        const ext = filePath.toLowerCase().split('.').pop() || '';
        let type: 'image' | 'document' | 'media' | 'file' = 'file';

        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'].includes(ext)) {
          type = 'image';
        } else if (['md', 'txt', 'json', 'js', 'ts', 'html', 'css', 'pdf', 'doc', 'docx'].includes(ext)) {
          type = 'document';
        } else if (['mp3', 'mp4', 'wav', 'avi', 'mov'].includes(ext)) {
          type = 'media';
        }

        attachments.push({ path: filePath, type });
      }
    }

    return attachments.length > 0 ? attachments : undefined;
  }

  /**
   * 清理回复文本，保持自然语言
   */
  private removeToolCalls(response: string): string {
    // 这里不需要移除任何内容，因为 AI 只是自然语言描述
    // 保持回复原样
    return response.trim();
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
