import * as vscode from 'vscode';
import { EntangledProcessor } from '../core/processor';
import { CodeBlock } from '../core/types';
import { log } from '../extension';

export class EntangledDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private processor: EntangledProcessor) {}

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        try {
            // Ensure document is parsed
            await this.processor.parse(document);
            
            // Check if we're in a noweb reference
            const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
            if (!range) {
                return undefined;
            }

            const text = document.getText(range);
            const identifier = text.substring(2, text.length - 2).trim();
            
            return this.processor.findDefinition(document.uri.toString(), identifier)?.location;
        } catch (error) {
            log(`Error providing definition: ${error}`);
            return undefined;
        }
    }
}

export class EntangledReferenceProvider implements vscode.ReferenceProvider {
    constructor(private processor: EntangledProcessor) {}

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        try {
            // Ensure document is parsed
            await this.processor.parse(document);
            
            // Check if we're in a code block identifier
            const line = document.lineAt(position.line).text;
            const codeBlockMatch = line.match(/^```\s*\{[^}]*#([^}\s]+)[^}]*\}/);
            if (codeBlockMatch) {
                const identifier = codeBlockMatch[1];
                return this.processor.findReferences(document.uri.toString(), identifier)
                    .map(block => block.location);
            }

            // Check if we're in a noweb reference
            const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
            if (range) {
                const text = document.getText(range);
                const identifier = text.substring(2, text.length - 2).trim();
                return this.processor.findReferences(document.uri.toString(), identifier)
                    .map(block => block.location);
            }

            return [];
        } catch (error) {
            log(`Error providing references: ${error}`);
            return [];
        }
    }
}

export class EntangledHoverProvider implements vscode.HoverProvider {
    constructor(private processor: EntangledProcessor) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        try {
            // Ensure document is parsed
            await this.processor.parse(document);
            
            // Check if we're in a noweb reference
            const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
            if (range) {
                const text = document.getText(range);
                const identifier = text.substring(2, text.length - 2).trim();
                const block = this.processor.findDefinition(document.uri.toString(), identifier);
                
                if (block) {
                    const content = block.content.trim();
                    return new vscode.Hover([
                        `**${identifier}** (${block.language})`,
                        '```' + block.language,
                        content,
                        '```'
                    ]);
                }
            }

            return undefined;
        } catch (error) {
            log(`Error providing hover: ${error}`);
            return undefined;
        }
    }
}

export class EntangledDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    constructor(private processor: EntangledProcessor) {}

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        try {
            // Ensure document is parsed
            const parsedDoc = await this.processor.parse(document);
            
            return parsedDoc.blocks
                .filter(block => block.type !== 'ignored')
                .map(block => this.createDocumentSymbol(block));
        } catch (error) {
            log(`Error providing symbols: ${error}`);
            return [];
        }
    }

    private createDocumentSymbol(block: CodeBlock): vscode.DocumentSymbol {
        const name = block.type === 'file' ? block.fileName || 'unnamed' : block.identifier || 'unnamed';
        const detail = block.type === 'file' ? 
            `[${block.language}] ${block.fileName}` : 
            `[${block.language}]`;
        
        return new vscode.DocumentSymbol(
            name,
            detail,
            vscode.SymbolKind.Class,
            block.location.range,
            block.location.range
        );
    }
}
