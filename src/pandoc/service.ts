import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PandocAST, PandocCodeBlock, PandocASTNode } from './types';

const execAsync = promisify(exec);

export class PandocService {
    private static instance: PandocService;

    private constructor() {}

    public static getInstance(): PandocService {
        if (!PandocService.instance) {
            PandocService.instance = new PandocService();
        }
        return PandocService.instance;
    }

    async convertToAST(document: vscode.TextDocument): Promise<PandocAST> {
        try {
            const { stdout } = await execAsync(
                `echo ${JSON.stringify(document.getText())} | pandoc -f markdown -t json`
            );
            return JSON.parse(stdout);
        } catch (error) {
            throw new Error(`Failed to convert document to AST: ${error}`);
        }
    }

    extractCodeBlocks(ast: PandocAST): PandocCodeBlock[] {
        const codeBlocks: PandocCodeBlock[] = [];
        
        const processNode = (node: PandocASTNode) => {
            if (node.t === 'CodeBlock') {
                const [[identifier, classes, attrs], content] = node.c;
                const language = classes[0] || '';
                
                // Parse noweb references from the content
                const references = this.extractNowebReferences(content);
                
                // Extract filename if present in attributes
                const fileAttr = attrs.find(([key]: string[]) => key === 'file');
                const fileName = fileAttr ? fileAttr[1] : undefined;

                codeBlocks.push({
                    identifier,
                    language,
                    content,
                    references,
                    lineNumber: -1, // Will be populated later
                    fileName
                });
            }
        };

        this.traverseAST(ast, processNode);
        return codeBlocks;
    }

    private extractNowebReferences(content: string): string[] {
        const references: string[] = [];
        const regex = /<<([^>]+)>>/g;
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            references.push(match[1].trim());
        }
        
        return references;
    }

    private traverseAST(ast: PandocAST | PandocASTNode, callback: (node: PandocASTNode) => void) {
        if ('blocks' in ast) {
            ast.blocks.forEach(block => this.traverseAST(block, callback));
        } else if (Array.isArray(ast.c)) {
            callback(ast);
            ast.c.forEach(child => {
                if (typeof child === 'object' && child !== null) {
                    this.traverseAST(child, callback);
                }
            });
        }
    }
}
