import * as vscode from 'vscode';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';

/**
 * Provides definition lookup for literate programming references
 */
export class EntangledDefinitionProvider implements vscode.DefinitionProvider {
    private documentManager: LiterateManager;
    private logger: Logger;

    constructor() {
        this.documentManager = LiterateManager.getInstance();
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

/**
 * Provides reference lookup for literate programming blocks
 */
export class EntangledReferenceProvider implements vscode.ReferenceProvider {
    private documentManager: LiterateManager;
    private logger: Logger;

    constructor() {
        this.documentManager = LiterateManager.getInstance();
        this.logger = Logger.getInstance();
    }

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const range = document.getWordRangeAtPosition(position, /(?:#[^\s\}]+)|(?:<<[^>]+>>)/);
        if (!range) {
            return [];
        }

        const word = document.getText(range);
        let identifier = word;

        // Handle both reference (<<id>>) and definition (#id) formats
        if (word.startsWith('<<')) {
            identifier = word.substring(2, word.length - 2);
        } else if (word.startsWith('#')) {
            identifier = word.substring(1);
        } else {
            return [];
        }

        this.logger.debug('Providing references', { identifier });
        return this.documentManager.findReferences(identifier);
    }
}

/**
 * Provides hover information for literate programming blocks
 */
export class EntangledHoverProvider implements vscode.HoverProvider {
    private documentManager: LiterateManager;
    private logger: Logger;

    constructor() {
        this.documentManager = LiterateManager.getInstance();
        this.logger = Logger.getInstance();
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        // Check for reference format <<identifier>>
        let range = document.getWordRangeAtPosition(position, /<<[^>]+>>/);
        let isReference = true;

        // If not found, check for definition format #identifier
        if (!range) {
            range = document.getWordRangeAtPosition(position, /#[^\s\}]+/);
            isReference = false;
        }

        if (!range) {
            return undefined;
        }

        const word = document.getText(range);
        let identifier: string;

        if (isReference) {
            identifier = word.substring(2, word.length - 2); // Remove << and >>
        } else {
            identifier = word.substring(1); // Remove #
        }

        try {
            const content = this.documentManager.getExpandedContent(identifier);
            const locations = this.documentManager.findDefinition(identifier);

            let message = new vscode.MarkdownString();
            if (locations.length > 0) {
                const loc = locations[0];
                message.appendMarkdown(`**Definition**: ${loc.uri.fsPath}:${loc.range.start.line + 1}\n\n`);
            }
            message.appendCodeblock(content);

            this.logger.debug('Providing hover', { identifier });
            return new vscode.Hover(message, range);
        } catch (error) {
            this.logger.warn('Error providing hover', { error: error instanceof Error ? error.message : String(error) });
            return undefined;
        }
    }
}

/**
 * Provides document symbols for literate programming blocks
 */
export class EntangledDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private logger = Logger.getInstance();

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        const text = document.getText();
        const symbols: vscode.DocumentSymbol[] = [];
        const pattern = /^```\s*\{([^}]*#[^}\s]+)[^}]*\}/gm;
        
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const attributes = match[1];
            const idMatch = attributes.match(/#([^\s}]+)/);
            
            if (idMatch) {
                const identifier = idMatch[1];
                
                // Find the end of the code block
                const blockEnd = text.indexOf('\n```', match.index + match[0].length);
                if (blockEnd === -1) continue;
                
                const endPos = document.positionAt(blockEnd + 4);
                const range = new vscode.Range(startPos, endPos);
                
                const symbol = new vscode.DocumentSymbol(
                    identifier,
                    'Code Block',
                    vscode.SymbolKind.String,
                    range,
                    range
                );
                
                symbols.push(symbol);
                this.logger.debug('Found document symbol', { identifier });
            }
        }
        
        return symbols;
    }
}
