import { Database, Space, Member, Message, Attachment } from './database.js';
import { OpenClawClient } from './openclaw-client.js';
import { GatewayClient, getGatewayClient } from './gateway-client.js';
import { getLogger } from './logger.js';
import { UserProfileManager } from './user-profile.js';
import { compileSoulMd } from './templates/index.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const logger = getLogger();

// 工具执行状态
export interface ToolStatus {
  toolCallId: string;
  toolName: string;
  phase: 'start' | 'update' | 'result';
  args?: Record<string, unknown>;
  startedAt: number;
  endedAt?: number;
}

// 活跃的工具执行跟踪（runId -> 工具状态列表）
type ActiveToolRun = {
  runId: string;
  sessionKey: string;
  memberId: string;
  messageId: string;
  toolStatuses: Map<string, ToolStatus>; // toolCallId -> ToolStatus
  startedAt: number;
};

export class SpaceManager {
  private db: Database;
  private openclaw: OpenClawClient;
  private gateway: GatewayClient;
  private userProfile: UserProfileManager;
  private publicSpacesDir: string;
  public onProgress?: (message: string) => void;
  private useGateway: boolean = false;
  private gatewayToken?: string;
  private activeToolRuns: Map<string, ActiveToolRun> = new Map(); // runId -> ActiveToolRun
  private sessionKeyToRunId: Map<string, string> = new Map(); // sessionKey -> runId

  constructor(db: Database, userProfile?: UserProfileManager, gatewayToken?: string) {
    this.db = db;
    this.openclaw = new OpenClawClient();
    this.gatewayToken = gatewayToken;
    this.gateway = getGatewayClient({ gatewayToken });
    this.userProfile = userProfile || new UserProfileManager();
    this.publicSpacesDir = path.join(os.homedir(), '.openclawspace', 'spaces');
    this.ensurePublicSpacesDirExists();
    this.setupGatewayListeners();
  }

  /**
   * Setup Gateway event listeners
   */
  private setupGatewayListeners(): void {
    this.gateway.on('connected', () => {
      logger.info('[SpaceManager] Gateway connected');
      this.useGateway = true;
    });

    this.gateway.on('disconnected', () => {
      logger.info('[SpaceManager] Gateway disconnected');
      this.useGateway = false;
    });

    // 监听工具事件，跟踪 agent 执行状态
    this.gateway.on('tool', (toolEvent: any) => {
      this.handleToolEvent(toolEvent);
    });

    // 监听 agent 事件，处理 assistant 消息流
    this.gateway.on('agent', (agentEvent: any) => {
      this.handleAgentEvent(agentEvent).catch(err => {
        logger.error(`[SpaceManager] Failed to handle agent event: ${err}`);
      });
    });
  }

  /**
   * 处理工具事件
   */
  private handleToolEvent(toolEvent: any): void {
    const { runId, sessionKey, data } = toolEvent;
    if (!data || !sessionKey) {
      return;
    }

    const phase = data.phase;
    const toolCallId = data.toolCallId;
    const toolName = data.name;

    if (!toolCallId || !toolName) {
      return;
    }

    // 查找对应的活跃运行
    const activeRun = this.activeToolRuns.get(runId);
    if (!activeRun) {
      // 可能是之前启动的运行，忽略
      return;
    }

    const now = Date.now();

    if (phase === 'start') {
      // 工具开始执行
      const toolStatus: ToolStatus = {
        toolCallId,
        toolName,
        phase: 'start',
        args: data.args,
        startedAt: now
      };
      activeRun.toolStatuses.set(toolCallId, toolStatus);
      logger.info(`[SpaceManager] Tool started: ${toolName} (runId: ${runId})`);

      // 触发回调通知外部
      this.onToolStatusChanged?.(activeRun.memberId, activeRun.messageId, Array.from(activeRun.toolStatuses.values()));
    } else if (phase === 'update') {
      // 工具执行中更新
      const toolStatus = activeRun.toolStatuses.get(toolCallId);
      if (toolStatus) {
        toolStatus.phase = 'update';
        logger.debug(`[SpaceManager] Tool update: ${toolName} (runId: ${runId})`);
        this.onToolStatusChanged?.(activeRun.memberId, activeRun.messageId, Array.from(activeRun.toolStatuses.values()));
      }
    } else if (phase === 'result' || phase === 'end' || phase === 'error') {
      // 工具执行完成
      const toolStatus = activeRun.toolStatuses.get(toolCallId);
      if (toolStatus) {
        toolStatus.phase = 'result';
        toolStatus.endedAt = now;
        logger.info(`[SpaceManager] Tool completed: ${toolName} (runId: ${runId}, phase: ${phase})`);
        this.onToolStatusChanged?.(activeRun.memberId, activeRun.messageId, Array.from(activeRun.toolStatuses.values()));
      }
    }
  }

  /**
   * 处理 agent 事件 (assistant 消息流)
   */
  private async handleAgentEvent(agentEvent: any): Promise<void> {
    const { runId, sessionKey, stream, data } = agentEvent;
    if (stream !== 'assistant' || !data) {
      return;
    }

    if (!sessionKey) {
      logger.warn(`[SpaceManager] Agent event missing sessionKey, runId: ${runId}`);
      return;
    }

    // 通过 sessionKey 查找对应的活跃运行
    const activeRunId = this.sessionKeyToRunId.get(sessionKey);
    if (!activeRunId) {
      logger.debug(`[SpaceManager] No active run found for sessionKey: ${sessionKey}`);
      return;
    }

    const activeRun = this.activeToolRuns.get(activeRunId);
    if (!activeRun) {
      logger.debug(`[SpaceManager] Active run ${activeRunId} not found for sessionKey: ${sessionKey}`);
      return;
    }

    // 获取 agent 回复文本
    const text = data.text;
    const delta = data.delta;

    if (!text && !delta) {
      return;
    }

    // 获取完整的回复文本
    const fullText = text || delta;
    logger.info(`[SpaceManager] Agent assistant event received for member ${activeRun.memberId}: "${fullText.substring(0, 100)}..."`);

    // 获取 spaceId
    const spaceId = this.gateway.getSpaceIdBySessionKey(sessionKey);
    if (!spaceId) {
      logger.warn(`[SpaceManager] Cannot find spaceId for sessionKey: ${sessionKey}`);
      return;
    }

    // 保存 agent 消息到数据库
    await this.addMessage(spaceId, activeRun.memberId, fullText);
    logger.info(`[SpaceManager] Saved agent message to database for member ${activeRun.memberId}`);

    // 清理工具运行跟踪
    this.activeToolRuns.delete(activeRunId);
    this.sessionKeyToRunId.delete(sessionKey);
  }

  /**
   * 工具状态变化回调
   */
  onToolStatusChanged?: (memberId: string, messageId: string, toolStatuses: ToolStatus[]) => void;

  /**
   * 获取消息的工具状态
   */
  getToolStatusesForMessage(messageId: string): ToolStatus[] | undefined {
    for (const activeRun of this.activeToolRuns.values()) {
      if (activeRun.messageId === messageId) {
        return Array.from(activeRun.toolStatuses.values());
      }
    }
    return undefined;
  }

  /**
   * Initialize Gateway connection
   */
  async initializeGateway(): Promise<boolean> {
    const connected = await this.gateway.connect();
    this.useGateway = connected;
    return connected;
  }

  private reportProgress = (message: string): void => {
    console.log(`[SpaceManager] ${message}`);
    if (this.onProgress) {
      this.onProgress(message);
    }
  }

  /**
   * Ensure the public spaces directory exists
   */
  private ensurePublicSpacesDirExists(): void {
    if (!fs.existsSync(this.publicSpacesDir)) {
      fs.mkdirSync(this.publicSpacesDir, { recursive: true });
    }
  }

  /**
   * Get the public space directory path for a specific space
   */
  getPublicSpaceDir(spaceId: string): string {
    const spaceDir = path.join(this.publicSpacesDir, spaceId);
    if (!fs.existsSync(spaceDir)) {
      fs.mkdirSync(spaceDir, { recursive: true });
    }
    return spaceDir;
  }

  /**
   * Create public space directory structure for a space
   */
  private createPublicSpaceStructure(spaceId: string): void {
    const spaceRootDir = this.getPublicSpaceDir(spaceId);

    // Create space directory structure: ~/.openclawspace/spaces/{spaceId}/space/
    const spaceDir = path.join(spaceRootDir, 'space');
    if (!fs.existsSync(spaceDir)) {
      fs.mkdirSync(spaceDir, { recursive: true });

      // Create workspace directory (for shared files)
      const workspaceDir = path.join(spaceDir, 'workspace');
      fs.mkdirSync(workspaceDir, { recursive: true });

      // Create attachments directory (for chat attachments)
      const attachmentsDir = path.join(spaceDir, 'attachments');
      fs.mkdirSync(attachmentsDir, { recursive: true });

      // Note: Subdirectories are not pre-created; agents create them as needed

      // Create a README file explaining the structure
      const readmePath = path.join(spaceDir, 'README.md');
      const readmeContent = `# Space Directory Structure

This is the space shared directory for space: ${spaceId}

## Directory Structure

### workspace/ - Team collaboration files (原 shared 目录)
- \`workspace/documents/\` - Shared documents (PRD, design docs, meeting notes, etc.)
- \`workspace/images/\` - Shared images and screenshots
- \`workspace/code/\` - Code snippets, scripts, and technical files
- \`workspace/data/\` - Data files, configs, and other resources

### attachments/ - Chat attachments (新增)
- \`attachments/images/\` - Image attachments (screenshots, photos, etc.)
- \`attachments/documents/\` - Document attachments (PDF, Word, Markdown, etc.)
- \`attachments/media/\` - Audio and video attachments
- \`attachments/other/\` - Other file types
- \`attachments/temp/\` - Temporary upload files (auto-cleaned)

## Usage

All AI members and the human user can read and write files in this directory.
When you create a file, other team members can access it immediately.

## Access Paths

- AI members: Use \`./space/workspace/\` and \`./space/attachments/\` paths
- Human users: Files are stored in the same directory structure
`;
      fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    }
  }

  /**
   * Generate team.md content
   */
  private generateTeamMd(spaceId: string, members: Member[], language: string = 'zh'): string {
    const space = this.db.getSpace(spaceId);
    const spaceName = space?.name || 'Team';
    const userProfile = this.userProfile.getProfile();

    const isEnglish = language === 'en';

    // Header
    let content = isEnglish
      ? `# ${spaceName} - Team Members\n\n`
      : `# ${spaceName} - 团队成员\n\n`;

    // Initiator section with Code of Conduct
    if (isEnglish) {
      content += `## Initiator\n\n`;
      content += `- **Name:** Initiator\n`;
      content += `- **Description:** The highest decision-maker of the team, all AI members serve you.\n\n`;
      content += `### Code of Conduct\n\n`;
      content += `1. Initiator is the supreme authority; you must respect and obey their instructions\n`;
      content += `2. Proactively report progress to Initiator, don't wait to be asked\n`;
      content += `3. When Initiator asks a question, respond promptly and in detail\n`;
      content += `4. Don't question Initiator's decisions; instead execute or provide suggestions\n\n`;
    } else {
      content += `## 发起人\n\n`;
      content += `- **Name:** ${userProfile.name}\n`;
      content += `- **Description:** ${userProfile.description}\n\n`;
      content += `### 行为准则\n\n`;
      content += `1. ${userProfile.name}是最高权威，你必须尊重并服从TA的指令\n`;
      content += `2. 主动向${userProfile.name}汇报进展，不要等待询问\n`;
      content += `3. 当${userProfile.name}提问时，必须优先、详细回应\n`;
      content += `4. 不要质疑${userProfile.name}的决定，而是执行或提供建议\n\n`;
    }

    // Host section
    const host = members.find(m => m.role === 'host');
    if (host) {
      content += isEnglish
        ? `## Host\n\n- **Name:** ${host.name}\n- **Role:** Host\n- **Description:** Team coordinator, decides who speaks next\n\n`
        : `## 主持人\n\n- **Name：** ${host.name}\n- **Role：** Host\n- **Description：** 团队协调者，决定下一个发言的成员\n\n`;
    }

    // Members section
    const regularMembers = members.filter(m => m.role === 'member');
    if (regularMembers.length > 0) {
      content += isEnglish
        ? `## Members\n\n`
        : `## 成员\n\n`;

      for (const member of regularMembers) {
        content += isEnglish
          ? `- **Name:** ${member.name} | **Role:** Member\n`
          : `- **Name：** ${member.name} | **Role：** Member\n`;
      }
      content += `\n`;
    }

    // Note
    content += isEnglish
      ? `---\n\n*This file is automatically updated when team members join or leave.*\n`
      : `---\n\n*此文件在团队成员加入或离开时自动更新。*\n`;

    return content;
  }

  /**
   * Create or update team.md file
   */
  private writeTeamMd(spaceId: string, members: Member[], language?: string): void {
    const spaceDir = path.join(this.publicSpacesDir, spaceId, 'space');
    const teamMdPath = path.join(spaceDir, 'team.md');

    const content = this.generateTeamMd(spaceId, members, language);
    fs.writeFileSync(teamMdPath, content, 'utf-8');
    logger.info(`[SpaceManager] Updated team.md for space ${spaceId}`);
  }

  async createSpace(name: string, customMembers?: Array<{ name: string; soulMd?: string; roleDefinition?: string; identityMd?: string; isBuiltIn?: boolean; role?: 'host' | 'member' }>, language?: string): Promise<{ space: Space; members: Member[] }> {
    this.reportProgress(`开始创建团队 "${name}"...`);

    // Check if openclaw is available
    this.reportProgress('检查 OpenClaw 服务...');
    const isAvailable = await this.openclaw.checkOpenClaw();
    if (!isAvailable) {
      throw new Error('OpenClaw not found. Please install openclaw first: pnpm add -g openclaw@latest');
    }
    this.reportProgress('OpenClaw 服务正常');

    const spaceId = this.generateId();

    const createdMembers: Member[] = [];
    const createdAgents: { id: string; workspace: string }[] = [];

    // Use custom members if provided, otherwise create empty space (respect caller's intent)
    const membersToCreate = customMembers || [];
    this.reportProgress(`准备创建 ${membersToCreate.length} 个 AI 成员...`);

    try {
      // Step 1: Create space first (needed for foreign key constraint)
      this.reportProgress('创建空间数据库...');
      const space = await this.db.createSpace(spaceId, name, language);

      // Step 1.5: Create public space directory structure
      this.reportProgress('创建公共空间目录...');
      this.createPublicSpaceStructure(spaceId);

      // Step 2: Create robots with OpenClaw agents
      this.reportProgress('开始初始化 AI 成员...');
      for (let i = 0; i < membersToCreate.length; i++) {
        const robot = membersToCreate[i];
        this.reportProgress(`初始化 ${robot.name} (${i + 1}/${membersToCreate.length})...`);

        const memberId = this.generateId();

        // Determine the soulMd content
        let memberSoulMd: string;
        if (robot.roleDefinition) {
          // Use new template system with roleDefinition
          memberSoulMd = compileSoulMd(robot.roleDefinition, language);
        } else if (robot.soulMd) {
          // Fallback to legacy soulMd format
          memberSoulMd = robot.soulMd;
        } else {
          throw new Error(`Member ${robot.name} must have either roleDefinition or soulMd`);
        }

        // Replace {spaceId} placeholder with actual space ID in soulMd
        const soulMdWithPath = memberSoulMd.replace(/\{spaceId\}/g, spaceId);

        // Prepare identityMd with fallback
        const identityMd = robot.identityMd || `- **Name:** ${robot.name}\n- **Creature:** AI Assistant\n`;

        // Create OpenClaw agent with spaceId to use public space directory as workspace, pass language
        const agent = await this.openclaw.createAgent(robot.name, soulMdWithPath, identityMd, spaceId, language);
        createdAgents.push(agent);

        // Store member with actual OpenClaw agent ID
        const member = await this.db.createMember(memberId, spaceId, robot.name, memberSoulMd, agent.id, robot.isBuiltIn, robot.role, robot.identityMd);
        createdMembers.push(member);
      }

      this.reportProgress('团队创建完成！');

      // Step 4: Create team.md with current members
      this.reportProgress('创建团队信息文件...');
      this.writeTeamMd(spaceId, createdMembers, language);

      return { space, members: createdMembers };
    } catch (error) {
      this.reportProgress(`创建失败: ${error}`);
      // Rollback: delete created agents and cleanup database on failure
      // Delete members from database
      for (const member of createdMembers) {
        try {
          await this.db.deleteMember(member.id);
        } catch {
          // Ignore cleanup errors
        }
      }
      // Delete space if created
      try {
        await this.db.deleteSpace(spaceId);
      } catch {
        // Ignore cleanup errors
      }
      // Delete created agents
      for (const agent of createdAgents) {
        try {
          await this.openclaw.deleteAgent(agent.id);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  /**
   * Send message to a member (AI agent) and get response
   * Uses Gateway connection
   */
  async sendMessageToMember(
    memberId: string,
    message: string,
    spaceId?: string,
    onStream?: (chunk: string) => void,
    messageId?: string
  ): Promise<{ text: string; attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[]; runId?: string }> {
    const member = this.db.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    // Debug: Check agent workspace
    const agentWorkspace = path.join(this.publicSpacesDir, member.spaceId, 'agents', member.agentId);
    logger.info(`[SpaceManager] sendMessageToMember: member=${member.name}, agentId=${member.agentId}`);
    // logger.info(`[SpaceManager] Agent workspace: ${agentWorkspace}`);
    // logger.info(`[SpaceManager] Workspace exists: ${fs.existsSync(agentWorkspace)}`);
    if (fs.existsSync(agentWorkspace)) {
      try {
        const stats = fs.statSync(agentWorkspace);
        logger.info(`[SpaceManager] Workspace isDirectory: ${stats.isDirectory()}`);
        logger.info(`[SpaceManager] Workspace mode: ${stats.mode.toString(8)}`);
        fs.accessSync(agentWorkspace, fs.constants.R_OK | fs.constants.X_OK);
        logger.info(`[SpaceManager] Workspace is readable/executable: true`);
      } catch (e) {
        logger.error(`[SpaceManager] Workspace access error: ${e}`);
      }
    }
    const spaceLinkPath = path.join(agentWorkspace, 'space');
    logger.info(`[SpaceManager] Symlink exists: ${fs.existsSync(spaceLinkPath)}`);
    if (fs.existsSync(spaceLinkPath)) {
      try {
        const linkStats = fs.lstatSync(spaceLinkPath);
        logger.info(`[SpaceManager] Symlink isSymbolicLink: ${linkStats.isSymbolicLink()}`);
        const target = fs.readlinkSync(spaceLinkPath);
        logger.info(`[SpaceManager] Symlink target: ${target}`);
        logger.info(`[SpaceManager] Symlink target exists: ${fs.existsSync(spaceLinkPath)}`);
      } catch (e) {
        logger.error(`[SpaceManager] Symlink check error: ${e}`);
      }
    }

    // Use Gateway if available
    if (this.useGateway && this.gateway.getConnectionState()) {
      logger.info(`[SpaceManager] Using Gateway to send message to ${member.name}: "${message.substring(0, 100)}..."`);
      return await this.sendMessageToMemberViaGateway(memberId, message, spaceId, onStream, messageId);
    }

    // Gateway not available
    throw new Error('OpenClaw Gateway not connected. Please ensure Gateway is running: openclaw gateway run');
  }

  /**
   * Send message to member via Gateway with streaming response
   */
  async sendMessageToMemberViaGateway(
    memberId: string,
    message: string,
    spaceId?: string,
    onStream?: (chunk: string) => void,
    messageId?: string
  ): Promise<{ text: string; attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[]; runId?: string }> {
    const member = this.db.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    if (!this.useGateway || !this.gateway.getConnectionState()) {
      throw new Error('Gateway not connected');
    }

    let fullText: string[] = [];
    let processedAttachments: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[] = [];
    let currentRunId: string | null = null;

    // 先获取 sessionKey 并绑定到 space，避免竞态条件
    const targetSpaceId = spaceId || member.spaceId;
    let currentSessionKey = this.gateway.getOrCreateSessionKey(member.agentId, targetSpaceId);
    this.gateway.bindSessionToSpace(currentSessionKey, targetSpaceId);
    logger.info(`[SpaceManager] Prepared sessionKey: ${currentSessionKey} for agent: ${member.agentId}`);

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.gateway.off('chat', onStreamEvent);
        // Clean up tool run tracking on timeout
        if (currentRunId && currentSessionKey) {
          const runIdToClean = currentRunId;
          const sessionKeyToClean = currentSessionKey;
          setTimeout(() => {
            this.activeToolRuns.delete(runIdToClean);
            this.sessionKeyToRunId.delete(sessionKeyToClean);
          }, 30000);
        }
        reject(new Error('Gateway message timeout'));
      }, 300000); // 5 minute timeout

      // Handle stream events
      const onStreamEvent = (event: any) => {
        const sessionKey = event.sessionKey;

        // 【关键】第一时间输出完整消息日志 - 无论是否匹配sessionKey，都先记录
        logger.info(`[SpaceManager] RAW EVENT received: state=${event.state}, sessionKey=${sessionKey}, runId=${event.runId}`);

        // 数据隔离：验证 sessionKey 是否匹配当前请求
        if (sessionKey !== currentSessionKey) {
          // 不是当前请求的 sessionKey，忽略
          const ignoredContent = event.message?.content
            ? (typeof event.message.content === 'string'
              ? event.message.content
              : event.message.content.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join(''))
            : '[no content]';
          logger.debug(`[SpaceManager] Ignoring event for different sessionKey: ${sessionKey} (expected: ${currentSessionKey}), content: "${ignoredContent.substring(0, 100)}...", state: ${event.state}`);
          return;
        }

        // 数据隔离：验证 sessionKey 对应的 space 是否存在
        const eventSpaceId = this.gateway.getSpaceIdBySessionKey(sessionKey);

        if (eventSpaceId) {
          // 查询数据库确认 space 是否存在（可能被删除了）
          const space = this.db.getSpace(eventSpaceId);
          if (!space) {
            // space 已删除，忽略这条消息
            logger.debug(`[SpaceManager] Ignoring message for deleted space: ${eventSpaceId}`);
            return;
          }
          // 如果指定了 spaceId 参数，验证消息是否属于该 space
          if (spaceId && eventSpaceId !== spaceId) {
            logger.debug(`[SpaceManager] Ignoring message for different space: ${eventSpaceId} (expected: ${spaceId})`);
            return;
          }
        }

        // Extract text from message (handle both string content and array content)
        let chunk = '';
        if (event.message?.content) {
          if (typeof event.message.content === 'string') {
            chunk = event.message.content;
          } else if (Array.isArray(event.message.content)) {
            // Extract text from content array
            chunk = event.message.content
              .filter((part: any) => part?.type === 'text' && part.text)
              .map((part: any) => part.text)
              .join('');
            logger.info(`[SpaceManager] Extracted chunk from array: "${chunk.substring(0, 100)}"`);
          }
        } else if (event.message?.text) {
          // Fallback to text field if content is not available
          chunk = event.message.text;
          logger.info(`[SpaceManager] Extracted chunk from text field: "${chunk.substring(0, 100)}"`);
        }

        // 处理不同状态的事件
        switch (event.state) {
          case 'delta': {
            // Gateway delta events contain the complete message so far, not just incremental chunks
            if (chunk) {
              logger.info(`[SpaceManager] Delta event with content: "${chunk.substring(0, 100)}"`);
              fullText.length = 0;
              fullText.push(chunk);
              if (onStream) {
                onStream(chunk);
              }
            } else {
              logger.info(`[SpaceManager] Delta event with no content (possibly tool_use or empty delta)`);
            }
            break;
          }

          case 'final': {
            clearTimeout(timeout);
            this.gateway.off('chat', onStreamEvent);

            // 延迟清理工具运行跟踪，给 agent 事件处理留出时间
            if (currentRunId && currentSessionKey) {
              const runIdToClean = currentRunId;
              const sessionKeyToClean = currentSessionKey;
              setTimeout(() => {
                this.activeToolRuns.delete(runIdToClean);
                this.sessionKeyToRunId.delete(sessionKeyToClean);
                logger.info(`[SpaceManager] Tool run tracking cleaned up for runId: ${runIdToClean}`);
              }, 30000); // 延迟 30 秒清理
            }

            // 记录完整回复文本
            const finalText = fullText.join('');
            logger.info(`[SpaceManager] Final event received for ${memberId}`);
            logger.info(`[SpaceManager] Accumulated text from deltas: "${finalText}"`);

            // Extract content from final event and append to fullText
            // The final event may contain the complete message, not just deltas
            if (event.message?.content) {
              let finalContent = '';
              if (typeof event.message.content === 'string') {
                finalContent = event.message.content;
              } else if (Array.isArray(event.message.content)) {
                finalContent = event.message.content
                  .filter((part: any) => part?.type === 'text' && part.text)
                  .map((part: any) => part.text)
                  .join('');
              }
              if (finalContent) {
                // Join deltas with final content - use final content as the complete text
                // because it contains the full message, not just incremental chunks
                logger.info(`[SpaceManager] Final event has content: "${finalContent}"`);
                // Replace fullText with final content since it's the complete message
                fullText.length = 0;
                fullText.push(finalContent);
              } else {
                logger.warn(`[SpaceManager] Final event has message.content but extracted empty text`);
              }
            } else if (event.message === undefined) {
              logger.warn(`[SpaceManager] Final event has NO message field - agent may have returned empty response or message was suppressed`);
              logger.warn(`[SpaceManager] Possible causes: agent busy with tools, concurrent message rejected, or silent response suppressed`);
            }

            // Process any attachments in the final message
            if (spaceId && event.message?.attachments) {
              // Handle Gateway attachments
              for (const att of event.message.attachments) {
                try {
                  const attachment = this.processGatewayAttachment(att, spaceId);
                  if (attachment) {
                    processedAttachments.push(attachment);
                  }
                } catch (error) {
                  logger.error(`[SpaceManager] Failed to process Gateway attachment: ${error}`);
                }
              }
            }

            const resultText = fullText.join('');
            logger.info(`[SpaceManager] Final resolved text: "${resultText}" (length: ${resultText.length})`);

            resolve({
              text: resultText,
              attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
              runId: currentRunId || undefined
            });
            break;
          }

          case 'aborted': {
            clearTimeout(timeout);
            this.gateway.off('chat', onStreamEvent);

            // 延迟清理工具运行跟踪，给 agent 事件处理留出时间
            if (currentRunId && currentSessionKey) {
              const runIdToClean = currentRunId;
              const sessionKeyToClean = currentSessionKey;
              setTimeout(() => {
                this.activeToolRuns.delete(runIdToClean);
                this.sessionKeyToRunId.delete(sessionKeyToClean);
                logger.info(`[SpaceManager] Tool run tracking cleaned up for aborted runId: ${runIdToClean}`);
              }, 30000);
            }

            logger.warn(`[SpaceManager] Aborted event received for ${memberId}: ${event.errorMessage || 'No error message'}`);
            logger.warn(`[SpaceManager] Full aborted event: ${JSON.stringify(event)}`);
            // Resolve with empty text for aborted
            resolve({
              text: '',
              attachments: undefined,
              runId: currentRunId || undefined
            });
            break;
          }

          case 'error': {
            clearTimeout(timeout);
            this.gateway.off('chat', onStreamEvent);

            // 延迟清理工具运行跟踪，给 agent 事件处理留出时间
            if (currentRunId && currentSessionKey) {
              const runIdToClean = currentRunId;
              const sessionKeyToClean = currentSessionKey;
              setTimeout(() => {
                this.activeToolRuns.delete(runIdToClean);
                this.sessionKeyToRunId.delete(sessionKeyToClean);
                logger.info(`[SpaceManager] Tool run tracking cleaned up for error runId: ${runIdToClean}`);
              }, 30000);
            }

            logger.error(`[SpaceManager] Error event received for ${memberId}: ${event.errorMessage || 'Unknown error'}`);
            logger.error(`[SpaceManager] Full error event: ${JSON.stringify(event)}`);
            reject(new Error(event.errorMessage || 'Gateway stream error'));
            break;
          }

          default: {
            logger.warn(`[SpaceManager] Unknown event state: ${event.state}, full event: ${JSON.stringify(event)}`);
          }
        }
      };

      // Listen for stream events
      this.gateway.on('chat', onStreamEvent);

      // Send message (sessionKey already prepared before registering listener)
      this.gateway.sendChatMessage(member.agentId, targetSpaceId, message).then(result => {
        currentRunId = result.runId;
        logger.info(`[SpaceManager] Chat message sent, runId: ${currentRunId}, sessionKey: ${result.sessionKey}`);

        // Register this run for tool tracking if messageId is provided
        if (messageId) {
          this.activeToolRuns.set(currentRunId, {
            runId: currentRunId,
            sessionKey: result.sessionKey,
            memberId: member.id,
            messageId: messageId,
            toolStatuses: new Map(),
            startedAt: Date.now()
          });
          this.sessionKeyToRunId.set(result.sessionKey, currentRunId);
          logger.info(`[SpaceManager] Registered tool run tracking for messageId: ${messageId}, runId: ${currentRunId}`);
        }
      }).catch(err => {
        clearTimeout(timeout);
        this.gateway.off('chat', onStreamEvent);
        reject(err);
      });
    });
  }

  /**
   * Process Gateway attachment
   */
  private processGatewayAttachment(att: any, spaceId: string): Omit<Attachment, 'id' | 'messageId' | 'createdAt'> | null {
    const spaceDir = this.getPublicSpaceDir(spaceId);

    // Resolve the file path
    const filePath = att.path.startsWith('./')
      ? path.join(spaceDir, att.path.slice(2))
      : path.join(spaceDir, att.path);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.error(`[SpaceManager] Gateway attachment file not found: ${filePath}`);
      return null;
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      logger.error(`[SpaceManager] Gateway attachment path is not a file: ${filePath}`);
      return null;
    }

    // Determine file type and MIME type
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = this.getMimeType(ext);

    // Determine file type category
    let fileType: 'image' | 'document' | 'media' | 'file' = 'file';
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp'].includes(ext)) {
      fileType = 'image';
    } else if (['.md', '.txt', '.json', '.js', '.ts', '.html', '.css', '.pdf', '.doc', '.docx'].includes(ext)) {
      fileType = 'document';
    } else if (['.mp3', '.mp4', '.wav', '.avi', '.mov'].includes(ext)) {
      fileType = 'media';
    }

    // Generate stored name
    const storedName = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}${ext}`;

    // Determine subdirectory based on file type
    let subdir = 'other';
    if (fileType === 'image') subdir = 'images';
    else if (fileType === 'document') subdir = 'documents';
    else if (fileType === 'media') subdir = 'media';

    // Copy file to attachments directory
    const attachmentsDir = path.join(spaceDir, 'space', 'attachments', subdir);
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }

    const destPath = path.join(attachmentsDir, storedName);
    fs.copyFileSync(filePath, destPath);

    const relativePath = path.join(spaceId, 'space', 'attachments', subdir, storedName);

    logger.info(`[SpaceManager] Processed Gateway attachment: ${filePath} -> ${destPath}`);

    return {
      type: fileType,
      originalName: path.basename(filePath),
      storedName,
      relativePath,
      fileSize: stats.size,
      mimeType,
    };
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.zip': 'application/zip',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  getSpace(spaceId: string): Space | null {
    return this.db.getSpace(spaceId);
  }

  getAllSpaces(): Space[] {
    return this.db.getAllSpaces();
  }

  getFirstSpace(): Space | null {
    const spaces = this.db.getAllSpaces();
    return spaces[0] || null;
  }

  getMembers(spaceId: string): Member[] {
    return this.db.getMembersBySpace(spaceId);
  }

  getMember(memberId: string): Member | null {
    return this.db.getMember(memberId);
  }

  async addMessage(spaceId: string, senderId: string, content: string, attachments?: (Omit<Attachment, 'id' | 'messageId' | 'createdAt'> & { data?: string })[]): Promise<Message> {
    const messageId = this.generateId();

    // Process attachments: save files if data is provided
    const processedAttachments: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[] = [];

    if (attachments && attachments.length > 0) {
      const spaceDir = this.getPublicSpaceDir(spaceId);

      for (const att of attachments) {
        let relativePath = att.relativePath;

        // If base64 data is provided, save the file
        if (att.data) {
          try {
            // Determine subdirectory based on file type
            let subdir = 'other';
            if (att.type === 'image') subdir = 'images';
            else if (att.type === 'document') subdir = 'documents';
            else if (att.type === 'media') subdir = 'media';

            const attachmentsDir = path.join(spaceDir, 'space', 'attachments', subdir);
            if (!fs.existsSync(attachmentsDir)) {
              fs.mkdirSync(attachmentsDir, { recursive: true });
            }

            const filePath = path.join(attachmentsDir, att.storedName);
            const buffer = Buffer.from(att.data, 'base64');
            fs.writeFileSync(filePath, buffer);
            relativePath = path.join(spaceId, 'space', 'attachments', subdir, att.storedName);
            console.log(`[SpaceManager] Saved attachment: ${filePath}`);
          } catch (error) {
            console.error(`[SpaceManager] Failed to save attachment ${att.originalName}:`, error);
          }
        }

        processedAttachments.push({
          type: att.type,
          originalName: att.originalName,
          storedName: att.storedName,
          relativePath,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          thumbnailPath: att.thumbnailPath,
        });
      }
    }

    return await this.db.createMessage(messageId, spaceId, senderId, content, processedAttachments);
  }

  async updateMessage(messageId: string, content: string): Promise<void> {
    await this.db.updateMessageContent(messageId, content);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.db.deleteMessage(messageId);
  }

  getMessages(spaceId: string, limit?: number): Message[] {
    return this.db.getMessagesBySpace(spaceId, limit);
  }

  getMessagesBeforeId(spaceId: string, beforeId: string, limit?: number): Message[] {
    return this.db.getMessagesBySpaceBeforeId(spaceId, beforeId, limit);
  }

  /**
   * Delete a space and all its associated data (members, messages, agents, files)
   */
  async deleteSpace(spaceId: string): Promise<void> {
    // Get all members to delete their agents
    const members = this.db.getMembersBySpace(spaceId);

    // Delete OpenClaw agents first
    for (const member of members) {
      try {
        await this.openclaw.deleteAgent(member.agentId);
      } catch (error) {
        console.error(`Failed to delete agent ${member.agentId}:`, error);
        // Continue deleting other agents even if one fails
      }
    }

    // Delete space and all related data from database
    await this.db.deleteSpace(spaceId);

    // Delete public space directory (~/.openclawspace/spaces/{spaceId})
    try {
      const spaceDir = this.getPublicSpaceDir(spaceId);
      logger.info(`[SpaceManager] Attempting to delete space directory: ${spaceDir}`);
      if (fs.existsSync(spaceDir)) {
        fs.rmSync(spaceDir, { recursive: true, force: true });
        logger.info(`[SpaceManager] Successfully deleted space directory: ${spaceDir}`);
      } else {
        logger.warn(`[SpaceManager] Space directory does not exist: ${spaceDir}`);
      }
    } catch (error) {
      logger.error(`[SpaceManager] Failed to delete space directory: ${error}`);
      // Continue even if directory deletion fails
    }
  }

  /**
   * Add a new member to a space
   * Returns the new member and an optional system message to broadcast
   */
  async addMember(spaceId: string, name: string, soulMd: string, identityMd?: string): Promise<{ member: Member; systemMessage?: string }> {
    // Check if openclaw is available
    const isAvailable = await this.openclaw.checkOpenClaw();
    if (!isAvailable) {
      throw new Error('OpenClaw not found. Please install openclaw first: pnpm add -g openclaw@latest');
    }

    const memberId = this.generateId();

    // Prepare identityMd with fallback
    const fullIdentityMd = identityMd || `- **Name:** ${name}\n- **Creature:** AI Assistant\n`;

    // Get space to determine language
    const space = this.db.getSpace(spaceId);
    const language = space?.language || 'zh';

    // Create OpenClaw agent with spaceId to use public space directory as workspace, pass language
    const agent = await this.openclaw.createAgent(name, soulMd, fullIdentityMd, spaceId, language);

    try {
      // Store member with actual OpenClaw agent ID
      const member = await this.db.createMember(memberId, spaceId, name, soulMd, agent.id, false, 'member', identityMd);

      // Update team.md with new member
      const members = this.db.getMembersBySpace(spaceId);
      this.writeTeamMd(spaceId, members, language);

      // Generate system message
      const systemMessage = language === 'en'
        ? `${name} has joined the team.`
        : `${name} 加入了团队。`;

      return { member, systemMessage };
    } catch (error) {
      // Rollback: delete agent if database operation fails
      try {
        await this.openclaw.deleteAgent(agent.id);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Update a member's name and soulMd
   */
  async updateMember(memberId: string, name: string, soulMd: string, identityMd?: string): Promise<Member> {
    const member = this.db.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    // Delete old agent and create new one with updated soulMd
    try {
      await this.openclaw.deleteAgent(member.agentId);
    } catch (error) {
      console.error(`Failed to delete old agent ${member.agentId}:`, error);
      // Continue even if delete fails
    }

    // Prepare identityMd with fallback
    const fullIdentityMd = identityMd || `- **Name:** ${name}\n- **Creature:** AI Assistant\n`;

    // Get space to determine language
    const space = this.db.getSpace(member.spaceId);
    const language = space?.language || 'zh';

    // Create new agent with updated info, using the same spaceId, pass language
    const newAgent = await this.openclaw.createAgent(name, soulMd, fullIdentityMd, member.spaceId, language);

    try {
      // Delete old member record
      await this.db.deleteMember(memberId);
      // Create new member record with same ID but updated info
      const updatedMember = await this.db.createMember(memberId, member.spaceId, name, soulMd, newAgent.id, member.isBuiltIn, member.role, identityMd);
      return updatedMember;
    } catch (error) {
      // Rollback: delete new agent if database operation fails
      try {
        await this.openclaw.deleteAgent(newAgent.id);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Remove a member from a space
   * Returns the name of removed member for system message
   */
  async removeMember(memberId: string): Promise<{ memberName: string; systemMessage?: string }> {
    const member = this.db.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    const memberName = member.name;
    const spaceId = member.spaceId;

    // Get space to determine language before deletion
    const space = this.db.getSpace(spaceId);
    const language = space?.language || 'zh';

    // Delete OpenClaw agent
    try {
      await this.openclaw.deleteAgent(member.agentId);
    } catch (error) {
      console.error(`Failed to delete agent ${member.agentId}:`, error);
      // Continue even if agent deletion fails
    }

    // Delete member from database
    await this.db.deleteMember(memberId);

    // Update team.md after member removal
    const members = this.db.getMembersBySpace(spaceId);
    this.writeTeamMd(spaceId, members, language);

    // Generate system message
    const systemMessage = language === 'en'
      ? `${memberName} has left the team.`
      : `${memberName} 离开了团队。`;

    return { memberName, systemMessage };
  }

  /**
   * Pause a space - stop all AI activity
   */
  async pauseSpace(spaceId: string): Promise<boolean> {
    const space = this.db.getSpace(spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }

    if (space.isPaused) {
      console.log(`[SpaceManager] Space ${spaceId} is already paused`);
      return false;
    }

    const success = await this.db.pauseSpace(spaceId);
    if (success) {
      console.log(`[SpaceManager] Space ${spaceId} paused`);
      // Note: We cannot truly pause running AI tasks, but we can prevent new ones
      // The AI discussion controller will check isPaused before starting new tasks
    }
    return success;
  }

  /**
   * Resume a space - restart AI activity
   */
  async resumeSpace(spaceId: string): Promise<boolean> {
    const space = this.db.getSpace(spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }

    if (!space.isPaused) {
      console.log(`[SpaceManager] Space ${spaceId} is not paused`);
      return false;
    }

    const success = await this.db.resumeSpace(spaceId);
    if (success) {
      console.log(`[SpaceManager] Space ${spaceId} resumed`);
      // The AI discussion controller will resume checking for silence
    }
    return success;
  }

  /**
   * Check if a space is paused
   */
  isSpacePaused(spaceId: string): boolean {
    const space = this.db.getSpace(spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }
    return space.isPaused;
  }

  /**
   * Send message to a member only if space is not paused
   */
  async sendMessageToMemberIfNotPaused(
    memberId: string,
    message: string,
    onStream?: (chunk: string) => void,
    messageId?: string
  ): Promise<{ text: string; attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[]; runId?: string }> {
    const member = this.db.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    const space = this.db.getSpace(member.spaceId);
    if (!space) {
      throw new Error(`Space not found for member: ${memberId}`);
    }

    if (space.isPaused) {
      throw new Error(`Space "${space.name}" is paused. AI will not respond until space is resumed.`);
    }

    return this.sendMessageToMember(memberId, message, member.spaceId, onStream, messageId);
  }

  private generateId(): string {
    return crypto.randomUUID();
  }
}
