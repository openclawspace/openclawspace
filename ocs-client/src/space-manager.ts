import { Database, Space, Member, Message, Attachment } from './database.js';
import { OpenClawClient, AttachmentRequest } from './openclaw-client.js';
import { UserProfileManager } from './user-profile.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';


export class SpaceManager {
  private db: Database;
  private openclaw: OpenClawClient;
  private userProfile: UserProfileManager;
  private publicSpacesDir: string;
  public onProgress?: (message: string) => void;

  constructor(db: Database, userProfile?: UserProfileManager) {
    this.db = db;
    this.openclaw = new OpenClawClient();
    this.userProfile = userProfile || new UserProfileManager();
    this.publicSpacesDir = path.join(os.homedir(), '.ocs-client', 'spaces');
    this.ensurePublicSpacesDirExists();
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

    // 创建 space 目录结构：~/.ocs-client/spaces/{spaceId}/space/
    const spaceDir = path.join(spaceRootDir, 'space');
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

  async createSpace(name: string, customMembers?: Array<{ name: string; soulMd: string }>): Promise<{ space: Space; members: Member[] }> {
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
      const space = await this.db.createSpace(spaceId, name);

      // Step 1.5: Create public space directory structure
      this.reportProgress('创建公共空间目录...');
      this.createPublicSpaceStructure(spaceId);

      // Step 2: Create robots with OpenClaw agents
      // Get user context to inject into AI's soulMd
      const userContext = this.userProfile.generateUserContextForAI();

      // Step 2: Create robots with OpenClaw agents
      this.reportProgress('开始初始化 AI 成员...');
      for (let i = 0; i < membersToCreate.length; i++) {
        const robot = membersToCreate[i];
        this.reportProgress(`初始化 ${robot.name} (${i + 1}/${membersToCreate.length})...`);

        const memberId = this.generateId();

        // Replace {spaceId} placeholder with actual space ID in soulMd
        const soulMdWithPath = robot.soulMd.replace(/\{spaceId\}/g, spaceId);

        // Combine user context with robot's soulMd
        const fullSoulMd = userContext + soulMdWithPath;

        // Create OpenClaw agent with spaceId to use public space directory as workspace
        const agent = await this.openclaw.createAgent(robot.name, fullSoulMd, spaceId);
        createdAgents.push(agent);

        // Store member with actual OpenClaw agent ID
        const member = await this.db.createMember(memberId, spaceId, robot.name, robot.soulMd, agent.id);
        createdMembers.push(member);
      }

      this.reportProgress('团队创建完成！');
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
   */
  async sendMessageToMember(memberId: string, message: string, spaceId?: string): Promise<{ text: string; attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[] }> {
    const member = this.db.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    // Call OpenClaw agent with attachment parsing
    const { text, attachments: attachmentRequests } = await this.openclaw.sendMessageWithAttachments(member.agentId, message);

    // Process attachment requests if any
    const processedAttachments: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[] = [];

    if (attachmentRequests && attachmentRequests.length > 0 && spaceId) {
      const spaceDir = this.getPublicSpaceDir(spaceId);

      for (const attReq of attachmentRequests) {
        try {
          // Resolve the file path
          const filePath = attReq.path.startsWith('./')
            ? path.join(spaceDir, attReq.path.slice(2))
            : path.join(spaceDir, attReq.path);

          // Check if file exists
          if (!fs.existsSync(filePath)) {
            console.error(`[SpaceManager] Attachment file not found: ${filePath}`);
            continue;
          }

          const stats = fs.statSync(filePath);
          if (!stats.isFile()) {
            console.error(`[SpaceManager] Attachment path is not a file: ${filePath}`);
            continue;
          }

          // Determine file type and MIME type
          const ext = path.extname(filePath).toLowerCase();
          const mimeType = this.getMimeType(ext);
          const fileType = attReq.type;

          // Generate stored name
          const storedName = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}${ext}`;

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

          processedAttachments.push({
            type: fileType,
            originalName: path.basename(filePath),
            storedName,
            relativePath,
            fileSize: stats.size,
            mimeType,
          });

          console.log(`[SpaceManager] Processed attachment: ${filePath} -> ${destPath}`);
        } catch (error) {
          console.error(`[SpaceManager] Failed to process attachment:`, error);
        }
      }
    }

    return { text, attachments: processedAttachments.length > 0 ? processedAttachments : undefined };
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

    // Delete public space directory
    try {
      const spaceDir = this.getPublicSpaceDir(spaceId);
      if (fs.existsSync(spaceDir)) {
        fs.rmSync(spaceDir, { recursive: true, force: true });
        console.log(`[SpaceManager] Deleted public space directory: ${spaceDir}`);
      }
    } catch (error) {
      console.error(`[SpaceManager] Failed to delete public space directory: ${error}`);
      // Continue even if directory deletion fails
    }
  }

  /**
   * Add a new member to a space
   */
  async addMember(spaceId: string, name: string, soulMd: string): Promise<Member> {
    // Check if openclaw is available
    const isAvailable = await this.openclaw.checkOpenClaw();
    if (!isAvailable) {
      throw new Error('OpenClaw not found. Please install openclaw first: pnpm add -g openclaw@latest');
    }

    const memberId = this.generateId();

    // Create OpenClaw agent with spaceId to use public space directory as workspace
    const agent = await this.openclaw.createAgent(name, soulMd, spaceId);

    try {
      // Store member with actual OpenClaw agent ID
      const member = await this.db.createMember(memberId, spaceId, name, soulMd, agent.id);
      return member;
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
  async updateMember(memberId: string, name: string, soulMd: string): Promise<Member> {
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

    // Create new agent with updated info, using the same spaceId
    const newAgent = await this.openclaw.createAgent(name, soulMd, member.spaceId);

    try {
      // Delete old member record
      await this.db.deleteMember(memberId);
      // Create new member record with same ID but updated info
      const updatedMember = await this.db.createMember(memberId, member.spaceId, name, soulMd, newAgent.id);
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
   */
  async removeMember(memberId: string): Promise<void> {
    const member = this.db.getMember(memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    // Delete OpenClaw agent
    try {
      await this.openclaw.deleteAgent(member.agentId);
    } catch (error) {
      console.error(`Failed to delete agent ${member.agentId}:`, error);
      // Continue even if agent deletion fails
    }

    // Delete member from database
    await this.db.deleteMember(memberId);
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
  async sendMessageToMemberIfNotPaused(memberId: string, message: string): Promise<{ text: string; attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[] }> {
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

    return this.sendMessageToMember(memberId, message, member.spaceId);
  }

  private generateId(): string {
    return crypto.randomUUID();
  }
}
