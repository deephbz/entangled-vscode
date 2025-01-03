import * as vscode from 'vscode';
import { EntangledProcessor } from '../core/processor';
import { log } from '../extension';

const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

export class EntangledDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private processor: EntangledProcessor) {}

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const parsedDoc = await this.processor.getParsedDocument(document.uri.toString());
        if (!parsedDoc) {
            return undefined;
        }

        // Check if we're in a noweb reference
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (!range) {
            return undefined;
        }

        const text = document.getText(range);
        const identifier = text.substring(2, text.length - 2).trim();
        
        const blocks = parsedDoc.references.get(identifier);
        return blocks?.[0]?.location;
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
        const parsedDoc = await this.processor.getParsedDocument(document.uri.toString());
        if (!parsedDoc) {
            return [];
        }

        // Check if we're in a code block identifier
        const line = document.lineAt(position.line).text;
        const codeBlockMatch = line.match(/^```\s*\{[^}]*#([^}\s]+)[^}]*\}/);
        if (codeBlockMatch) {
            const identifier = codeBlockMatch[1];
            return Array.from(parsedDoc.references.get(identifier) || [])
                .map(block => block.location);
        }

        // Check if we're in a noweb reference
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (range) {
            const text = document.getText(range);
            const identifier = text.substring(2, text.length - 2).trim();
            return Array.from(parsedDoc.references.get(identifier) || [])
                .map(block => block.location);
        }

        return [];
    }
}

export class EntangledHoverProvider implements vscode.HoverProvider {
    constructor(private processor: EntangledProcessor) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const parsedDoc = await this.processor.getParsedDocument(document.uri.toString());
        if (!parsedDoc) {
            return undefined;
        }

        // Check if we're in a noweb reference
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (range) {
            const text = document.getText(range);
            const identifier = text.substring(2, text.length - 2).trim();
            const blocks = parsedDoc.references.get(identifier);
            
            if (blocks && blocks.length > 0) {
                const block = blocks[0];
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
    }
}

export class EntangledDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    constructor(private processor: EntangledProcessor) {}

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        const parsedDoc = await this.processor.getParsedDocument(document.uri.toString());
        if (!parsedDoc) {
            return [];
        }

        return parsedDoc.blocks
            .filter(block => block.type !== 'ignored')
            .map(block => {
                const detail = block.type === 'file' ? 
                    `[${block.language}] ${block.fileName}` : 
                    `[${block.language}]`;
                
                return new vscode.DocumentSymbol(
                    block.identifier || block.fileName || '',
                    detail,
                    vscode.SymbolKind.Class,
                    block.location.range,
                    block.location.range
                );
            });
    }
}
