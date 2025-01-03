import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';
import { CircularReference } from '../document/types';

export interface IPandocService {
    convertToAST(document: vscode.TextDocument): Promise<unknown>;
    extractCodeBlocks(ast: unknown): PandocCodeBlock[];
    clearCache(): void;
}

export interface IDocumentManager {
    parseDocument(document: vscode.TextDocument): Promise<void>;
    findDefinition(identifier: string): vscode.Location[];
    findReferences(identifier: string): vscode.Location[];
    findCircularReferences(): CircularReference[];
    getExpandedContent(identifier: string): string;
    clearCache(): void;
}

export interface ILogger {
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, error?: Error, data?: Record<string, unknown>): void;
    debug(message: string, data?: Record<string, unknown>): void;
    show(): void;
    dispose(): void;
}
