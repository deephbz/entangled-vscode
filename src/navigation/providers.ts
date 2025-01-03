import * as vscode from 'vscode';
import { DocumentManager } from '../document/manager';

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
    private documentManager: DocumentManager;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
    }

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        
        let currentBlock: { range: vscode.Range; identifier: string; language: string } | null = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match both standard code blocks and file blocks
            const codeBlockMatch = line.match(/^```\s*\{([^}]*)\}/);
            
            if (codeBlockMatch) {
                const attributes = codeBlockMatch[1];
                // Extract identifier and language
                const idMatch = attributes.match(/#([^}\s]+)/);
                const langMatch = attributes.match(/\.([^}\s#]+)/);
                
                if (idMatch) {
                    const startPos = new vscode.Position(i, 0);
                    currentBlock = {
                        range: new vscode.Range(startPos, startPos),
                        identifier: idMatch[1],
                        language: langMatch ? langMatch[1] : ''
                    };
                }
            } else if (line.trim() === '```' && currentBlock) {
                const endPos = new vscode.Position(i, line.length);
                currentBlock.range = new vscode.Range(currentBlock.range.start, endPos);
                
                const detail = currentBlock.language ? `[${currentBlock.language}]` : '';
                symbols.push(new vscode.DocumentSymbol(
                    currentBlock.identifier,
                    detail,
                    vscode.SymbolKind.Class,
                    currentBlock.range,
                    currentBlock.range
                ));
                
                currentBlock = null;
            }
        }
        
        return symbols;
    }
}
