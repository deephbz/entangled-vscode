import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { PandocCodeBlock, PandocAST, PandocASTNode } from './types';
import { IPandocService } from '../services/interfaces';
import { Logger } from '../services/logger';
import { EntangledError } from '../errors';

export class PandocError extends EntangledError {
    constructor(message: string, public readonly stderr: string) {
        super(`Pandoc error: ${message}${stderr ? `\nStderr: ${stderr}` : ''}`);
        this.name = 'PandocError';
        Object.setPrototypeOf(this, PandocError.prototype);
    }
}

/**
 * Service for interacting with Pandoc to parse Markdown documents and extract code blocks.
 * Uses Pandoc's JSON AST format for reliable parsing.
 */
export class PandocService implements IPandocService {
    private static readonly PANDOC_COMMAND = 'pandoc';
    private static readonly PANDOC_ARGS = ['-f', 'markdown', '-t', 'json'];
    private static readonly NOWEB_REF_PATTERN = /<<([^>]+)>>/g;

    private static _instance?: PandocService;
    private readonly logger: Logger;

    private constructor() {
        this.logger = Logger.getInstance();
    }

    public static getInstance(): PandocService {
        return this._instance ??= new PandocService();
    }

    /**
     * Converts a markdown document to Pandoc's AST format
     */
    async convertToAST(document: vscode.TextDocument): Promise<PandocAST> {
        const uri = document.uri.toString();
        this.logger.debug('Converting document to AST', { uri });
        
        try {
            const ast = await this.runPandocProcess(document.getText());
            this.validateASTStructure(ast);
            return ast as PandocAST;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error('AST conversion failed', new Error(message), { uri });
            throw error instanceof PandocError ? error : new PandocError(message, '');
        }
    }

    /** Extracts code blocks from a Pandoc AST */
    extractCodeBlocks(ast: PandocAST): PandocCodeBlock[] {
        this.logger.debug('Extracting code blocks from AST');
        const blocks: PandocCodeBlock[] = [];

        try {
            this.traverseAST(ast.blocks, (node) => {
                if (this.isCodeBlock(node)) {
                    const block = this.processCodeBlock(node);
                    if (block) blocks.push(block);
                }
            });

            this.logger.info('Code blocks extracted', { count: blocks.length });
            return blocks;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to extract code blocks', new Error(message));
            throw new PandocError('Failed to extract code blocks', '');
        }
    }

    /** Runs the pandoc process and returns parsed JSON output */
    private async runPandocProcess(input: string): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const pandoc = spawn(PandocService.PANDOC_COMMAND, PandocService.PANDOC_ARGS);
            let stdout = '';
            let stderr = '';

            pandoc.stdout.on('data', (data) => stdout += data);
            pandoc.stderr.on('data', (data) => stderr += data);
            
            pandoc.on('error', (error) => {
                reject(new PandocError('Failed to spawn pandoc process', error.message));
            });

            pandoc.on('close', (code) => {
                if (code !== 0) {
                    reject(new PandocError('Conversion failed', stderr));
                    return;
                }

                try {
                    resolve(JSON.parse(stdout));
                } catch (error) {
                    reject(new PandocError('Failed to parse JSON output', stderr));
                }
            });

            pandoc.stdin.write(input);
            pandoc.stdin.end();
        });
    }

    /** Validates the basic structure of a Pandoc AST */
    private validateASTStructure(ast: unknown): asserts ast is PandocAST {
        if (!ast || typeof ast !== 'object' || !('blocks' in ast) || !Array.isArray((ast as any).blocks)) {
            throw new PandocError('Invalid AST structure', '');
        }
    }

    /**
     * Type guard for code block nodes
     */
    private isCodeBlock(node: PandocASTNode): boolean {
        return node.t === 'CodeBlock' && 
               Array.isArray(node.c) && 
               node.c.length === 2 &&
               Array.isArray(node.c[0]);
    }

    /** Processes a code block node into a PandocCodeBlock */
    private processCodeBlock(node: PandocASTNode): PandocCodeBlock | null {
        const [attributes, content] = node.c;
        const [identifier, classes] = attributes;

        if (!identifier || typeof content !== 'string') return null;

        const references = Array.from(content.matchAll(PandocService.NOWEB_REF_PATTERN))
            .map(match => match[1]);

        return {
            identifier,
            language: classes[0] || '',
            content,
            references
        };
    }

    /** Traverses the AST and calls the visitor function for each node */
    private traverseAST(nodes: PandocASTNode[], visitor: (node: PandocASTNode) => void): void {
        for (const node of nodes) {
            visitor(node);
            if (Array.isArray(node.c)) {
                for (const child of node.c) {
                    if (this.isASTNode(child)) {
                        this.traverseAST([child], visitor);
                    }
                }
            }
        }
    }

    /** Type guard for AST nodes */
    private isASTNode(value: unknown): value is PandocASTNode {
        return typeof value === 'object' && 
               value !== null && 
               't' in value && 
               'c' in value;
    }
}
