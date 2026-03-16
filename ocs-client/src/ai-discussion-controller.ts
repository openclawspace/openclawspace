import { SpaceManager } from './space-manager.js';
import { Member, Message, Attachment } from './database.js';
import { getLogger } from './logger.js';
import { getUserProfileManager } from './user-profile.js';

const logger = getLogger();

interface DiscussionContext {
  recentMessages: Message[];
  allMembers: Member[];
  silenceDuration: number;
  lastSpeakerId: string | null;
  topic?: string;
}

interface HostDecision {
  action: 'wake_member' | 'task_complete';
  targetMemberName?: string;
  reason?: string;
}

/**
 * AI 讨论控制器
 * 让 AI 像真人团队一样自然协作，有主动性、有记忆、有个性
 *
 * 主持人系统：
 * - 每个团队有一个内置的主持人成员
 * - 沉默检测时只询问主持人
 * - 主持人决定唤醒哪个成员或宣布任务完成
 */
export class AIDiscussionController {
  private spaceManager: SpaceManager;
  private spaceId: string;
  private lastActivityTime: number = Date.now();
  private silenceCheckInterval: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  // 沉默检测阈值（毫秒）
  private readonly SILENCE_THRESHOLD = 30 * 1000; // 30秒
  private readonly CHECK_INTERVAL = 10 * 1000; // 每10秒检查一次

  constructor(spaceManager: SpaceManager, spaceId: string) {
    this.spaceManager = spaceManager;
    this.spaceId = spaceId;
  }

  /**
   * 开始监控讨论
   */
  start(): void {
    this.stop(); // 确保不会重复启动
    this.silenceCheckInterval = setInterval(() => {
      this.checkSilence();
    }, this.CHECK_INTERVAL);
    logger.info(`[AIController] Started for space: ${this.spaceId}`);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
      logger.info(`[AIController] Stopped for space: ${this.spaceId}`);
    }
  }

  /**
   * 更新活动时间（当有新消息时调用）
   */
  onActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * 检查是否沉默过久，需要有人主动发言
   */
  private async checkSilence(): Promise<void> {
    // 检查空间是否暂停
    try {
      const space = this.spaceManager.getSpace(this.spaceId);
      logger.info(`[AIController] Check pause state: spaceId=${this.spaceId}, isPaused=${space?.isPaused}`);
      if (space?.isPaused) {
        logger.info(`[AIController] Space ${this.spaceId} is paused, stopping silence detection`);
        this.stop(); // 完全停止检测，直到空间恢复
        return;
      }
    } catch (error) {
      logger.error(`[AIController] Failed to check space pause state: ${error}`);
      // 继续执行，不因为检查失败而停止
    }

    const silenceDuration = Date.now() - this.lastActivityTime;

    logger.info(`[AIController] Check silence: isProcessing=${this.isProcessing}, silenceDuration=${Math.floor(silenceDuration / 1000)}s, threshold=${Math.floor(this.SILENCE_THRESHOLD / 1000)}s`);

    if (this.isProcessing) {
      logger.info('[AIController] Skipping check - already processing');
      return;
    }

    if (silenceDuration < this.SILENCE_THRESHOLD) {
      logger.info('[AIController] Silence duration below threshold, skipping');
      return;
    }

    logger.info(`[AIController] Silence detected: ${silenceDuration}ms`);
    await this.handleSilence(silenceDuration);
  }

  /**
   * 处理沉默情况 - 询问主持人决定下一步行动
   */
  private async handleSilence(silenceDuration: number): Promise<void> {
    // 使用原子操作检查并设置 isProcessing，防止并发问题
    if (this.isProcessing) {
      logger.info('[AIController] Already processing, skipping');
      return;
    }
    this.isProcessing = true;
    logger.info('[AIController] Starting handleSilence, isProcessing = true');

    try {
      const members = this.spaceManager.getMembers(this.spaceId);
      logger.info(`[AIController] Members count: ${members.length}`);

      if (members.length === 0) {
        logger.info('[AIController] No members in space, skipping');
        return;
      }

      // 查找主持人（使用 role 字段）
      const host = members.find(m => m.role === 'host');
      if (!host) {
        logger.warn('[AIController] No host found in space, falling back to old behavior');
        await this.handleSilenceLegacy(silenceDuration, members);
        return;
      }

      const messages = this.spaceManager.getMessages(this.spaceId, 20);

      const context: DiscussionContext = {
        recentMessages: messages,
        allMembers: members,
        silenceDuration,
        lastSpeakerId: messages.length > 0 ? messages[messages.length - 1].senderId : null,
        topic: this.extractTopic(messages)
      };

      // 只询问主持人
      logger.info(`[AIController] Asking host ${host.name} for decision`);
      const decision = await this.askHostForDecision(host, context);
      logger.info(`[AIController] Host decision: ${decision.action}`);

      if (decision.action === 'task_complete') {
        // 任务完成，暂停空间
        logger.info('[AIController] Host decided task is complete, pausing space');
        await this.pauseSpace('任务已完成，团队自动暂停');
      } else if (decision.action === 'wake_member') {
        // 唤醒指定成员，如果没有指定则随机选择
        let targetMember: Member | undefined;

        if (decision.targetMemberName) {
          targetMember = members.find(m =>
            m.name.includes(decision.targetMemberName!) ||
            decision.targetMemberName!.includes(m.name)
          );
        }

        // 如果没有找到指定成员，随机选择一个非主持人成员
        if (!targetMember) {
          const regularMembers = members.filter(m => m.role !== 'host');
          const candidates = regularMembers.length > 0 ? regularMembers : members;
          targetMember = candidates[Math.floor(Math.random() * candidates.length)];
          logger.info(`[AIController] Host did not specify valid target, randomly selected: ${targetMember.name}`);
        }

        if (targetMember) {
          logger.info(`[AIController] Host decided to wake up ${targetMember.name}`);
          await this.wakeMember(targetMember, context);
        }
      }

    } catch (error) {
      logger.error(`[AIController] Error in handleSilence: ${error}`);
    } finally {
      this.isProcessing = false;
      logger.info('[AIController] handleSilence complete, isProcessing = false');
    }
  }

  /**
   * 询问主持人决定下一步行动
   */
  private async askHostForDecision(host: Member, context: DiscussionContext): Promise<HostDecision> {
    try {
      const prompt = this.buildHostPrompt(host, context);
      const { text: response } = await this.spaceManager.sendMessageToMemberIfNotPaused(host.id, prompt);

      // Debug: log the raw response from Host
      logger.info(`[AIController] Host raw response: "${response}"`);

      const decision = this.parseHostResponse(response);
      logger.info(`[AIController] Parsed decision: ${JSON.stringify(decision)}`);

      return decision;
    } catch (err) {
      logger.error(`[AIController] Failed to ask host ${host.name}: ${err}`);
      // 错误时默认唤醒一个成员
      return { action: 'wake_member' };
    }
  }

  /**
   * 构建询问主持人的 prompt
   */
  private buildHostPrompt(host: Member, context: DiscussionContext): string {
    const silenceMinutes = Math.floor(context.silenceDuration / 60000);
    const recentDialogue = this.formatRecentMessages(context.recentMessages, 15);
    const memberList = context.allMembers
      .filter(m => m.id !== host.id)
      .map(m => `- ${m.name}`)
      .join('\n');

    const silenceSeconds = Math.floor(context.silenceDuration / 1000);

    return `【系统提示：这是一个内部决策，你的回答不会直接显示给用户】

团队已经沉默了 ${silenceSeconds} 秒。

最近的对话：
${recentDialogue}

团队成员：
${memberList}

作为主持人，你必须做出明确决策：
1. 分析当前讨论状态和每个成员的参与情况
2. 判断任务是否已经完成（多数成员反复表示完成、没有遗留问题）
3. 如果任务未完成，选择最合适的成员唤醒发言

【重要】沉默超过30秒说明讨论已停滞，你必须推动进展。只能二选一：
- 任务确实完成 → 宣布完成
- 任务未完成 → 必须唤醒一个成员

【重要】你必须且只能输出以下 JSON 格式，不要添加任何其他文字、解释或标记：

格式1 - 唤醒成员：
{"decision":"wake","target":"成员名","reason":"简短理由"}

格式2 - 任务完成：
{"decision":"complete","reason":"任务已完成的理由"}

示例：
{"decision":"wake","target":"徐霞客","reason":"需要研究员调研资料"}
{"decision":"complete","reason":"所有成员已交付成果"}

注意：
- 只输出 JSON，不要有任何其他内容
- decision 必须是 wake 或 complete 之一，不允许 none
- target 只在 decision=wake 时提供
- 如果讨论停滞但未完成，必须选择 wake`;
  }

  /**
   * 解析主持人的响应（JSON 格式）
   */
  private parseHostResponse(response: string): HostDecision {
    const trimmed = response.trim();

    // 尝试解析 JSON
    try {
      // 尝试提取 JSON 块（Agent 可能会输出一些额外文本）
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(`[AIController] Host response is not valid JSON: ${trimmed.substring(0, 100)}`);
        // 没有 JSON 时默认唤醒一个成员
        return { action: 'wake_member', targetMemberName: undefined };
      }

      const json = JSON.parse(jsonMatch[0]);

      // 验证必需字段
      if (!json.decision) {
        logger.warn(`[AIController] Host JSON missing 'decision' field: ${jsonMatch[0]}`);
        // 缺少 decision 字段时默认唤醒一个成员
        return { action: 'wake_member', targetMemberName: undefined };
      }

      // 处理不同的决策类型
      switch (json.decision) {
        case 'complete':
          logger.info(`[AIController] Host decided task complete: ${json.reason || 'no reason'}`);
          return { action: 'task_complete' };

        case 'wake':
          if (!json.target) {
            logger.warn(`[AIController] Host JSON missing 'target' for wake decision: ${jsonMatch[0]}`);
            // 没有指定目标时，返回一个特殊的 wake 决定，让调用者选择一个默认成员
            return { action: 'wake_member', targetMemberName: undefined };
          }
          logger.info(`[AIController] Host decided to wake: ${json.target}, reason: ${json.reason || 'no reason'}`);
          return {
            action: 'wake_member',
            targetMemberName: json.target
          };

        default:
          logger.warn(`[AIController] Host JSON unknown decision type: ${json.decision}, will default to wake`);
          // 对于无效的决策类型，默认唤醒一个成员
          return { action: 'wake_member', targetMemberName: undefined };
      }
    } catch (e) {
      // JSON 解析失败，记录日志并默认唤醒一个成员
      logger.error(`[AIController] Failed to parse Host response as JSON: ${e}`);
      logger.error(`[AIController] Raw response: ${trimmed.substring(0, 200)}`);
      // 解析失败时默认唤醒一个成员，而不是 no_action
      return { action: 'wake_member', targetMemberName: undefined };
    }
  }

  /**
   * 唤醒指定成员发言
   */
  private async wakeMember(member: Member, context: DiscussionContext): Promise<void> {
    const silenceMinutes = Math.floor(context.silenceDuration / 60000);
    const recentDialogue = this.formatRecentMessages(context.recentMessages, 10);

    const prompt = `主持人让你发言。

团队已经沉默了 ${silenceMinutes} 分钟。

最近的对话：
${recentDialogue}

请回应（简短，1-3句话）：`;

    try {
      // Create initial empty message for streaming and broadcast immediately
      logger.info(`[AIController] Creating empty message for ${member.name}`);
      let message = await this.sendMessage(member, '');
      logger.info(`[AIController] Created message ${message.id} for ${member.name}`);
      // Broadcast message_start immediately so frontend can show it
      this.onMessageUpdate?.(member, message.id, '', true);
      let fullContent = '';

      logger.info(`[AIController] Sending wake prompt to ${member.name}: "${prompt.substring(0, 200)}..."`);

      let { text: response, attachments } = await this.spaceManager.sendMessageToMemberIfNotPaused(
        member.id,
        prompt,
        (cumulativeContent) => {
          // Stream callback - Gateway delta events contain the complete message so far
          logger.info(`[AIController] Stream delta for ${member.name}: "${cumulativeContent.substring(0, 100)}..."`);
          fullContent = cumulativeContent;
          this.spaceManager.updateMessage(message.id, fullContent).catch(err => {
            logger.error(`[AIController] Failed to update message: ${err}`);
          });
          // Notify HubClient to broadcast message_update (streaming)
          this.onMessageUpdate?.(member, message.id, fullContent, true);
        },
        message.id // Pass messageId for tool status tracking
      );

      // Final update with complete content (only update if no attachments)
      if (!attachments || attachments.length === 0) {
        if (fullContent !== response) {
          await this.spaceManager.updateMessage(message.id, response);
        }
        logger.info(`[AIController] Got response from ${member.name}: "${response.substring(0, 100)}..."`);
        // Broadcast the final message_update (completed)
        this.onMessageUpdate?.(member, message.id, response, false);
      } else {
        // If there are attachments, delete the streaming message and create a new one with attachments
        await this.spaceManager.deleteMessage(message.id);
        const finalMessage = await this.sendMessage(member, response, attachments);
        logger.info(`[AIController] Got response with attachments from ${member.name}: "${response.substring(0, 100)}..."`);
        // Broadcast message_update for the new message with attachments
        this.onMessageUpdate?.(member, finalMessage.id, response, false, attachments);
      }
    } catch (err) {
      logger.error(`[AIController] Failed to wake member ${member.name}: ${err}`);
    }
  }

  /**
   * 暂停空间
   */
  private async pauseSpace(reason: string): Promise<void> {
    try {
      logger.info(`[AIController] Pausing space ${this.spaceId}, reason: ${reason}`);

      // 添加系统消息说明暂停原因
      await this.spaceManager.addMessage(this.spaceId, 'system', `【系统】${reason}`);
      logger.info(`[AIController] System message added for pause`);

      // 暂停空间
      const pauseResult = await this.spaceManager.pauseSpace(this.spaceId);
      logger.info(`[AIController] pauseSpace result: ${pauseResult}`);

      // 验证暂停状态
      const spaceAfterPause = this.spaceManager.getSpace(this.spaceId);
      logger.info(`[AIController] Space state after pause: isPaused=${spaceAfterPause?.isPaused}`);

      // 立即停止沉默检测
      if (spaceAfterPause?.isPaused) {
        logger.info(`[AIController] Stopping silence detection after pause`);
        this.stop();
      }

      // 触发暂停事件
      this.onSpacePaused?.(reason);
    } catch (err) {
      logger.error(`[AIController] Failed to pause space: ${err}`);
    }
  }

  /**
   * 空间暂停回调
   */
  onSpacePaused?: (reason: string) => void;

  /**
   * 旧的沉默处理方式（兼容模式，当没有主持人时）
   */
  private async handleSilenceLegacy(silenceDuration: number, members: Member[]): Promise<void> {
    logger.info('[AIController] Using legacy silence handling');

    const messages = this.spaceManager.getMessages(this.spaceId, 20);
    const lastSpeakerId = messages.length > 0 ? messages[messages.length - 1].senderId : null;

    const context: DiscussionContext = {
      recentMessages: messages,
      allMembers: members,
      silenceDuration,
      lastSpeakerId,
      topic: this.extractTopic(messages)
    };

    // 并行询问所有成员（旧行为）
    const intentions = await this.gatherIntentions(context);
    const willing = intentions.filter(i => i.wantsToSpeak);

    if (willing.length === 0) {
      logger.info('[AIController] No one wants to speak (legacy mode)');
      return;
    }

    willing.sort((a, b) => b.urgency - a.urgency);

    for (let i = 0; i < willing.length; i++) {
      const speaker = willing[i];
      logger.info(`[AIController] ${speaker.member.name} speaking (legacy mode)`);
      await this.sendMessage(speaker.member, speaker.whatToSay);

      if (i < willing.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  /**
   * 收集所有 AI 的发言意愿（兼容模式）
   */
  private async gatherIntentions(context: DiscussionContext): Promise<Array<{member: Member, wantsToSpeak: boolean, reason: string, whatToSay: string, urgency: number}>> {
    const promises = context.allMembers.map(async (member) => {
      try {
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error(`${member.name} timeout`)), 45000);
        });

        const intention = await Promise.race([
          this.askForIntentionLegacy(member, context),
          timeoutPromise
        ]);

        return intention;
      } catch (err) {
        logger.error(`[AIController] Failed to get intention from ${member.name}: ${err}`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((i): i is NonNullable<typeof results[0]> => i !== null);
  }

  /**
   * 询问某个 AI 是否想发言（兼容模式）
   */
  private async askForIntentionLegacy(member: Member, context: DiscussionContext): Promise<{member: Member, wantsToSpeak: boolean, reason: string, whatToSay: string, urgency: number} | null> {
    try {
      const silenceMinutes = Math.floor(context.silenceDuration / 60000);
      const recentDialogue = this.formatRecentMessages(context.recentMessages, 10);

      const prompt = `【系统提示：这是一个内部决策，你的回答不会直接显示给用户】

团队已经沉默了 ${silenceMinutes} 分钟。

最近的对话：
${recentDialogue}

作为 ${member.name}，请回答以下问题（用 JSON 格式）：
{
  "wantsToSpeak": true/false,  // 你想发言吗？
  "reason": "为什么想或不想",
  "whatToSay": "如果发言，你想说什么（1-3句话）",
  "urgency": 1-10  // 发言的紧迫程度，10为最紧迫
}

重要提醒：
1. 这是执行场景，团队成员可能正在实际工作（写文档、查资料、写代码等）
2. 但如果团队沉默超过1分钟，说明可能有人在等待别人的工作成果，需要主动询问进度
3. 如果你正在等待别人的产出，应该主动追问进展，而不是继续沉默等待
4. 如果你正在执行任务，应该简要汇报当前进度和预计完成时间，让团队知道你在推进
5. 作为团队成员，你有责任确保工作流转顺畅，而不是让任务卡在某人手中无人过问

请只输出 JSON，不要其他内容。`;

      const { text: response } = await this.spaceManager.sendMessageToMemberIfNotPaused(member.id, prompt);

      // 解析响应
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      return {
        member,
        wantsToSpeak: data.wantsToSpeak === true,
        reason: data.reason || '',
        whatToSay: data.whatToSay || '',
        urgency: Math.min(10, Math.max(1, parseInt(data.urgency) || 5))
      };
    } catch (err) {
      logger.error(`[AIController] Failed to ask ${member.name}: ${err}`);
      return null;
    }
  }

  /**
   * 发送消息
   */
  private async sendMessage(member: Member, content: string, attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[]): Promise<Message> {
    logger.info(`[AIController] sendMessage called for ${member.name}: "${content.substring(0, 50)}..."`);
    try {
      const message = await this.spaceManager.addMessage(this.spaceId, member.id, content, attachments);
      logger.info(`[AIController] Message saved to DB: ${message.id}`);
      this.onActivity();
      // Note: Broadcasting is now handled by the caller (wakeMember, initiateDiscussion, etc.)
      // via onMessageUpdate callback
      return message;
    } catch (err) {
      logger.error(`[AIController] Failed to send message from ${member.name}: ${err}`);
      throw err;
    }
  }

  /**
   * 消息更新回调（由 HubClient 设置）
   * 统一处理消息创建、流式更新和完成
   */
  onMessageUpdate?: (member: Member, messageId: string, content: string, isStreaming: boolean, attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[]) => void;

  /**
   * 格式化最近的消息
   */
  private formatRecentMessages(messages: Message[], limit: number): string {
    const recent = messages.slice(-limit);
    const userProfile = getUserProfileManager();
    const userName = userProfile.getName();

    const members = this.spaceManager.getMembers(this.spaceId);
    const memberNameMap = new Map<string, string>();
    for (const member of members) {
      memberNameMap.set(member.id, member.name);
    }

    return recent.map(m => {
      let sender: string;
      if (m.senderId === 'user') {
        sender = userName;
      } else if (m.senderId === 'system') {
        sender = '系统';
      } else {
        sender = memberNameMap.get(m.senderId) || m.senderId;
      }
      return `${sender}: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`;
    }).join('\n');
  }

  /**
   * 提取当前话题
   */
  private extractTopic(messages: Message[]): string | undefined {
    if (messages.length === 0) return undefined;
    const lastMessage = messages[messages.length - 1];
    return lastMessage.content.substring(0, 50);
  }

  /**
   * 触发一次讨论（当用户创建空间或发送消息时）
   */
  async triggerDiscussion(triggerMember?: Member, triggerContent?: string): Promise<void> {
    try {
      const space = this.spaceManager.getSpace(this.spaceId);
      if (space?.isPaused) {
        logger.info(`[AIController] Space ${this.spaceId} is paused, skipping discussion trigger`);
        return;
      }
    } catch (error) {
      logger.error(`[AIController] Failed to check space pause state: ${error}`);
    }

    this.onActivity();

    const members = this.spaceManager.getMembers(this.spaceId);
    if (members.length === 0) return;

    // 排除主持人（主持人不主动发言）
    const regularMembers = members.filter(m => m.role !== 'host');

    const candidates = regularMembers.length > 0 ? regularMembers : members;

    if (triggerMember && triggerContent) {
      const responder = await this.selectRelevantResponder(candidates, triggerMember, triggerContent);
      if (responder) {
        try {
          const prompt = `${triggerMember.name} 说："${triggerContent}"

请回应（简短，1-2句话）：`;
          // Create initial empty message for streaming and broadcast immediately
          let message = await this.sendMessage(responder, '');
          // Broadcast message_start immediately
          this.onMessageUpdate?.(responder, message.id, '', true);
          let fullContent = '';

          const { text: response, attachments } = await this.spaceManager.sendMessageToMemberIfNotPaused(
            responder.id,
            prompt,
            (cumulativeContent) => {
              fullContent = cumulativeContent;
              this.spaceManager.updateMessage(message.id, fullContent).catch(err => {
                logger.error(`[AIController] Failed to update message: ${err}`);
              });
              // Broadcast message_update (streaming)
              this.onMessageUpdate?.(responder, message.id, fullContent, true);
            },
            message.id // Pass messageId for tool status tracking
          );

          // Final update
          if (fullContent !== response) {
            await this.spaceManager.updateMessage(message.id, response);
          }

          // Broadcast the final message_update (completed)
          if (!attachments || attachments.length === 0) {
            this.onMessageUpdate?.(responder, message.id, response, false);
          } else {
            const finalMessage = await this.sendMessage(responder, response, attachments);
            // Broadcast message_update with attachments
            this.onMessageUpdate?.(responder, finalMessage.id, response, false, attachments);
          }
        } catch (err) {
          logger.error(`[AIController] Failed to get response from ${responder.name}: ${err}`);
        }
      }
    } else {
      const starter = candidates[Math.floor(Math.random() * candidates.length)];
      try {
        const prompt = '请开始一个话题，或者提出一个你想讨论的问题（简短）：';
        // Create initial empty message for streaming and broadcast immediately
        let message = await this.sendMessage(starter, '');
        // Broadcast message_start immediately
        this.onMessageUpdate?.(starter, message.id, '', true);
        let fullContent = '';

        const { text: response, attachments } = await this.spaceManager.sendMessageToMemberIfNotPaused(
          starter.id,
          prompt,
          (cumulativeContent) => {
            fullContent = cumulativeContent;
            this.spaceManager.updateMessage(message.id, fullContent).catch(err => {
              logger.error(`[AIController] Failed to update message: ${err}`);
            });
            // Broadcast message_update (streaming)
            this.onMessageUpdate?.(starter, message.id, fullContent, true);
          },
          message.id // Pass messageId for tool status tracking
        );

        // Final update
        if (fullContent !== response) {
          await this.spaceManager.updateMessage(message.id, response);
        }

        // Broadcast the final message_update (completed)
        if (!attachments || attachments.length === 0) {
          this.onMessageUpdate?.(starter, message.id, response, false);
        } else {
          const finalMessage = await this.sendMessage(starter, response, attachments);
          // Broadcast message_update with attachments
          this.onMessageUpdate?.(starter, finalMessage.id, response, false, attachments);
        }
      } catch (err) {
        logger.error(`[AIController] Failed to get response from ${starter.name}: ${err}`);
      }
    }
  }

  /**
   * 选择最相关的回应者
   */
  private async selectRelevantResponder(
    members: Member[],
    triggerMember: Member,
    content: string
  ): Promise<Member | null> {
    const candidates = members.filter(m => m.id !== triggerMember.id);
    if (candidates.length === 0) return null;

    const contentLower = content.toLowerCase();

    const interestMap: Record<string, string[]> = {
      'CEO': ['方向', '战略', '决策', '目标', '进度'],
      '产品经理': ['需求', '用户', '体验', '功能', '设计'],
      '程序员': ['技术', '代码', '实现', '架构', '性能'],
      '测试': ['测试', 'bug', '质量', '问题', '验证']
    };

    const scored = candidates.map(m => {
      let score = 0;
      for (const [role, keywords] of Object.entries(interestMap)) {
        if (m.name.includes(role)) {
          for (const keyword of keywords) {
            if (contentLower.includes(keyword)) score += 2;
          }
        }
      }
      return { member: m, score };
    });

    scored.sort((a, b) => b.score - a.score);

    if (scored[0].score > 0) {
      return scored[0].member;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
