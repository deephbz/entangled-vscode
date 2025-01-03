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
            console.log('Converting document to AST...');
            const text = document.getText();
            console.log('Document content:', text.substring(0, 100) + '...');
            
            const command = `echo ${JSON.stringify(text)} | pandoc -f markdown -t json`;
            console.log('Executing pandoc command:', command);
            
            const { stdout } = await execAsync(command);
            console.log('Pandoc output received, length:', stdout.length);
            
            const ast = JSON.parse(stdout);
            console.log('AST parsed successfully');
            return ast;
        } catch (error) {
            console.error('Failed to convert document to AST:', error);
            throw error;
        }
    }

    extractCodeBlocks(ast: PandocAST): PandocCodeBlock[] {
        console.log('Extracting code blocks from AST...');
        const codeBlocks: PandocCodeBlock[] = [];
        
        const processNode = (node: PandocASTNode) => {
            if (node.t === 'CodeBlock') {
                console.log('Found code block:', node);
                const [[identifier, classes, attrs], content] = node.c;
                const language = classes[0] || '';
                
                // Parse noweb references from the content
                const references = this.extractNowebReferences(content);
                console.log('Code block details:', { identifier, language, references });
                
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
