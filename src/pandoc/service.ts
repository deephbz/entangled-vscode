import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { PandocAST, PandocCodeBlock, PandocASTNode } from './types';
import { log } from '../extension';

const execAsync = promisify(exec);

/**
 * Service for interacting with Pandoc to convert Markdown to AST and extract code blocks.
 */
export class PandocService {
    private static instance: PandocService;
    private static readonly TEMP_FILE_PREFIX = 'entangled-';
    private static readonly TEMP_FILE_SUFFIX = '.md';

    private constructor() {}

    public static getInstance(): PandocService {
        if (!PandocService.instance) {
            PandocService.instance = new PandocService();
        }
        return PandocService.instance;
    }

    /**
     * Converts a markdown document to Pandoc AST format.
     * @throws Error if pandoc command fails or AST parsing fails
     */
    async convertToAST(document: vscode.TextDocument): Promise<PandocAST> {
        if (!document) {
            throw new Error('Invalid document provided');
        }

        let tmpFile: string | null = null;
        try {
            const text = document.getText();
            if (!text) {
                throw new Error('Document is empty');
            }

            tmpFile = await this.createTempFile(text);
            const ast = await this.executePandocCommand(tmpFile);
            return this.validateAST(ast);
        } finally {
            await this.cleanupTempFile(tmpFile);
        }
    }

    /**
     * Creates a temporary file with the given content.
     * @throws Error if file creation fails
     */
    private async createTempFile(content: string): Promise<string> {
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(
            tmpDir,
            `${PandocService.TEMP_FILE_PREFIX}${Date.now()}${PandocService.TEMP_FILE_SUFFIX}`
        );

        try {
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(tmpFile),
                Buffer.from(content, 'utf8')
            );
            log(`Created temporary file: ${tmpFile}`);
            return tmpFile;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create temporary file: ${errorMessage}`);
        }
    }

    /**
     * Executes pandoc command on the given file and returns parsed AST.
     * @throws Error if pandoc command fails or output parsing fails
     */
    private async executePandocCommand(filePath: string): Promise<PandocAST> {
        const command = `pandoc -f markdown -t json "${filePath}"`;
        try {
            const { stdout, stderr } = await execAsync(command);
            if (stderr) {
                log(`Pandoc warning: ${stderr}`);
            }

            try {
                return JSON.parse(stdout);
            } catch (parseError) {
                throw new Error(`Failed to parse pandoc output: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
        } catch (error) {
            throw new Error(`Pandoc command failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Validates the AST structure.
     * @throws Error if AST is invalid
     */
    private validateAST(ast: any): PandocAST {
        if (!ast || typeof ast !== 'object') {
            throw new Error('Invalid AST: not an object');
        }
        if (!Array.isArray(ast.blocks)) {
            throw new Error('Invalid AST: missing blocks array');
        }
        if (ast.meta && typeof ast.meta !== 'object') {
            throw new Error('Invalid AST: meta field is not an object');
        }
        if (ast.pandoc_version && !Array.isArray(ast.pandoc_version)) {
            throw new Error('Invalid AST: pandoc_version is not an array');
        }
        return ast;
    }

    /**
     * Cleans up the temporary file.
     */
    private async cleanupTempFile(tmpFile: string | null): Promise<void> {
        if (tmpFile) {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tmpFile));
                log(`Cleaned up temporary file: ${tmpFile}`);
            } catch (error) {
                log(`Warning: Failed to clean up temporary file ${tmpFile}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Extracts code blocks from a Pandoc AST.
     */
    extractCodeBlocks(ast: PandocAST): PandocCodeBlock[] {
        if (!ast || !Array.isArray(ast.blocks)) {
            return [];
        }

        const codeBlocks: PandocCodeBlock[] = [];
        this.traverseAST(ast, (node) => {
            if (this.isCodeBlockNode(node)) {
                const block = this.parseCodeBlock(node);
                if (block) {
                    codeBlocks.push(block);
                }
            }
        });

        log(`Extracted ${codeBlocks.length} code blocks`);
        return codeBlocks;
    }

    /**
     * Type guard for code block nodes.
     */
    private isCodeBlockNode(node: PandocASTNode): boolean {
        return node.t === 'CodeBlock' && 
               Array.isArray(node.c) && 
               node.c.length === 2 &&
               Array.isArray(node.c[0]) &&
               typeof node.c[1] === 'string';
    }

    /**
     * Parses a code block node into a PandocCodeBlock.
     */
    private parseCodeBlock(node: PandocASTNode): PandocCodeBlock | null {
        try {
            const [[identifier, classes, attrs], content] = node.c;
            
            if (typeof identifier !== 'string' || !Array.isArray(classes) || !Array.isArray(attrs)) {
                return null;
            }

            const language = classes[0] || '';
            const references = this.extractNowebReferences(content);
            const fileAttr = attrs.find(([key]: string[]) => key === 'file');
            const fileName = fileAttr?.[1];

            return {
                identifier,
                language,
                content,
                references,
                lineNumber: -1,
                fileName
            };
        } catch (error) {
            log(`Warning: Failed to parse code block: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Extracts noweb references from code block content.
     */
    private extractNowebReferences(content: string): string[] {
        if (!content) {
            return [];
        }

        const references = new Set<string>();
        const regex = /<<([^>]+)>>/g;
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            const reference = match[1]?.trim();
            if (reference) {
                references.add(reference);
            }
        }
        
        return Array.from(references);
    }

    /**
     * Traverses the AST and calls the callback for each node.
     */
    private traverseAST(ast: PandocAST | PandocASTNode, callback: (node: PandocASTNode) => void): void {
        if (!ast) {
            return;
        }

        if ('blocks' in ast && Array.isArray(ast.blocks)) {
            ast.blocks.forEach(block => this.traverseAST(block, callback));
        } else if ('t' in ast && 't' in ast && Array.isArray(ast.c)) {
            callback(ast);
            ast.c.forEach(child => {
                if (child && typeof child === 'object') {
                    this.traverseAST(child as PandocASTNode, callback);
                }
            });
        }
    }
}
