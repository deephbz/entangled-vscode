import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { PandocError } from '../../utils/errors';
import { LANGUAGE, PATTERNS } from '../../utils/constants';
import { PandocCodeBlock } from './types';
import { spawn } from 'child_process';

// Type definitions for Pandoc AST
type PandocAttribute = [string | null, string[], [string, string][]];
type PandocCodeBlockData = [PandocAttribute, string];
interface PandocBlock {
    t: string;
    c: PandocCodeBlockData | PandocBlock[];
}
interface PandocAST {
    blocks: PandocBlock[];
}

export class PandocService {
    private static instance: PandocService;
    private logger: Logger;

    private constructor() {
        this.logger = Logger.getInstance();
    }

    public static getInstance(): PandocService {
        if (!PandocService.instance) {
            PandocService.instance = new PandocService();
        }
        return PandocService.instance;
    }

    private async executePandoc(input: string, args: string[]): Promise<string> {
        this.logger.debug('Executing pandoc', { args });

        return new Promise((resolve, reject) => {
            const process = spawn('pandoc', args);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('error', (error) => {
                this.logger.error('Pandoc process error', error);
                reject(new PandocError('Failed to execute pandoc', stderr || error.message));
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    this.logger.error('Pandoc exited with error', undefined, {
                        code,
                        stderr
                    });
                    reject(new PandocError(`Pandoc exited with code ${code}`, stderr));
                    return;
                }
                resolve(stdout);
            });

            process.stdin.write(input);
            process.stdin.end();
        });
    }

    async convertToAST(document: vscode.TextDocument): Promise<PandocAST> {
        this.logger.debug('Converting document to AST', {
            uri: document.uri.toString(),
            size: document.getText().length
        });

        try {
            const args = [
                '-f', LANGUAGE.PANDOC_FORMAT,
                '-t', 'json'
            ];

            const result = await this.executePandoc(document.getText(), args);
            const ast = JSON.parse(result) as PandocAST;
            
            this.logger.debug('Document converted to AST successfully');
            return ast;
        } catch (error) {
            if (error instanceof PandocError) {
                throw error;
            }
            throw new PandocError(
                'Failed to convert document to AST',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    extractCodeBlocks(ast: PandocAST): PandocCodeBlock[] {
        this.logger.debug('Extracting code blocks from AST');

        try {
            if (!ast || !ast.blocks) {
                this.logger.error('Invalid AST structure');
                throw new PandocError('Invalid AST structure', '');
            }

            const blocks: PandocCodeBlock[] = [];

            const extractFromBlock = (block: PandocBlock): void => {
                if (block.t === 'CodeBlock') {
                    const [attributes, content] = block.c as PandocCodeBlockData;
                    const [[rawId, classes, keyVals]] = [attributes];

                    // First check if there's a direct identifier
                    let identifier = rawId?.startsWith('#') ? rawId.slice(1) : undefined;

                    // If no direct identifier, look for it in key-value pairs
                    if (!identifier && Array.isArray(keyVals)) {
                        for (const [key, value] of keyVals) {
                            if (key === 'id' || key === 'identifier') {
                                identifier = value;
                                break;
                            }
                        }
                    }

                    // If still no identifier, check the raw attributes string for #identifier
                    if (!identifier) {
                        const text = attributes.toString();
                        const idMatch = text.match(PATTERNS.BLOCK_IDENTIFIER);
                        if (idMatch) {
                            identifier = idMatch[1];
                        }
                    }

                    if (identifier) {
                        this.logger.debug('Found code block', { identifier });
                        
                        // Find references in the format <<n>>
                        const references = Array.from(content.matchAll(PATTERNS.ALL_REFERENCES))
                            .map(match => match[1]);

                        blocks.push({
                            identifier,
                            language: classes?.[0]?.replace('.', '') || '',
                            content,
                            references
                        });
                    }
                } else if (Array.isArray(block.c)) {
                    for (const child of block.c) {
                        if (typeof child === 'object' && child !== null) {
                            extractFromBlock(child as PandocBlock);
                        }
                    }
                }
            };

            for (const block of ast.blocks) {
                extractFromBlock(block);
            }

            this.logger.debug('Code blocks extracted successfully', {
                count: blocks.length
            });
            
            return blocks;
        } catch (error) {
            throw new PandocError(
                'Failed to extract code blocks from AST',
                error instanceof Error ? error.message : String(error)
            );
        }
    }
}
