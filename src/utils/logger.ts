/**
 * Centralized Logger Utility
 * Provides consistent logging across the application
 */

import chalk from 'chalk';
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logToFile: boolean = false;
  private logFilePath: string = './logs/app.log';
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start flush interval (every 5 seconds)
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Configure logger
   */
  configure(options: {
    level?: LogLevel;
    logToFile?: boolean;
    logFilePath?: string;
  }): void {
    if (options.level !== undefined) {
      this.logLevel = options.level;
    }
    if (options.logToFile !== undefined) {
      this.logToFile = options.logToFile;
    }
    if (options.logFilePath) {
      this.logFilePath = options.logFilePath;
    }
  }

  /**
   * Log debug message
   */
  debug(module: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, module, message, data);
  }

  /**
   * Log info message
   */
  info(module: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, module, message, data);
  }

  /**
   * Log warning message
   */
  warn(module: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, module, message, data);
  }

  /**
   * Log error message
   */
  error(module: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, module, message, data);
  }

  /**
   * Log critical message
   */
  critical(module: string, message: string, data?: any): void {
    this.log(LogLevel.CRITICAL, module, message, data);
  }

  /**
   * Core log method
   */
  private log(level: LogLevel, module: string, message: string, data?: any): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      module,
      message,
      data,
    };

    // Console output
    this.logToConsole(entry);

    // Add to buffer for file logging
    if (this.logToFile) {
      this.logBuffer.push(entry);
    }
  }

  /**
   * Log to console with color coding
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelStr = LogLevel[entry.level];
    const prefix = `[${timestamp}] [${levelStr}] [${entry.module}]`;

    let coloredMessage: string;
    switch (entry.level) {
      case LogLevel.DEBUG:
        coloredMessage = chalk.gray(`${prefix} ${entry.message}`);
        break;
      case LogLevel.INFO:
        coloredMessage = chalk.blue(`${prefix} ${entry.message}`);
        break;
      case LogLevel.WARN:
        coloredMessage = chalk.yellow(`${prefix} ${entry.message}`);
        break;
      case LogLevel.ERROR:
        coloredMessage = chalk.red(`${prefix} ${entry.message}`);
        break;
      case LogLevel.CRITICAL:
        coloredMessage = chalk.bgRed.white(`${prefix} ${entry.message}`);
        break;
      default:
        coloredMessage = `${prefix} ${entry.message}`;
    }

    console.log(coloredMessage);

    if (entry.data !== undefined) {
      console.log(chalk.gray(JSON.stringify(entry.data, null, 2)));
    }
  }

  /**
   * Flush log buffer to file
   */
  async flush(): Promise<void> {
    if (!this.logToFile || this.logBuffer.length === 0) {
      return;
    }

    try {
      // Ensure log directory exists
      const logDir = join(this.logFilePath, '..');
      if (!existsSync(logDir)) {
        await mkdir(logDir, { recursive: true });
      }

      // Format entries
      const entries = this.logBuffer.map((entry) => {
        const json = {
          timestamp: entry.timestamp.toISOString(),
          level: LogLevel[entry.level],
          module: entry.module,
          message: entry.message,
          data: entry.data,
        };
        return JSON.stringify(json);
      }).join('\n') + '\n';

      // Append to file
      await appendFile(this.logFilePath, entries, 'utf8');

      // Clear buffer
      this.logBuffer = [];
    } catch (error) {
      console.error(chalk.red('Failed to flush logs:'), error);
    }
  }

  /**
   * Shutdown logger
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

/**
 * Global logger instance
 */
export const logger = Logger.getInstance();

/**
 * Helper functions for quick logging
 */
export const log = {
  debug: (module: string, message: string, data?: any) => logger.debug(module, message, data),
  info: (module: string, message: string, data?: any) => logger.info(module, message, data),
  warn: (module: string, message: string, data?: any) => logger.warn(module, message, data),
  error: (module: string, message: string, data?: any) => logger.error(module, message, data),
  critical: (module: string, message: string, data?: any) => logger.critical(module, message, data),
};
