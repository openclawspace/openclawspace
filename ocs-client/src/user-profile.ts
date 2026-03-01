import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * User Profile - 用户配置文件
 * 真人在所有空间中的身份定义
 */
export interface UserProfile {
  name: string;        // 显示名称，默认为"发起人"
  title: string;       // 头衔/角色描述
  description: string; // 详细描述
}

const DEFAULT_PROFILE: UserProfile = {
  name: '发起人',
  title: '项目发起人',
  description: '团队的最高决策者，所有 AI 成员都为你服务。'
};

const PROFILE_FILE = 'user-profile.json';

export class UserProfileManager {
  private profilePath: string;
  private profile: UserProfile;

  constructor(dataDir?: string) {
    const dir = dataDir || path.join(os.homedir(), '.ocs-client');
    this.profilePath = path.join(dir, PROFILE_FILE);
    this.profile = this.loadProfile();
  }

  private loadProfile(): UserProfile {
    try {
      if (fs.existsSync(this.profilePath)) {
        const data = fs.readFileSync(this.profilePath, 'utf-8');
        return { ...DEFAULT_PROFILE, ...JSON.parse(data) };
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
    return { ...DEFAULT_PROFILE };
  }

  saveProfile(profile: Partial<UserProfile>): void {
    this.profile = { ...this.profile, ...profile };
    try {
      fs.writeFileSync(this.profilePath, JSON.stringify(this.profile, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save user profile:', err);
    }
  }

  getProfile(): UserProfile {
    return { ...this.profile };
  }

  getName(): string {
    return this.profile.name;
  }

  /**
   * 生成 AI 的 soulMd 前缀，包含对发起人的认知
   */
  generateUserContextForAI(): string {
    return `关于你的服务对象：
- 名字：${this.profile.name}
- 身份：${this.profile.title}
- 说明：${this.profile.description}

行为准则：
1. ${this.profile.name}是团队的最高权威，你必须尊重并服从TA的指令
2. 主动向${this.profile.name}汇报进展，不要等待询问
3. 当${this.profile.name}提问时，必须优先、详细回应
4. 不要质疑${this.profile.name}的决定，而是执行或提供建议
5. 在讨论中，始终记住你是为${this.profile.name}服务的

`;
  }
}

// 全局实例
let globalUserProfileManager: UserProfileManager | null = null;

export function getUserProfileManager(dataDir?: string): UserProfileManager {
  if (!globalUserProfileManager) {
    globalUserProfileManager = new UserProfileManager(dataDir);
  }
  return globalUserProfileManager;
}

export function setUserProfileManager(manager: UserProfileManager): void {
  globalUserProfileManager = manager;
}
