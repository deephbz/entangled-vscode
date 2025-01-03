import * as vscode from 'vscode';
import { DocumentManager } from '../document/manager';

const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

function log(message: string) {
    console.log(message);
    outputChannel.appendLine(message);
}

export class EntangledDefinitionProvider implements vscode.DefinitionProvider {
    private documentManager: DocumentManager;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
    }

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition> {
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (!range) return null;

        const text = document.getText(range);
        const identifier = text.substring(2, text.length - 2); // Remove << and >>
        return this.documentManager.findDefinition(identifier);
    }
}

export class EntangledReferenceProvider implements vscode.ReferenceProvider {
    private documentManager: DocumentManager;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
    }

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        // Check if we're in a code block identifier
        const lineText = document.lineAt(position.line).text;
        // Match both standard code blocks with {.lang #id} and file blocks with {.lang file=path}
        const codeBlockMatch = lineText.match(/^```\s*\{[^}]*#([^}\s]+)[^}]*\}/);
        if (codeBlockMatch) {
            const identifier = codeBlockMatch[1];
            return this.documentManager.findReferences(identifier);
        }

        // Check if we're in a noweb reference
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (range) {
            const text = document.getText(range);
            const identifier = text.substring(2, text.length - 2);
            return this.documentManager.findReferences(identifier);
        }

        return [];
    }
}

export class EntangledHoverProvider implements vscode.HoverProvider {
    private documentManager: DocumentManager;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Check for code block identifier
        const lineText = document.lineAt(position.line).text;
        const codeBlockMatch = lineText.match(/^```\s*\{[^}]*#([^}\s]+)[^}]*\}/);
        if (codeBlockMatch) {
            const identifier = codeBlockMatch[1];
            const content = this.documentManager.getExpandedContent(identifier);
            return new vscode.Hover([
                new vscode.MarkdownString('**Code Block Definition**'),
                new vscode.MarkdownString('```' + content + '```')
            ]);
        }

        // Check for noweb reference
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (range) {
            const text = document.getText(range);
            const identifier = text.substring(2, text.length - 2);
            const content = this.documentManager.getExpandedContent(identifier);
            return new vscode.Hover([
                new vscode.MarkdownString('**Referenced Code Block**'),
                new vscode.MarkdownString('```' + content + '```')
            ]);
        }

        return null;
    }
}

export class EntangledDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private documentManager = DocumentManager.getInstance();

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        log('Providing document symbols...');
        const symbols: vscode.DocumentSymbol[] = [];
        const uri = document.uri.toString();
        
        // Get all blocks in this document from the document manager
        const documentBlocks = this.documentManager.documents;
        log(`Found ${Object.keys(documentBlocks).length} total blocks`);
        
        // Filter blocks for this document
        for (const [identifier, blocks] of Object.entries(documentBlocks)) {
            log(`Processing blocks for identifier: ${identifier}`);
            for (const block of blocks) {
                if (block.location.uri.toString() === uri) {
                    log(`Creating symbol for block: ${identifier}`);
                    const detail = block.language ? `[${block.language}]` : '';
                    symbols.push(new vscode.DocumentSymbol(
                        identifier,
                        detail,
                        vscode.SymbolKind.Class,
                        block.location.range,
                        block.location.range
                    ));
                }
            }
        }
        
        log(`Returning ${symbols.length} symbols`);
        return symbols;
    }
}
