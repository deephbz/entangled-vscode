import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { PandocCodeBlock } from './types';
import { IPandocService } from '../interfaces';
import { Logger } from '../../utils/logger';
import { EntangledError } from '../../utils/errors';

export class PandocError extends EntangledError {
    constructor(message: string, public readonly stderr: string) {
        super(`Pandoc error: ${message}\nStderr: ${stderr}`);
        this.name = 'PandocError';
        Object.setPrototypeOf(this, PandocError.prototype);
    }
}

export class PandocService implements IPandocService {
    private static instance: PandocService;
    private logger: Logger;
    private astCache: Map<string, { ast: unknown, version: number }>;
    private readonly MAX_CACHE_SIZE = 50; // Maximum number of cached documents

    private constructor() {
        this.logger = Logger.getInstance();
        this.astCache = new Map();
    }

    public static getInstance(): PandocService {
        if (!PandocService.instance) {
            PandocService.instance = new PandocService();
        }
        return PandocService.instance;
    }

    public async convertToAST(document: vscode.TextDocument): Promise<unknown> {
        const uri = document.uri.toString();
        const version = document.version;
        
        // Check cache first
        const cached = this.astCache.get(uri);
        if (cached && cached.version === version) {
            this.logger.debug('Using cached AST', { uri, version });
            return cached.ast;
        }

        // Convert document to AST
        return new Promise<unknown>((resolve, reject) => {
            const pandoc = spawn('pandoc', ['-f', 'markdown', '-t', 'json']);
            let stdout = '';
            let stderr = '';

            pandoc.stdout.on('data', (data) => {
                stdout += data;
            });

            pandoc.stderr.on('data', (data) => {
                stderr += data;
            });

            pandoc.on('close', (code) => {
                if (code !== 0) {
                    this.logger.error('Pandoc conversion failed', undefined, { code, stderr });
                    reject(new PandocError('Conversion failed', stderr));
                    return;
                }

                try {
                    const ast = JSON.parse(stdout);
                    
                    // Update cache
                    if (this.astCache.size >= this.MAX_CACHE_SIZE) {
                        // Remove oldest entry if cache is full
                        const firstKey = this.astCache.keys().next().value;
                        if (firstKey !== undefined) {
                            this.astCache.delete(firstKey);
                        }
                    }
                    this.astCache.set(uri, { ast, version });
                    
                    this.logger.debug('Updated AST cache', { uri, version });
                    this.logger.debug('Successfully converted document to AST');
                    resolve(ast);
                } catch (error) {
                    this.logger.error('Failed to parse Pandoc output', error instanceof Error ? error : new Error(String(error)));
                    reject(new PandocError('Failed to parse output', stderr));
                }
            });

            pandoc.stdin.write(document.getText());
            pandoc.stdin.end();
        });
    }

    public clearCache(): void {
        this.astCache.clear();
        this.logger.info('Cleared AST cache');
    }

    extractCodeBlocks(ast: unknown): PandocCodeBlock[] {
        this.logger.debug('Extracting code blocks from AST');
        const blocks: PandocCodeBlock[] = [];

        if (!ast || typeof ast !== 'object' || !('blocks' in ast)) {
            this.logger.error('Invalid AST structure');
            throw new PandocError('Invalid AST structure', '');
        }

        const extractFromBlock = (block: any): void => {
            if (block.t === 'CodeBlock') {
                const [attributes, content] = block.c;
                const [identifier, classes] = attributes;
                
                if (identifier) {
                    const references = (content.match(/<<([^>]+)>>/g) || [])
                        .map((ref: string) => ref.slice(2, -2));

                    blocks.push({
                        identifier,
                        language: classes[0] || '',
                        content,
                        references
                    });
                }
            } else if (Array.isArray(block.c)) {
                for (const child of block.c) {
                    if (typeof child === 'object' && child !== null) {
                        extractFromBlock(child);
                    }
                }
            }
        };

        for (const block of (ast as any).blocks) {
            extractFromBlock(block);
        }

        this.logger.info('Extracted code blocks', { count: blocks.length });
        return blocks;
    }
}
