import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Logger - 同时输出到控制台和文件的日志模块
 */
export class Logger {
  private logFile: string;
  private logStream: fs.WriteStream | null = null;
  private logDir: string;

  constructor(logDir?: string) {
    this.logDir = logDir || path.join(os.homedir(), '.openclawspace', 'logs');
    this.ensureLogDir();

    // 创建按日期命名的日志文件
    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `ocs-client-${date}.log`);

    this.openLogStream();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private openLogStream(): void {
    try {
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    } catch (err) {
      console.error('[Logger] Failed to open log file:', err);
    }
  }

  private formatMessage(level: string, message: string): string {
    const now = new Date();
    const timestamp = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-');
    return `[${timestamp}] [${level}] ${message}`;
  }

  private write(level: string, message: string): void {
    const formatted = this.formatMessage(level, message);

    // 输出到控制台
    console.log(formatted);

    // 输出到文件
    if (this.logStream) {
      this.logStream.write(formatted + '\n');
    }
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }

  warn(message: string): void {
    this.write('WARN', message);
  }

  debug(message: string): void {
    this.write('DEBUG', message);
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// 全局 logger 实例
let globalLogger: Logger | null = null;

export function getLogger(logDir?: string): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(logDir);
  }
  return globalLogger;
}

export function setLogger(logger: Logger): void {
  globalLogger = logger;
}
