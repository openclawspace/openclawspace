/**
 * AI Discussion Controller i18n
 * Multi-language prompts for AI discussion controller
 */

export type Language = 'zh' | 'en';

export const i18n = {
  zh: {
    // System prompts
    internalDecision: '【系统提示：这是一个内部决策，你的回答不会直接显示给用户】',

    // Host prompts
    hostDecisionPrompt: (silenceSeconds: number, recentDialogue: string, memberList: string) =>
      `【系统提示：这是一个内部决策，你的回答不会直接显示给用户】

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
- 如果讨论停滞但未完成，必须选择 wake`,

    // Wake member prompts
    wakePrompt: (silenceMinutes: number, recentDialogue: string) =>
      `主持人让你发言。

团队已经沉默了 ${silenceMinutes} 分钟。

最近的对话：
${recentDialogue}

请回应（简短，1-3句话）：`,

    // Discussion trigger prompts
    respondToMessage: (triggerMemberName: string, triggerContent: string) =>
      `${triggerMemberName} 说："${triggerContent}"

请回应（简短，1-2句话）：`,

    startNewTopic: '请开始一个话题，或者提出一个你想讨论的问题（简短）：',

    // Silence detection prompts (legacy)
    silenceDetectionPrompt: (silenceMinutes: number, recentDialogue: string, memberName: string) =>
      `【系统提示：这是一个内部决策，你的回答不会直接显示给用户】

团队已经沉默了 ${silenceMinutes} 分钟。

最近的对话：
${recentDialogue}

作为 ${memberName}，请回答以下问题（用 JSON 格式）：
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

请只输出 JSON，不要其他内容。`,

    // System messages
    taskCompleted: '任务已完成，团队自动暂停',
    systemPrefix: '【系统】',

    // Role keywords for responder selection
    roleKeywords: {
      'CEO': ['方向', '战略', '决策', '目标', '进度'],
      '产品经理': ['需求', '用户', '体验', '功能', '设计'],
      '程序员': ['技术', '代码', '实现', '架构', '性能'],
      '测试': ['测试', 'bug', '质量', '问题', '验证'],
      'Product Manager': ['requirements', 'user', 'experience', 'feature', 'design'],
      'Developer': ['technical', 'code', 'implementation', 'architecture', 'performance'],
      'QA': ['test', 'bug', 'quality', 'issue', 'verification']
    }
  },

  en: {
    // System prompts
    internalDecision: '[System Notice: This is an internal decision, your response will not be shown to the user]',

    // Host prompts
    hostDecisionPrompt: (silenceSeconds: number, recentDialogue: string, memberList: string) =>
      `[System Notice: This is an internal decision, your response will not be shown to the user]

The team has been silent for ${silenceSeconds} seconds.

Recent conversation:
${recentDialogue}

Team members:
${memberList}

As the Host, you must make a clear decision:
1. Analyze the current discussion state and each member's participation
2. Determine if the task is complete (most members have indicated completion, no pending issues)
3. If the task is not complete, choose the most appropriate member to wake up and speak

[Important] Silence over 30 seconds means the discussion has stalled. You must push forward. Choose one:
- Task is indeed complete → Announce completion
- Task is not complete → Must wake up a member

[Important] You must and can only output the following JSON format, without any other text, explanation, or markup:

Format 1 - Wake a member:
{"decision":"wake","target":"member name","reason":"brief reason"}

Format 2 - Task complete:
{"decision":"complete","reason":"reason why task is complete"}

Examples:
{"decision":"wake","target":"Alice","reason":"Need research on user requirements"}
{"decision":"complete","reason":"All members have delivered their work"}

Notes:
- Output JSON only, no other content
- decision must be either "wake" or "complete", no "none" allowed
- target is only required when decision=wake
- If discussion is stalled but not complete, must choose wake`,

    // Wake member prompts
    wakePrompt: (silenceMinutes: number, recentDialogue: string) =>
      `The Host has asked you to speak.

The team has been silent for ${silenceMinutes} minutes.

Recent conversation:
${recentDialogue}

Please respond (briefly, 1-3 sentences):`,

    // Discussion trigger prompts
    respondToMessage: (triggerMemberName: string, triggerContent: string) =>
      `${triggerMemberName} said: "${triggerContent}"

Please respond (briefly, 1-2 sentences):`,

    startNewTopic: 'Please start a topic or ask a question you want to discuss (briefly):',

    // Silence detection prompts (legacy)
    silenceDetectionPrompt: (silenceMinutes: number, recentDialogue: string, memberName: string) =>
      `[System Notice: This is an internal decision, your response will not be shown to the user]

The team has been silent for ${silenceMinutes} minutes.

Recent conversation:
${recentDialogue}

As ${memberName}, please answer the following (in JSON format):
{
  "wantsToSpeak": true/false,  // Do you want to speak?
  "reason": "Why or why not",
  "whatToSay": "If speaking, what would you say (1-3 sentences)",
  "urgency": 1-10  // Urgency level, 10 being most urgent
}

Important reminders:
1. This is an execution scenario; team members may be working (writing docs, researching, coding, etc.)
2. But if the team is silent for over 1 minute, someone may be waiting for others' output and needs to ask about progress
3. If you're waiting for others' output, proactively ask about progress instead of continuing to wait silently
4. If you're executing tasks, briefly report current progress and estimated completion time so the team knows you're moving forward
5. As a team member, you have responsibility to ensure smooth workflow, not let tasks get stuck with no one following up

Please output JSON only, no other content.`,

    // System messages
    taskCompleted: 'Task completed, team auto-paused',
    systemPrefix: '[System]',

    // Role keywords for responder selection
    roleKeywords: {
      'CEO': ['direction', 'strategy', 'decision', 'goal', 'progress'],
      'Product Manager': ['requirements', 'user', 'experience', 'feature', 'design'],
      'Developer': ['technical', 'code', 'implementation', 'architecture', 'performance'],
      'QA': ['test', 'bug', 'quality', 'issue', 'verification'],
      'Programmer': ['technical', 'code', 'implementation', 'architecture', 'performance'],
      'Tester': ['test', 'bug', 'quality', 'issue', 'verification']
    }
  }
};

export function getPrompts(language: string): typeof i18n.zh | typeof i18n.en {
  return i18n[language as Language] || i18n.zh;
}
