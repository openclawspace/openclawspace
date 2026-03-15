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
  .option('--hub <url>', 'Hub WebSocket URL', 'wss://open-claw-space.args.fun/ws')
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
  // Initialize user profile
  const userProfile = new UserProfileManager(dataDir);
  setUserProfileManager(userProfile);

  // Load OpenClaw Gateway token from config
  const openclawConfigPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  let gatewayToken: string | undefined;
  try {
    if (fs.existsSync(openclawConfigPath)) {
      const openclawConfig = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf-8'));
      gatewayToken = openclawConfig?.gateway?.auth?.token;
      if (gatewayToken) {
        logger.info('[CLI] Loaded Gateway token from OpenClaw config');
      }
    }
  } catch (err) {
    logger.warn(`[CLI] Failed to load OpenClaw config: ${err}`);
  }

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

  // Initialize database
  const dbPath = path.join(dataDir, 'data.db');
  const db = new Database(dbPath);
  await db.init();

  // Initialize space manager with user profile and gateway token
  const spaceManager = new SpaceManager(db, userProfile, gatewayToken);

  // Initialize Gateway connection
  try {
    const gatewayConnected = await spaceManager.initializeGateway();
    if (gatewayConnected) {
      logger.info('[CLI] OpenClaw Gateway connected');
    } else {
      logger.warn('[CLI] OpenClaw Gateway not available, retrying...');
      // 继续重试连接，不降级到 CLI
    }
  } catch (err) {
    logger.error(`[CLI] Failed to initialize Gateway: ${err}`);
    logger.info('[CLI] Please ensure OpenClaw Gateway is running: openclaw gateway run');
    // 不退出，让程序继续运行，但会定期重试
  }

  const hubClient = new HubClient({
    hubUrl: options.hub,
    token,
    spaceManager
  });

  // Handle signals
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    hubClient.disconnect();
    db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    hubClient.disconnect();
    db.close();
    process.exit(0);
  });

  // Connect and wait
  try {
    await hubClient.connect();

    // Print concise startup message
    const webUrl = options.hub.replace('wss://', 'https://').replace('/ws', '');
    console.log(`\nopenclawspace started, open ${webUrl}, token: ${token}\n`);

    // Keep running
    await new Promise(() => {});
  } catch (err) {
    console.error(`Failed to connect: ${err}`);
    process.exit(1);
  }
}

function generateToken(): string {
  // Generate 12-character alphanumeric token
  return crypto.randomBytes(8).toString('base64url').slice(0, 12);
}

// Run if executed directly
program.parse();

export { startClient, generateToken };
