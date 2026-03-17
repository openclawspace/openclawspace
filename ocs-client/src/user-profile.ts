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
    const dir = dataDir || path.join(os.homedir(), '.openclawspace');
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
   * Generate AI soulMd prefix with user context
   * Note: User info is now in team.md, this returns empty to keep SOUL.md clean
   */
  generateUserContextForAI(_language: string = 'zh'): string {
    // User context (initiator info) is now in team.md
    // Agents should read /space/team.md to understand team structure
    return '';
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
