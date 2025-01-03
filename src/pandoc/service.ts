import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PandocAST, PandocASTNode, CodeBlock, CodeBlockAttributes, CodeBlockProperty, CodeBlockType } from '../core/types';
import { log } from '../extension';

const execAsync = promisify(exec);

// Get the output channel from extension
const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

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
        let tmpFile: string | null = null;
        try {
            log('Converting document to AST...');
            const text = document.getText();
            log(`Document content length: ${text.length} characters`);
            
            // Write content to a temporary file
            tmpFile = await this.writeToTempFile(text);
            log(`Created temporary file: ${tmpFile}`);
            
            const command = `pandoc -f markdown -t json "${tmpFile}"`;
            log(`Executing pandoc command: ${command}`);
            
            const { stdout, stderr } = await execAsync(command);
            if (stderr) {
                log(`Pandoc stderr: ${stderr}`);
            }
            log(`Pandoc output received, length: ${stdout.length}`);
            
            try {
                const ast = JSON.parse(stdout);
                log('Successfully parsed AST');
                return ast;
            } catch (parseError) {
                log(`Failed to parse AST: ${parseError}`);
                log(`Raw output (first 200 chars): ${stdout.substring(0, 200)}...`);
                throw parseError;
            }
        } catch (error) {
            log(`Error in convertToAST: ${error}`);
            if (error instanceof Error) {
                log(`Error stack: ${error.stack}`);
            }
            throw error;
        } finally {
            // Clean up temporary file
            if (tmpFile) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(tmpFile));
                    log(`Cleaned up temporary file: ${tmpFile}`);
                } catch (error) {
                    log(`Failed to clean up temporary file: ${error}`);
                }
            }
        }
    }

    private async writeToTempFile(content: string): Promise<string> {
        const tmpDir = '/tmp';
        const tmpFile = `${tmpDir}/entangled-${Date.now()}.md`;
        log(`Writing content to temporary file: ${tmpFile}`);
        try {
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(tmpFile),
                Buffer.from(content, 'utf8')
            );
            log('Successfully wrote content to temporary file');
            return tmpFile;
        } catch (error) {
            log(`Failed to write temporary file: ${error}`);
            throw error;
        }
    }

    private parseCodeBlockProperties(propertiesStr: string): CodeBlockAttributes {
        const properties: CodeBlockProperty[] = [];
        const result: CodeBlockAttributes = { properties };
        
        // Remove curly braces and split by whitespace, preserving quoted values
        const matches = propertiesStr.replace(/^\{|\}$/g, '').match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || [];
        
        for (const prop of matches) {
            if (prop.startsWith('#')) {
                // Identifier: #name
                properties.push({
                    type: 'identifier',
                    key: prop.slice(1)
                });
                result.identifier = prop.slice(1);
            } else if (prop.startsWith('.')) {
                // Class: .name
                properties.push({
                    type: 'class',
                    key: prop.slice(1)
                });
                // First class is always the language
                if (!result.language) {
                    result.language = prop.slice(1);
                }
            } else if (prop.includes('=')) {
                // Key-value: key=value
                const [key, ...valueParts] = prop.split('=');
                const value = valueParts.join('=').replace(/^["']|["']$/g, '');
                properties.push({
                    type: 'keyValue',
                    key,
                    value
                });
                if (key === 'file') {
                    result.fileName = value;
                }
            }
        }
        
        return result;
    }

    private determineBlockType(attrs: CodeBlockAttributes): CodeBlockType {
        if (attrs.fileName) {
            return 'file';
        } else if (attrs.identifier && attrs.language) {
            return 'referable';
        }
        return 'ignored';
    }

    extractCodeBlocks(ast: PandocAST): CodeBlock[] {
        log('Extracting code blocks from AST...');
        const codeBlocks: CodeBlock[] = [];
        
        const processNode = (node: PandocASTNode) => {
            if (node.t === 'CodeBlock') {
                const [[identifier, classes, rawAttrs], content] = node.c;
                
                // Parse the full properties string from raw attributes
                const propertiesStr = rawAttrs.join(' ');
                const attributes = this.parseCodeBlockProperties(propertiesStr);
                const type = this.determineBlockType(attributes);
                
                // Parse noweb references and preserve indentation
                const { references, indentation } = this.extractNowebReferences(content);
                
                codeBlocks.push({
                    type,
                    identifier: attributes.identifier || '',
                    language: attributes.language || '',
                    content,
                    references,
                    location: new vscode.Location(vscode.Uri.file(''), new vscode.Range(0, 0, 0, 0)), // Will be updated later
                    fileName: attributes.fileName,
                    indentation,
                    attributes
                });
            }
        };

        this.traverseAST(ast, processNode);
        log(`Found ${codeBlocks.length} code blocks`);
        return codeBlocks;
    }

    private extractNowebReferences(content: string): { references: string[], indentation: string } {
        const references: string[] = [];
        let indentation = '';
        
        // Split content into lines and process each line
        const lines = content.split('\n');
        for (const line of lines) {
            const match = line.match(/^(\s*)<<([^>]+)>>\s*$/);
            if (match) {
                const [_, indent, ref] = match;
                references.push(ref);
                // Store indentation of first reference found
                if (!indentation) {
                    indentation = indent;
                }
            }
        }
        
        return { references, indentation };
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
