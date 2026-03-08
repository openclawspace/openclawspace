import WebSocket from 'ws';
import { SpaceManager } from './space-manager.js';
import { AIDiscussionController } from './ai-discussion-controller.js';
import { Member } from './database.js';
import { getLogger } from './logger.js';
import { getUserProfileManager } from './user-profile.js';

const logger = getLogger();

interface HubClientOptions {
  hubUrl: string;
  token: string;
  spaceManager: SpaceManager;
}

interface HubMessage {
  type: string;
  payload?: any;
  _source?: string;
  _timestamp?: string;
}

export class HubClient {
  private hubUrl: string;
  private token: string;
  private spaceManager: SpaceManager;
  private ws: WebSocket | null = null;
  private reconnectInterval: number = 5000;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private aiControllers: Map<string, AIDiscussionController> = new Map();

  constructor(options: HubClientOptions) {
    this.hubUrl = options.hubUrl;
    this.token = options.token;
    this.spaceManager = options.spaceManager;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket connection with headers
        const wsUrl = new URL(this.hubUrl);
        const headers = {
          'X-Token': this.token,
          'X-Client-Type': 'client'
        };

        this.ws = new WebSocket(wsUrl.toString(), { headers });

        this.ws.on('open', () => {
          logger.info('[HubClient] WebSocket connected');
          this.isConnected = true;
          this.startPing();
          // Initialize AI controllers for existing spaces immediately
          // so silence detection works even before browser pairs
          this.initializeExistingSpaces();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message: HubMessage = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (err) {
            logger.error(`[HubClient] Failed to parse message: ${err}`);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          logger.info(`[HubClient] WebSocket closed: ${code} ${reason.toString()}`);
          this.isConnected = false;
          this.stopPing();
          this.scheduleReconnect();
        });

        this.ws.on('error', (err: Error) => {
          logger.error(`[HubClient] WebSocket error: ${err}`);
          if (!this.isConnected) {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    this.stopPing();
    // Stop all AI controllers
    this.aiControllers.forEach(controller => controller.stop());
    this.aiControllers.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(message: HubMessage): void {
    logger.info(`[HubClient] Received: ${message.type}`);

    switch (message.type) {
      case 'paired':
        logger.info('[HubClient] Paired with browser!');
        // AI controllers are already initialized on connection,
        // but ensure any new spaces are also initialized
        this.initializeExistingSpaces();
        this.sendSpaceData();
        break;

      case 'create_space':
        this.handleCreateSpace(message.payload).catch(error => {
          logger.error(`[HubClient] Error creating space: ${error}`);
          this.send({
            type: 'error',
            payload: { message: 'Failed to create space', error: String(error) }
          });
        });
        break;

      case 'get_space':
        this.sendSpaceData();
        break;

      case 'get_members':
        this.sendMembersData(message.payload?.spaceId);
        break;

      case 'get_messages':
        this.sendMessagesData(message.payload?.spaceId);
        break;

      case 'get_older_messages':
        this.sendOlderMessagesData(message.payload?.spaceId, message.payload?.beforeId);
        break;

      case 'send_message':
        this.handleUserMessage(message.payload);
        break;

      case 'delete_space':
        this.handleDeleteSpace(message.payload);
        break;

      case 'get_all_spaces':
        this.sendAllSpaces();
        break;

      case 'ping':
        this.send({ type: 'pong' });
        // Ping from hub should not reset activity timer - only actual messages should
        // This ensures silence detection works correctly even with keepalive pings
        break;

      case 'error':
        // Hub sent an error message - log it for debugging
        logger.error(`[HubClient] Received error from Hub: ${JSON.stringify(message.payload)}`);
        break;

      case 'browser_disconnected':
        logger.info('[HubClient] Browser disconnected from Hub');
        break;

      case 'client_disconnected':
        logger.info('[HubClient] Another client disconnected from Hub');
        break;

      case 'add_member':
        this.handleAddMember(message.payload);
        break;

      case 'update_member':
        this.handleUpdateMember(message.payload);
        break;

      case 'remove_member':
        this.handleRemoveMember(message.payload);
        break;

      case 'pause_space':
        this.handlePauseSpace(message.payload).catch(error => {
          logger.error(`[HubClient] Error pausing space: ${error}`);
        });
        break;

      case 'resume_space':
        this.handleResumeSpace(message.payload).catch(error => {
          logger.error(`[HubClient] Error resuming space: ${error}`);
        });
        break;

      default:
        logger.info(`[HubClient] Unknown message type: ${message.type}`);
    }
  }

  private async handleCreateSpace(payload: any): Promise<void> {
    logger.info(`[HubClient] Creating space with payload: ${JSON.stringify(payload)}`);
    const name = payload?.name || '未命名空间';
    const customMembers = payload?.members;
    logger.info(`[HubClient] Creating space "${name}" with ${customMembers?.length || 0} custom members`);

    // Set up progress callback to send real-time updates to browser
    this.spaceManager.onProgress = (message: string) => {
      this.send({
        type: 'space_creation_progress',
        payload: { message }
      });
    };

    const { space, members } = await this.spaceManager.createSpace(name, customMembers);
    logger.info(`[HubClient] Space created: ${space.id} with ${members.length} members`);

    // Clear progress callback
    this.spaceManager.onProgress = undefined;

    this.send({
      type: 'space_created',
      payload: {
        space,
        members
      }
    });

    // Create and start AI discussion controller for this space
    const controller = new AIDiscussionController(this.spaceManager, space.id);
    controller.onMessageSent = (member: Member, content: string) => {
      const message = this.spaceManager.getMessages(space.id).find(m =>
        m.senderId === member.id && m.content === content
      );
      if (message) {
        this.send({
          type: 'new_message',
          payload: { message, senderName: member.name }
        });
      }
    };
    controller.start();
    this.aiControllers.set(space.id, controller);

    // Start AI discussion after a short delay
    setTimeout(() => {
      controller.triggerDiscussion();
    }, 1000);
  }

  private async handleUserMessage(payload: any): Promise<void> {
    const { spaceId, content, attachments } = payload || {};
    if (!spaceId || !content) return;

    // Store user message with attachments if provided
    const message = await this.spaceManager.addMessage(spaceId, 'user', content, attachments);

    // Broadcast to browser
    this.send({
      type: 'new_message',
      payload: { message }
    });

    // Notify AI controller of activity
    const controller = this.aiControllers.get(spaceId);
    if (controller) {
      controller.onActivity();
      // Let AI decide who should respond
      const members = this.spaceManager.getMembers(spaceId);
      // Create a virtual member for the user (initiator)
      const userProfile = getUserProfileManager();
      const userMember: Member = {
        id: 'user',
        spaceId: spaceId,
        name: userProfile.getName(),
        soulMd: '',
        agentId: ''
      };
      controller.triggerDiscussion(userMember, content);
    }
  }

  private async handleDeleteSpace(payload: any): Promise<void> {
    const spaceId = payload?.spaceId;
    if (!spaceId) {
      this.send({
        type: 'error',
        payload: { error: 'Space ID is required' }
      });
      return;
    }

    try {
      // Stop AI controller for this space
      const controller = this.aiControllers.get(spaceId);
      if (controller) {
        controller.stop();
        this.aiControllers.delete(spaceId);
      }

      await this.spaceManager.deleteSpace(spaceId);
      this.send({
        type: 'space_deleted',
        payload: { spaceId }
      });
      // Send updated spaces list
      this.sendAllSpaces();
    } catch (error: any) {
      logger.error(`[HubClient] Failed to delete space: ${error}`);
      this.send({
        type: 'error',
        payload: { error: `Failed to delete space: ${error.message}` }
      });
    }
  }

  private async sendSpaceData(): Promise<void> {
    const space = this.spaceManager.getFirstSpace();
    this.send({
      type: 'space_data',
      payload: { space }
    });
  }

  private async sendAllSpaces(): Promise<void> {
    const spaces = this.spaceManager.getAllSpaces();
    this.send({
      type: 'all_spaces_data',
      payload: { spaces }
    });
  }

  private async sendMembersData(spaceId?: string): Promise<void> {
    if (!spaceId) return;
    const members = this.spaceManager.getMembers(spaceId);
    this.send({
      type: 'members_data',
      payload: { members }
    });
  }

  private async sendMessagesData(spaceId?: string): Promise<void> {
    if (!spaceId) return;
    const messages = this.spaceManager.getMessages(spaceId, 50);
    this.send({
      type: 'messages_data',
      payload: { messages }
    });
  }

  private async sendOlderMessagesData(spaceId?: string, beforeId?: string): Promise<void> {
    if (!spaceId || !beforeId) return;
    const messages = this.spaceManager.getMessagesBeforeId(spaceId, beforeId, 50);
    this.send({
      type: 'older_messages_data',
      payload: { messages }
    });
  }

  private async handleAddMember(payload: any): Promise<void> {
    const { spaceId, name, soulMd } = payload || {};
    if (!spaceId || !name || !soulMd) {
      this.send({
        type: 'error',
        payload: { error: 'spaceId, name, and soulMd are required' }
      });
      return;
    }

    try {
      const member = await this.spaceManager.addMember(spaceId, name, soulMd);
      this.send({
        type: 'member_added',
        payload: { member }
      });
      // Refresh members list
      this.sendMembersData(spaceId);

      // Notify AI controller of new member
      const controller = this.aiControllers.get(spaceId);
      if (controller) {
        controller.onActivity();
      }
    } catch (error: any) {
      logger.error(`[HubClient] Failed to add member: ${error}`);
      this.send({
        type: 'error',
        payload: { error: `Failed to add member: ${error.message}` }
      });
    }
  }

  private async handleUpdateMember(payload: any): Promise<void> {
    const { memberId, name, soulMd } = payload || {};
    if (!memberId || !name || !soulMd) {
      this.send({
        type: 'error',
        payload: { error: 'memberId, name, and soulMd are required' }
      });
      return;
    }

    try {
      const member = await this.spaceManager.updateMember(memberId, name, soulMd);
      this.send({
        type: 'member_updated',
        payload: { member }
      });
      // Refresh members list
      this.sendMembersData(member.spaceId);
    } catch (error: any) {
      logger.error(`[HubClient] Failed to update member: ${error}`);
      this.send({
        type: 'error',
        payload: { error: `Failed to update member: ${error.message}` }
      });
    }
  }

  private async handleRemoveMember(payload: any): Promise<void> {
    const { memberId } = payload || {};
    if (!memberId) {
      this.send({
        type: 'error',
        payload: { error: 'memberId is required' }
      });
      return;
    }

    // Get member info before deletion to know the spaceId
    const member = this.spaceManager.getMember(memberId);
    if (!member) {
      this.send({
        type: 'error',
        payload: { error: 'Member not found' }
      });
      return;
    }

    const spaceId = member.spaceId;

    try {
      await this.spaceManager.removeMember(memberId);
      this.send({
        type: 'member_removed',
        payload: { memberId }
      });
      // Refresh members list
      this.sendMembersData(spaceId);

      // Notify AI controller of member removal
      const controller = this.aiControllers.get(spaceId);
      if (controller) {
        controller.onActivity();
      }
    } catch (error: any) {
      logger.error(`[HubClient] Failed to remove member: ${error}`);
      this.send({
        type: 'error',
        payload: { error: `Failed to remove member: ${error.message}` }
      });
    }
  }

  private async handlePauseSpace(payload: any): Promise<void> {
    const { spaceId } = payload || {};
    if (!spaceId) {
      this.send({
        type: 'error',
        payload: { error: 'spaceId is required' }
      });
      return;
    }

    try {
      const success = await this.spaceManager.pauseSpace(spaceId);
      if (success) {
        const space = this.spaceManager.getSpace(spaceId);
        this.send({
          type: 'space_paused',
          payload: { spaceId, isPaused: space?.isPaused || false, pausedAt: space?.pausedAt }
        });
        // Also send updated space data
        this.sendSpaceData();
      } else {
        this.send({
          type: 'error',
          payload: { error: 'Failed to pause space' }
        });
      }
    } catch (error: any) {
      logger.error(`[HubClient] Failed to pause space: ${error}`);
      this.send({
        type: 'error',
        payload: { error: `Failed to pause space: ${error.message}` }
      });
    }
  }

  private async handleResumeSpace(payload: any): Promise<void> {
    const { spaceId } = payload || {};
    if (!spaceId) {
      this.send({
        type: 'error',
        payload: { error: 'spaceId is required' }
      });
      return;
    }

    try {
      const success = await this.spaceManager.resumeSpace(spaceId);
      if (success) {
        const space = this.spaceManager.getSpace(spaceId);
        this.send({
          type: 'space_resumed',
          payload: { spaceId, isPaused: space?.isPaused || false }
        });
        // Also send updated space data
        this.sendSpaceData();

        // Trigger activity to reset silence timer
        const controller = this.aiControllers.get(spaceId);
        if (controller) {
          controller.onActivity();
        }
      } else {
        this.send({
          type: 'error',
          payload: { error: 'Failed to resume space' }
        });
      }
    } catch (error: any) {
      logger.error(`[HubClient] Failed to resume space: ${error}`);
      this.send({
        type: 'error',
        payload: { error: `Failed to resume space: ${error.message}` }
      });
    }
  }

  private send(message: HubMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    logger.info(`[HubClient] Reconnecting in ${this.reconnectInterval}ms...`);
    setTimeout(() => {
      this.connect().catch(err => {
        logger.error(`[HubClient] Reconnect failed: ${err}`);
      });
    }, this.reconnectInterval);
  }

  private initializeExistingSpaces(): void {
    const spaces = this.spaceManager.getAllSpaces();
    logger.info(`[HubClient] Initializing ${spaces.length} existing spaces`);

    for (const space of spaces) {
      if (!this.aiControllers.has(space.id)) {
        logger.info(`[HubClient] Creating AI controller for space: ${space.id}`);
        const controller = new AIDiscussionController(this.spaceManager, space.id);
        controller.onMessageSent = (member: Member, content: string) => {
          const message = this.spaceManager.getMessages(space.id).find(m =>
            m.senderId === member.id && m.content === content
          );
          if (message) {
            this.send({
              type: 'new_message',
              payload: { message, senderName: member.name }
            });
          }
        };
        controller.start();
        this.aiControllers.set(space.id, controller);
      }
    }
  }
}
