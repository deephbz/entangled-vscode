import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PandocAST, PandocCodeBlock, PandocASTNode } from './types';

const execAsync = promisify(exec);

// Get the output channel from extension
const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

function log(message: string) {
    console.log(message);
    outputChannel.appendLine(message);
}

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
            log('Converting document to AST...');
            const text = document.getText();
            log(`Document content (first 100 chars): ${text.substring(0, 100)}...`);
            
            // Write content to a temporary file to avoid command line length limits
            const tmpFile = await this.writeToTempFile(text);
            const command = `pandoc -f markdown -t json "${tmpFile}"`;
            log(`Executing pandoc command: ${command}`);
            
            const { stdout, stderr } = await execAsync(command);
            if (stderr) {
                log(`Pandoc stderr: ${stderr}`);
            }
            log(`Pandoc output received, length: ${stdout.length}`);
            
            try {
                const ast = JSON.parse(stdout);
                log('AST parsed successfully');
                return ast;
            } catch (parseError) {
                log(`Failed to parse AST: ${parseError}`);
                log(`Raw output: ${stdout.substring(0, 200)}...`);
                throw parseError;
            }
        } catch (error) {
            log(`Failed to convert document to AST: ${error}`);
            throw error;
        }
    }

    private async writeToTempFile(content: string): Promise<string> {
        const tmpDir = '/tmp';
        const tmpFile = `${tmpDir}/entangled-${Date.now()}.md`;
        await vscode.workspace.fs.writeFile(
            vscode.Uri.file(tmpFile),
            Buffer.from(content, 'utf8')
        );
        return tmpFile;
    }

    extractCodeBlocks(ast: PandocAST): PandocCodeBlock[] {
        log('Extracting code blocks from AST...');
        const codeBlocks: PandocCodeBlock[] = [];
        
        const processNode = (node: PandocASTNode) => {
            if (node.t === 'CodeBlock') {
                log(`Found code block node: ${JSON.stringify(node, null, 2)}`);
                const [[identifier, classes, attrs], content] = node.c;
                
                // Extract language from first class
                const language = classes[0] || '';
                log(`Code block class: ${classes.join(', ')}`);
                
                // Parse noweb references from the content
                const references = this.extractNowebReferences(content);
                log(`Code block details: identifier=${identifier}, language=${language}, references=${references.join(', ')}`);
                
                // Extract filename if present in attributes
                const fileAttr = attrs.find(([key]: string[]) => key === 'file');
                const fileName = fileAttr ? fileAttr[1] : undefined;

                codeBlocks.push({
                    identifier,
                    language,
                    content,
                    references,
                    lineNumber: -1,
                    fileName
                });
            }
        };

        this.traverseAST(ast, processNode);
        log(`Found ${codeBlocks.length} code blocks`);
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
