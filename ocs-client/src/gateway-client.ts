import WebSocket from 'ws';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getLogger } from './logger.js';

const logger = getLogger();

// Gateway 协议类型定义
interface GatewayFrame {
  type: string;
  id?: string;
  method?: string;
  params?: any;
  event?: string;
  payload?: any;
  ok?: boolean;
  error?: { code: string; message: string };
}

interface ChatSendParams {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  timeoutMs?: number;
}

interface ChatStreamEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: {
    content?: string;
    text?: string;
    role?: string;
  };
  errorMessage?: string;
  usage?: any;
}

// Agent 工具事件
interface AgentToolEvent {
  runId: string;
  stream: 'tool' | 'assistant' | 'lifecycle' | 'error';
  seq: number;
  ts: number;
  sessionKey?: string;
  data?: {
    phase?: 'start' | 'update' | 'result' | 'end' | 'error';
    toolCallId?: string;
    name?: string;
    args?: Record<string, unknown>;
    partialResult?: unknown;
    result?: unknown;
    isError?: boolean;
    text?: string;
    delta?: string;
    error?: string;
  };
}

interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  role: string;
  scopes: string[];
  caps: string[];
  auth: {
    token?: string;
  };
}

interface AgentInfo {
  id: string;
  name: string;
  workspace: string;
}

/**
 * GatewayClient - OpenClaw Gateway WebSocket 客户端
 * 作为 OpenClaw 的 Gateway 渠道适配器
 */
export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private gatewayUrl: string;
  private gatewayToken?: string;
  private reconnectInterval: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private requestId: number = 0;
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private isConnected: boolean = false;
  private sessionKeys: Map<string, string> = new Map(); // agentId -> sessionKey
  private sessionToSpace: Map<string, string> = new Map(); // sessionKey -> spaceId 映射
  private connectNonce: string | null = null;
  private connectChallengeReceived: boolean = false;

  constructor(options: { gatewayUrl?: string; gatewayToken?: string } = {}) {
    super();
    this.gatewayUrl = options.gatewayUrl || 'ws://127.0.0.1:18789';
    this.gatewayToken = options.gatewayToken;
  }

  /**
   * 设置/更新 Gateway Token
   */
  setToken(token: string): void {
    this.gatewayToken = token;
    logger.debug('[Gateway] Token updated');
  }

  /**
   * 连接到 Gateway
   */
  async connect(): Promise<boolean> {
    if (this.isConnected) {
      return true;
    }

    return new Promise((resolve) => {
      try {
        logger.info(`[Gateway] Connecting to ${this.gatewayUrl}`);

        this.ws = new WebSocket(this.gatewayUrl);

        const timeout = setTimeout(() => {
          logger.error('[Gateway] Connection timeout');
          resolve(false);
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(timeout);
          logger.info('[Gateway] WebSocket connected');

          // 等待 connect.challenge 事件，然后发送 connect 请求
          this.waitForConnectChallenge().then(async (success) => {
            if (!success) {
              resolve(false);
              return;
            }

            const connected = await this.sendConnect();
            if (connected) {
              this.isConnected = true;
              this.emit('connected');
              resolve(true);
            } else {
              resolve(false);
            }
          });
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          clearTimeout(timeout);
          logger.info('[Gateway] WebSocket closed');
          this.handleDisconnect();
        });

        this.ws.on('error', (err) => {
          clearTimeout(timeout);
          logger.error(`[Gateway] WebSocket error: ${err.message}`);
          resolve(false);
        });
      } catch (err) {
        logger.error(`[Gateway] Failed to connect: ${err}`);
        resolve(false);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isConnected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // 清理所有 pending 请求
    for (const [id, { reject, timeout }] of this.pendingRequests) {
      clearTimeout(timeout);
      reject(new Error('Gateway disconnected'));
    }
    this.pendingRequests.clear();
    // 清空 session 映射，防止重连后收到旧消息
    this.sessionToSpace.clear();
    this.sessionKeys.clear();
  }

  /**
   * 等待 connect.challenge 事件
   */
  private waitForConnectChallenge(): Promise<boolean> {
    return new Promise((resolve) => {
      // 如果已经收到了 challenge，直接返回
      if (this.connectChallengeReceived && this.connectNonce) {
        resolve(true);
        return;
      }

      // 设置超时
      const timeout = setTimeout(() => {
        logger.error('[Gateway] Timeout waiting for connect.challenge');
        resolve(false);
      }, 10000);

      // 监听 challenge 事件
      const checkChallenge = () => {
        if (this.connectChallengeReceived && this.connectNonce) {
          clearTimeout(timeout);
          resolve(true);
        }
      };

      // 每秒检查一次
      const interval = setInterval(() => {
        if (this.connectChallengeReceived) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(true);
        }
      }, 100);
    });
  }

  /**
   * 发送 connect 请求进行握手
   */
  private async sendConnect(): Promise<boolean> {
    const params: ConnectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'gateway-client',
        version: '3.0.0',
        platform: process.platform,
        mode: 'backend'
      },
      role: 'operator',
      scopes: ['operator.admin', 'operator.approvals'],
      caps: [], // 作为渠道不需要 tool-events
      auth: {
        token: this.gatewayToken
      }
    };

    try {
      const response = await this.request('connect', params, 10000);
      if (response && response.type === 'hello-ok') {
        logger.info('[Gateway] Connected successfully');
        return true;
      }
      return false;
    } catch (err) {
      logger.error(`[Gateway] Connect failed: ${err}`);
      return false;
    }
  }

  /**
   * 发送请求并等待响应
   */
  private request(method: string, params: any, timeoutMs: number = 60000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway not connected'));
        return;
      }

      const id = `${Date.now()}-${++this.requestId}`;
      const frame: GatewayFrame = {
        type: 'req',
        id,
        method,
        params
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.ws.send(JSON.stringify(frame));
    });
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(data: string): void {
    try {
      const frame: GatewayFrame = JSON.parse(data);

      // 【关键】第一时间输出完整消息日志 - 无论消息类型，都先记录
      logger.info(`[Gateway] RAW MESSAGE received: type=${frame.type}, id=${frame.id}, event=${frame.event}`);
      if (frame.event && !['connect.challenge','tick','shutdown','health','presence','heartbeat'].includes(frame.event)) {
        // 系统事件不需要输出到日志
        logger.info(`[Gateway] RAW MESSAGE body: ${JSON.stringify(frame, null, 2)}`);
      }

      // 处理 connect.challenge 事件
      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        const payload = frame.payload as { nonce?: string; ts?: number } | undefined;
        if (payload?.nonce) {
          this.connectNonce = payload.nonce;
          this.connectChallengeReceived = true;
          logger.debug(`[Gateway] Received connect challenge nonce: ${payload.nonce}`);
        }
        return;
      }

      // 处理响应
      if (frame.type === 'res' && frame.id) {
        const pending = this.pendingRequests.get(frame.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(frame.id);

          if (frame.ok) {
            pending.resolve(frame.payload);
          } else {
            pending.reject(new Error(frame.error?.message || 'Request failed'));
          }
        }
        return;
      }

      // 处理事件
      if (frame.type === 'event') {
        this.handleEvent(frame);
        return;
      }

      // 处理 hello-ok（connect 响应）
      if (frame.type === 'hello-ok') {
        const pending = this.pendingRequests.get('connect');
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete('connect');
          pending.resolve(frame);
        }
        return;
      }
    } catch (err) {
      logger.error(`[Gateway] Failed to handle message: ${err}`);
    }
  }

  /**
   * 处理 Gateway 事件
   */
  private handleEvent(frame: GatewayFrame): void {
    const { event, payload } = frame;

    switch (event) {
      case 'chat': {
        const chatEvent = payload as ChatStreamEvent;
        this.emit('chat', chatEvent);
        break;
      }

      case 'agent': {
        const agentEvent = payload as AgentToolEvent;
        // 转发 tool 事件，让外部处理工具状态显示
        if (agentEvent.stream === 'tool') {
          this.emit('tool', agentEvent);
        }
        // 转发 assistant 事件，包含 AI 的回复文本
        if (agentEvent.stream === 'assistant') {
          this.emit('agent', agentEvent);
        }
        break;
      }

      default:
        logger.debug(`[Gateway] Unhandled event: ${event}`);
    }
  }

  /**
   * 获取 sessionKey 对应的 spaceId
   */
  getSpaceIdBySessionKey(sessionKey: string): string | undefined {
    return this.sessionToSpace.get(sessionKey);
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(): void {
    this.isConnected = false;
    this.emit('disconnected');

    // 自动重连
    logger.info(`[Gateway] Will reconnect in ${this.reconnectInterval}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * 发送聊天消息
   */
  async sendChatMessage(agentId: string, spaceId: string, message: string): Promise<{ runId: string; sessionKey: string }> {
    // 使用固定的 sessionKey 格式，确保断开重连后仍能恢复同一会话
    const sessionKey = this.getOrCreateSessionKey(agentId, spaceId);

    // 建立 sessionKey -> spaceId 映射，用于消息隔离
    this.sessionToSpace.set(sessionKey, spaceId);

    const params: ChatSendParams = {
      sessionKey,
      message,
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      timeoutMs: 300000 // 5分钟超时
    };
    logger.info(`[Gateway] sendChatMessage request params: ${JSON.stringify(params, null, 2)}`);

    const response = await this.request('chat.send', params, 310000);

    const result = {
      runId: response?.runId,
      sessionKey
    };
    logger.info(`[Gateway] sendChatMessage END - result: ${JSON.stringify(result)}`);

    return result;
  }

  /**
   * 获取或创建 session key
   * 使用 OpenClaw 规范格式：agent:{agentId}:space:{spaceId}
   * 这样 Gateway 才能正确解析 agentId，使用对应的 workspace 和配置
   * 固定格式确保断开重连后仍能恢复同一会话
   */
  getOrCreateSessionKey(agentId: string, spaceId: string): string {
    const sessionKey = `agent:${agentId}:space:${spaceId}`;
    this.sessionKeys.set(agentId, sessionKey);
    return sessionKey;
  }

  /**
   * 建立 sessionKey 到 spaceId 的映射（用于消息隔离）
   */
  bindSessionToSpace(sessionKey: string, spaceId: string): void {
    this.sessionToSpace.set(sessionKey, spaceId);
  }

  /**
   * 检查 Gateway 是否已连接
   */
  getConnectionState(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 创建 Agent
   */
  async createAgent(name: string, soulMd: string, identityMd: string, workspace: string): Promise<AgentInfo> {

    // 创建 agent 仍然使用 CLI，因为 Gateway 没有提供创建 agent 的 API
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const { exec } = await import('child_process');
    const execAsync = promisify(exec);

    const agentId = this.normalizeAgentId(name);

    // 创建工作目录
    if (!fs.existsSync(workspace)) {
      fs.mkdirSync(workspace, { recursive: true });
    }

    // 写入 SOUL.md
    const soulPath = path.join(workspace, 'SOUL.md');
    fs.writeFileSync(soulPath, soulMd, 'utf-8');

    // 写入 IDENTITY.md
    const identityPath = path.join(workspace, 'IDENTITY.md');
    fs.writeFileSync(identityPath, identityMd, 'utf-8');

    // 使用 CLI 创建 agent
    const createCmd = `openclaw agents add ${agentId} --workspace ${workspace} --non-interactive`;
    await execAsync(createCmd, { timeout: 120000 });

    // 写入自定义 BOOTSTRAP.md，告诉 Agent 直接从 SOUL.md 读取身份信息
    // 而不是询问"我是谁"
    const bootstrapPath = path.join(workspace, 'BOOTSTRAP.md');
    const customBootstrap = `# Agent Identity Bootstrap

你已经配置完成，可以直接开始工作。

**重要**: 请直接阅读 SOUL.md 文件了解你的身份、职责和行为准则。

- 你的名字和角色在 SOUL.md 中有详细定义
- 遵循 SOUL.md 中的行为准则和工作流程
- 不需要询问"我是谁"，直接根据 SOUL.md 的设定开始工作

---
*此文件由 OpenClawSpace 自动生成*
`;
    fs.writeFileSync(bootstrapPath, customBootstrap, 'utf-8');

    return {
      id: agentId,
      name,
      workspace
    };
  }

  /**
   * 删除 Agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const { promisify } = await import('util');
    const { exec } = await import('child_process');
    const execAsync = promisify(exec);

    const cmd = `openclaw agents delete ${agentId} --force`;
    await execAsync(cmd);
  }

  /**
   * 规范化 Agent ID
   */
  private normalizeAgentId(name: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const prefix = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 10) || 'agent';
    return `${prefix}-${timestamp}-${random}`;
  }
}

// 导出单例
let globalGatewayClient: GatewayClient | null = null;

export function getGatewayClient(options?: { gatewayUrl?: string; gatewayToken?: string }): GatewayClient {
  if (!globalGatewayClient) {
    globalGatewayClient = new GatewayClient(options);
  } else if (options?.gatewayToken) {
    // 更新 token 如果提供了新的
    globalGatewayClient.setToken(options.gatewayToken);
  }
  return globalGatewayClient;
}

export function resetGatewayClient(): void {
  if (globalGatewayClient) {
    globalGatewayClient.disconnect();
    globalGatewayClient = null;
  }
}
