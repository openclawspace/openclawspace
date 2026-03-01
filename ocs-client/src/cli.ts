#!/usr/bin/env node

import { Command } from 'commander';
import { HubClient } from './hub-client.js';
import { Database } from './database.js';
import { SpaceManager } from './space-manager.js';
import { getLogger, setLogger, Logger } from './logger.js';
import { getUserProfileManager, setUserProfileManager, UserProfileManager } from './user-profile.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';

const program = new Command();

program
  .name('ocs-client')
  .description('OpenClawSpace Client - Local AI team service')
  .version('1.0.0');

program
  .command('start', { isDefault: true })
  .description('Start the client and connect to Hub')
  .option('-t, --token <token>', 'Use existing token')
  .option('-h, --hub <url>', 'Hub WebSocket URL', 'ws://localhost:8787/ws')
  .option('-d, --data-dir <dir>', 'Data directory')
  .action(async (options) => {
    await startClient(options);
  });

program
  .command('token')
  .description('Generate a new token without starting')
  .action(() => {
    const token = generateToken();
    console.log(token);
  });

const TOKEN_FILE = 'token.txt';

async function startClient(options: {
  token?: string;
  hub: string;
  dataDir?: string;
}) {
  // Setup data directory
  const dataDir = options.dataDir || path.join(os.homedir(), '.ocs-client');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize logger
  const logDir = path.join(dataDir, 'logs');
  const logger = new Logger(logDir);
  setLogger(logger);
  logger.info('🐾 OpenClawSpace Client 启动中...');

  // Initialize user profile
  const userProfile = new UserProfileManager(dataDir);
  setUserProfileManager(userProfile);
  const profile = userProfile.getProfile();
  logger.info(`用户身份: ${profile.name} (${profile.title})`);

  // Get or generate token
  const tokenFilePath = path.join(dataDir, TOKEN_FILE);
  let token: string;

  if (options.token) {
    // Use provided token and save it
    token = options.token;
    fs.writeFileSync(tokenFilePath, token, 'utf-8');
  } else if (fs.existsSync(tokenFilePath)) {
    // Read saved token
    token = fs.readFileSync(tokenFilePath, 'utf-8').trim();
  } else {
    // Generate new token and save it
    token = generateToken();
    fs.writeFileSync(tokenFilePath, token, 'utf-8');
  }

  logger.info(`Token: ${token}`);
  logger.info(`数据目录: ${dataDir}`);

  // Initialize database
  const dbPath = path.join(dataDir, 'data.db');
  const db = new Database(dbPath);
  logger.info('✅ 数据库已初始化');

  // Initialize space manager with user profile
  const spaceManager = new SpaceManager(db, userProfile);

  // Connect to Hub
  logger.info(`正在连接 Hub (${options.hub})...`);

  const hubClient = new HubClient({
    hubUrl: options.hub,
    token,
    spaceManager
  });

  // Handle signals
  process.on('SIGINT', () => {
    console.log('\n\n正在关闭...');
    hubClient.disconnect();
    db.close();
    logger.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    hubClient.disconnect();
    db.close();
    logger.close();
    process.exit(0);
  });

  // Connect and wait
  try {
    await hubClient.connect();
    logger.info('✅ 已连接到 Hub');
    logger.info(`请访问 https://open-claw-space.args.fun 并输入Token`);
    logger.info('按 Ctrl+C 停止服务');

    // Keep running
    await new Promise(() => {});
  } catch (err) {
    logger.error(`❌ 连接 Hub 失败: ${err}`);
    logger.close();
    process.exit(1);
  }
}

function generateToken(): string {
  // Generate 12-character alphanumeric token
  return crypto.randomBytes(8).toString('base64url').slice(0, 12);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { startClient, generateToken };
