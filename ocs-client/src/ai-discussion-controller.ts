import { SpaceManager } from './space-manager.js';
import { Member, Message } from './database.js';
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

interface SpeakIntention {
  member: Member;
  wantsToSpeak: boolean;
  reason: string;
  whatToSay: string;
  urgency: number; // 1-10，发言的紧迫程度
}

/**
 * AI 讨论控制器
 * 让 AI 像真人团队一样自然协作，有主动性、有记忆、有个性
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
      if (space?.isPaused) {
        logger.info(`[AIController] Space ${this.spaceId} is paused, skipping silence check`);
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
   * 处理沉默情况 - 让 AI 自主决定是否发言
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

      const messages = this.spaceManager.getMessages(this.spaceId, 20);
      const lastSpeakerId = messages.length > 0 ? messages[messages.length - 1].senderId : null;

      const context: DiscussionContext = {
        recentMessages: messages,
        allMembers: members,
        silenceDuration,
        lastSpeakerId,
        topic: this.extractTopic(messages)
      };

      // 并行询问所有 AI：你想发言吗？
      logger.info(`[AIController] Gathering intentions from ${members.length} members`);
      const intentions = await this.gatherIntentions(context);
      logger.info(`[AIController] Intentions gathered: ${intentions.length}`);

      // 过滤出想发言的 AI
      const willing = intentions.filter(i => i.wantsToSpeak);

      if (willing.length === 0) {
        logger.info('[AIController] No one wants to speak. Summary of choices:');
        intentions.forEach(i => {
          logger.info(`[AIController]   - ${i.member.name}: ${i.reason}`);
        });
        return;
      }

      // 按紧迫程度排序
      willing.sort((a, b) => b.urgency - a.urgency);

      // 让所有想发言的 AI 依次发言（按紧迫程度排序）
      logger.info(`[AIController] ${willing.length} members want to speak, processing in order of urgency`);

      for (let i = 0; i < willing.length; i++) {
        const speaker = willing[i];
        logger.info(`[AIController] ${speaker.member.name} speaking (${i + 1}/${willing.length}), urgency: ${speaker.urgency}`);

        // 发送消息
        await this.sendMessage(speaker.member, speaker.whatToSay);

        // 如果不是最后一个，等待一段时间再让下一个发言（模拟自然对话间隔）
        if (i < willing.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
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
   * 收集所有 AI 的发言意愿
   */
  private async gatherIntentions(context: DiscussionContext): Promise<SpeakIntention[]> {
    // 为每个成员设置单独的超时，防止一个成员卡住阻塞其他成员
    const promises = context.allMembers.map(async (member) => {
      try {
        // 每个成员最多等待 45 秒
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error(`${member.name} timeout`)), 45000);
        });
        const intention = await Promise.race([
          this.askForIntention(member, context),
          timeoutPromise
        ]);

        // 记录每个机器人的选择及原因
        if (intention) {
          if (intention.wantsToSpeak) {
            logger.info(`[AIController] ${member.name} wants to speak (urgency: ${intention.urgency}): ${intention.reason}`);
          } else {
            logger.info(`[AIController] ${member.name} chooses NOT to speak: ${intention.reason}`);
          }
        }

        return intention;
      } catch (err) {
        logger.error(`[AIController] Failed to get intention from ${member.name}: ${err}`);
        return null;
      }
    });

    // 等待所有成员完成（无论成功失败）
    const results = await Promise.all(promises);
    return results.filter((i): i is SpeakIntention => i !== null);
  }

  /**
   * 询问某个 AI 是否想发言
   */
  private async askForIntention(member: Member, context: DiscussionContext): Promise<SpeakIntention | null> {
    try {
      const prompt = this.buildIntentionPrompt(member, context);
      const response = await this.spaceManager.sendMessageToMemberIfNotPaused(member.id, prompt);

      return this.parseIntentionResponse(member, response);
    } catch (err) {
      logger.error(`[AIController] Failed to ask ${member.name}: ${err}`);
      return null;
    }
  }

  /**
   * 构建询问意愿的 prompt
   */
  private buildIntentionPrompt(member: Member, context: DiscussionContext): string {
    const silenceMinutes = Math.floor(context.silenceDuration / 60000);
    const recentDialogue = this.formatRecentMessages(context.recentMessages, 10);

    return `【系统提示：这是一个内部决策，你的回答不会直接显示给用户】

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
  }

  /**
   * 解析 AI 的意愿回复
   */
  private parseIntentionResponse(member: Member, response: string): SpeakIntention {
    try {
      // 尝试提取 JSON
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
      logger.error(`[AIController] Failed to parse intention: ${err}`);
      // 默认不想发言
      return {
        member,
        wantsToSpeak: false,
        reason: '解析失败',
        whatToSay: '',
        urgency: 1
      };
    }
  }

  /**
   * 发送消息
   */
  private async sendMessage(member: Member, content: string): Promise<void> {
    // 这里需要通过回调或事件通知 HubClient 发送消息
    // 暂时通过添加消息到数据库并触发事件
    this.spaceManager.addMessage(this.spaceId, member.id, content);
    this.onActivity();

    // 触发消息事件（HubClient 需要监听这个）
    this.onMessageSent?.(member, content);
  }

  /**
   * 消息发送回调（由 HubClient 设置）
   */
  onMessageSent?: (member: Member, content: string) => void;

  /**
   * 格式化最近的消息
   */
  private formatRecentMessages(messages: Message[], limit: number): string {
    const recent = messages.slice(-limit);
    const userProfile = getUserProfileManager();
    const userName = userProfile.getName();

    // 获取所有成员，建立ID到名称的映射
    const members = this.spaceManager.getMembers(this.spaceId);
    const memberNameMap = new Map<string, string>();
    for (const member of members) {
      memberNameMap.set(member.id, member.name);
    }

    return recent.map(m => {
      let sender: string;
      if (m.senderId === 'user') {
        sender = userName;
      } else {
        // 使用成员名称而不是ID
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

    // 简单实现：取最后一条消息的关键词
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content;

    // 提取前 50 个字符作为话题
    return content.substring(0, 50);
  }

  /**
   * 触发一次讨论（当用户创建空间或发送消息时）
   */
  async triggerDiscussion(triggerMember?: Member, triggerContent?: string): Promise<void> {
    // 检查空间是否暂停
    try {
      const space = this.spaceManager.getSpace(this.spaceId);
      if (space?.isPaused) {
        logger.info(`[AIController] Space ${this.spaceId} is paused, skipping discussion trigger`);
        return;
      }
    } catch (error) {
      logger.error(`[AIController] Failed to check space pause state: ${error}`);
      // 继续执行，不因为检查失败而停止
    }

    this.onActivity();

    const members = this.spaceManager.getMembers(this.spaceId);
    if (members.length === 0) return;

    // 如果有触发者，让其他人回应
    if (triggerMember && triggerContent) {
      // 找到最相关的成员回应
      const responder = await this.selectRelevantResponder(members, triggerMember, triggerContent);
      if (responder) {
        const prompt = `${triggerMember.name} 说："${triggerContent}"

请回应（简短，1-2句话）：`;
        const response = await this.spaceManager.sendMessageToMemberIfNotPaused(responder.id, prompt);
        await this.sendMessage(responder, response);
      }
    } else {
      // 初始讨论，随机选一个成员开场
      const starter = members[Math.floor(Math.random() * members.length)];
      const prompt = '请开始一个话题，或者提出一个你想讨论的问题（简短）：';
      const response = await this.spaceManager.sendMessageToMemberIfNotPaused(starter.id, prompt);
      await this.sendMessage(starter, response);
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
    // 排除触发者自己
    const candidates = members.filter(m => m.id !== triggerMember.id);
    if (candidates.length === 0) return null;

    // 简单策略：基于关键词匹配
    const contentLower = content.toLowerCase();

    // 定义每个角色的兴趣关键词
    const interestMap: Record<string, string[]> = {
      'CEO': ['方向', '战略', '决策', '目标', '进度'],
      '产品经理': ['需求', '用户', '体验', '功能', '设计'],
      '程序员': ['技术', '代码', '实现', '架构', '性能'],
      '测试': ['测试', 'bug', '质量', '问题', '验证']
    };

    // 计算每个候选人的相关性得分
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

    // 如果有高相关性的，选第一个；否则随机
    if (scored[0].score > 0) {
      return scored[0].member;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
