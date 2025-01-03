import * as vscode from 'vscode';

export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: Record<string, unknown>;
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

    private formatLogEntry(entry: LogEntry): string {
        const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
        return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
    }

    private log(level: LogEntry['level'], message: string, data?: Record<string, unknown>): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };

        const formattedMessage = this.formatLogEntry(entry);
        this.outputChannel.appendLine(formattedMessage);

        if (level === 'error') {
            console.error(formattedMessage);
        } else {
            console.log(formattedMessage);
        }
    }

    public info(message: string, data?: Record<string, unknown>): void {
        this.log('info', message, data);
    }

    public warn(message: string, data?: Record<string, unknown>): void {
        this.log('warn', message, data);
    }

    public error(message: string, error?: Error, data?: Record<string, unknown>): void {
        const errorData = error ? {
            ...data,
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack
        } : data;
        this.log('error', message, errorData);
    }

    public debug(message: string, data?: Record<string, unknown>): void {
        this.log('debug', message, data);
    }

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}
