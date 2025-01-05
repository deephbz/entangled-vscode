import * as vscode from 'vscode';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private outputChannel: vscode.OutputChannel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Entangled VSCode');
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private get isDebugEnabled(): boolean {
    return vscode.workspace.getConfiguration('entangled').get('debugLogging', false);
  }

  private formatLogEntry(entry: LogEntry): string {
    let message = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;

    if (entry.data) {
      message += ` | ${JSON.stringify(entry.data)}`;
    }

    if (entry.error) {
      message += `\n${entry.error.stack || entry.error.message}`;
    }

    return message;
  }

  private log(level: LogEntry['level'], message: string, error?: Error, data?: Record<string, unknown>): void {
    if (level === 'debug' && !this.isDebugEnabled) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      error,
    };

    const formattedMessage = this.formatLogEntry(entry);
    this.outputChannel.appendLine(formattedMessage);

    if (level === 'error') {
      console.error(formattedMessage);
    } else if (this.isDebugEnabled || level !== 'debug') {
      console.log(formattedMessage);
    }
  }

  public info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, undefined, data);
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, undefined, data);
  }

  public error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('error', message, error, data);
  }

  public debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, undefined, data);
  }

  public show(): void {
    this.outputChannel.show();
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }
}
