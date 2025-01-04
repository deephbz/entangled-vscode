import * as vscode from 'vscode';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';
import { PATTERNS } from '../../utils/constants';

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
        const line = document.lineAt(position.line).text;
        const matches = Array.from(line.matchAll(PATTERNS.ALL_REFERENCES));
        
        for (const match of matches) {
            const start = match.index!;
            const end = start + match[0].length;
            
            if (position.character >= start && position.character <= end) {
                const identifier = match[1]; // Use the capture group from ALL_REFERENCES
                this.logger.debug('DefinitionProvider: Providing definition', { identifier });
                return this.documentManager.findDefinition(identifier);
            }
        }

        // Check if we're on a definition
        const codeBlockMatch = line.match(PATTERNS.CODE_BLOCK_OPEN);
        if (codeBlockMatch) {
            const attributes = codeBlockMatch[1];
            const defMatch = attributes.match(PATTERNS.BLOCK_IDENTIFIER);
            if (defMatch) {
                const identifier = defMatch[1];
                this.logger.debug('DefinitionProvider: Providing definition', { identifier });
                return this.documentManager.findDefinition(identifier);
            }
        }

        return null;
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
        const line = document.lineAt(position.line).text;
        
        // Check for references
        const refMatches = Array.from(line.matchAll(PATTERNS.ALL_REFERENCES));
        for (const match of refMatches) {
            const start = match.index!;
            const end = start + match[0].length;
            
            if (position.character >= start && position.character <= end) {
                const identifier = match[1];
                this.logger.debug('DefinitionProvider: Providing references for reference', { identifier });
                return this.documentManager.findReferences(identifier);
            }
        }

        // Check for definitions
        const codeBlockMatch = line.match(PATTERNS.CODE_BLOCK_OPEN);
        if (codeBlockMatch) {
            const attributes = codeBlockMatch[1];
            const defMatch = attributes.match(PATTERNS.BLOCK_IDENTIFIER);
            if (defMatch) {
                const identifier = defMatch[1];
                this.logger.debug('DefinitionProvider: Providing references for definition', { identifier });
                return this.documentManager.findReferences(identifier);
            }
        }

        return [];
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
        const line = document.lineAt(position.line).text;
        
        // Check for references
        const refMatches = Array.from(line.matchAll(PATTERNS.ALL_REFERENCES));
        for (const match of refMatches) {
            const start = match.index!;
            const end = start + match[0].length;
            
            if (position.character >= start && position.character <= end) {
                const identifier = match[1];
                return this.provideHoverContent(identifier, new vscode.Range(
                    position.line,
                    start,
                    position.line,
                    end
                ));
            }
        }

        // Check for definitions in code block attributes
        const codeBlockMatch = line.match(PATTERNS.CODE_BLOCK_OPEN);
        if (codeBlockMatch) {
            const attributes = codeBlockMatch[1];
            const defMatch = attributes.match(PATTERNS.BLOCK_IDENTIFIER);
            if (defMatch) {
                const identifier = defMatch[1];
                const start = attributes.indexOf('#' + identifier) + line.indexOf(attributes);
                return this.provideHoverContent(identifier, new vscode.Range(
                    position.line,
                    start,
                    position.line,
                    start + identifier.length + 1
                ));
            }
        }

        return undefined;
    }

    private async provideHoverContent(identifier: string, range: vscode.Range): Promise<vscode.Hover | undefined> {
        try {
            const content = this.documentManager.getExpandedContent(identifier);
            const locations = this.documentManager.findDefinition(identifier);

            let message = new vscode.MarkdownString();
            if (locations.length > 0) {
                const loc = locations[0];
                message.appendMarkdown(`**Definition**: ${loc.uri.fsPath}:${loc.range.start.line + 1}\n\n`);
            }
            message.appendCodeblock(content);

            this.logger.debug('HoverProvider: Providing hover', { identifier });
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
        const pattern = PATTERNS.CODE_BLOCK;
        
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const attributes = match[1];
            const idMatch = attributes.match(PATTERNS.BLOCK_IDENTIFIER);
            
            if (idMatch) {
                const identifier = idMatch[1];
                
                //TODO: not using PATTERN
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
                this.logger.debug('SymbolProvider: Found document symbol', { identifier });
            }
        }
        
        return symbols;
    }
}
