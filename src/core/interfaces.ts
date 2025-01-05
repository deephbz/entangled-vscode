import * as vscode from 'vscode';
import { PandocCodeBlock } from './pandoc/types';
// import { CircularReference } from './literate/entities';

/** Interface for Pandoc service operations */
export interface IPandocService {
  convertToAST(document: vscode.TextDocument): Promise<unknown>;
  extractCodeBlocks(ast: unknown): PandocCodeBlock[];
  clearCache(): void;
}

/** Interface for logging operations */
export interface ILogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  show(): void;
  dispose(): void;
}
