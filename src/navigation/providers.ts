import * as vscode from 'vscode';
import { DocumentManager } from '../document/manager';
import { Logger } from '../services/logger';

export class EntangledDefinitionProvider implements vscode.DefinitionProvider {
    private documentManager: DocumentManager;
    private logger: Logger;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
        this.logger = Logger.getInstance();
    }

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition> {
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (!range) return null;

        const text = document.getText(range);
        const identifier = text.substring(2, text.length - 2); // Remove << and >>
        this.logger.debug('Providing definition', { identifier });
        return this.documentManager.findDefinition(identifier);
    }
}

export class EntangledReferenceProvider implements vscode.ReferenceProvider {
    private documentManager: DocumentManager;
    private logger: Logger;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
        this.logger = Logger.getInstance();
    }

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        // Check if we're in a code block identifier
        const lineText = document.lineAt(position.line).text;
        // Match both standard code blocks with {.lang #id} and file blocks with {.lang file=path}
        const codeBlockMatch = lineText.match(/^```\s*\{[^}]*#([^}\s]+)[^}]*\}/);
        if (codeBlockMatch) {
            const identifier = codeBlockMatch[1];
            this.logger.debug('Providing references for code block', { identifier });
            return this.documentManager.findReferences(identifier);
        }

        // Check if we're in a noweb reference
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (!range) return null;

        const text = document.getText(range);
        const identifier = text.substring(2, text.length - 2); // Remove << and >>
        this.logger.debug('Providing references for noweb reference', { identifier });
        return this.documentManager.findReferences(identifier);
    }
}

export class EntangledHoverProvider implements vscode.HoverProvider {
    private documentManager: DocumentManager;
    private logger: Logger;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
        this.logger = Logger.getInstance();
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Check if we're hovering over a noweb reference
        const range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        if (!range) return null;

        const text = document.getText(range);
        const identifier = text.substring(2, text.length - 2); // Remove << and >>
        
        try {
            const content = this.documentManager.getExpandedContent(identifier);
            this.logger.debug('Providing hover content', { identifier });
            return new vscode.Hover([
                new vscode.MarkdownString(`**Code Block**: \`${identifier}\``),
                new vscode.MarkdownString('```\n' + content + '\n```')
            ]);
        } catch (error) {
            this.logger.error('Failed to provide hover content', error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }
}

export class EntangledDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private logger = Logger.getInstance();

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('```')) {
                const match = line.match(/^```\s*\{[^}]*#([^}\s]+)[^}]*\}/);
                if (match) {
                    const identifier = match[1];
                    let endLine = i;
                    
                    // Find the end of the code block
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].trim() === '```') {
                            endLine = j;
                            break;
                        }
                    }
                    
                    this.logger.debug('Found document symbol', { identifier, startLine: i, endLine });
                    symbols.push(new vscode.DocumentSymbol(
                        identifier,
                        'Code Block',
                        vscode.SymbolKind.Function,
                        new vscode.Range(i, 0, endLine, lines[endLine].length),
                        new vscode.Range(i, 0, i, line.length)
                    ));
                }
            }
        }
        
        return symbols;
    }
}
