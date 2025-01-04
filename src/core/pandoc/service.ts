import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { PandocError } from '../../utils/errors';
import { LANGUAGE, PATTERNS } from '../../utils/constants';
import { PandocCodeBlock } from './types';
import { spawn } from 'child_process';

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

    async convertToAST(document: vscode.TextDocument): Promise<unknown> {
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
            const ast = JSON.parse(result);
            
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

    extractCodeBlocks(ast: unknown): PandocCodeBlock[] {
        this.logger.debug('Extracting code blocks from AST');

        try {
            if (!ast || typeof ast !== 'object' || !('blocks' in ast)) {
                this.logger.error('Invalid AST structure');
                throw new PandocError('Invalid AST structure', '');
            }

            const blocks: PandocCodeBlock[] = [];

            const extractFromBlock = (block: any): void => {
                if (block.t === 'CodeBlock') {
                    const [attributes, content] = block.c;
                    // Pandoc AST format: [[identifier, classes, key-value-pairs], content]
                    const [[id, classes]] = attributes;
                    
                    // The identifier is in the format "#name" in the attributes
                    const identifier = id?.startsWith('#') ? id.slice(1) : id;
                    
                    if (identifier) {
                        // Find references in the format <<name>>
                        const references = (content.match(PATTERNS.ALL_REFERENCES) || [])
                            .map((ref: string) => ref.slice(2, -2));

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
                            extractFromBlock(child);
                        }
                    }
                }
            };

            for (const block of (ast as any).blocks) {
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
