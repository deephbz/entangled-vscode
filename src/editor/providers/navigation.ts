import * as vscode from 'vscode';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';
import { ILiterateManager } from '../../core/literate/manager';
import { LiteratePatterns } from '../../core/literate/patterns';
import { CodeBlockType } from '../../core/literate/types';

/**
 * Provides definition lookup for literate programming references
 */
export class EntangledDefinitionProvider implements vscode.DefinitionProvider {
    private documentManager: ILiterateManager;
    private logger: Logger;

    constructor() {
        this.documentManager = LiterateManager.getInstance();
        this.logger = Logger.getInstance();
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Definition | null> {
        const range = document.getWordRangeAtPosition(position, LiteratePatterns.codeBlockReference);
        if (!range) return null;

        const text = document.getText(range);
        const match = text.match(LiteratePatterns.codeBlockReference);
        if (!match) return null;

        const identifier = match[1];
        const blocks = await this.documentManager.getBlocksByIdentifier(identifier);
        
        if (!blocks || blocks.length === 0) return null;

        return blocks
            .filter(block => block.type === CodeBlockType.Referable || block.type === CodeBlockType.File)
            .map(block => new vscode.Location(
                document.uri,
                new vscode.Range(block.location.start, block.location.end)
            ));
    }

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        // Check if we're on a reference or definition
        const refRange = document.getWordRangeAtPosition(position, LiteratePatterns.codeBlockReference);
        const defRange = document.getWordRangeAtPosition(position, LiteratePatterns.identifierExtractor);
        
        if (!refRange && !defRange) return [];

        let identifier: string | null = null;
        
        if (refRange) {
            const text = document.getText(refRange);
            const match = text.match(LiteratePatterns.codeBlockReference);
            if (match) identifier = match[1];
        } else if (defRange) {
            const text = document.getText(defRange);
            const match = text.match(LiteratePatterns.identifierExtractor);
            if (match) identifier = match[1];
        }

        if (!identifier) return [];

        const blocks = await this.documentManager.getBlocksByIdentifier(identifier);
        if (!blocks || blocks.length === 0) return [];

        const locations: vscode.Location[] = [];

        // Add definitions
        blocks.forEach(block => {
            if (block.type === CodeBlockType.Referable || block.type === CodeBlockType.File) {
                locations.push(new vscode.Location(
                    document.uri,
                    new vscode.Range(block.location.start, block.location.end)
                ));
            }
        });

        // Add references
        blocks.forEach(block => {
            block.referenceRanges.forEach(range => {
                locations.push(new vscode.Location(document.uri, range));
            });
        });

        return locations;
    }
}

/**
 * Provides hover information for literate programming blocks
 */
export class EntangledHoverProvider implements vscode.HoverProvider {
    private documentManager: ILiterateManager;
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
        let range = document.getWordRangeAtPosition(position, LiteratePatterns.codeBlockReference);
        let isReference = true;

        // If not found, check for definition format #identifier
        if (!range) {
            range = document.getWordRangeAtPosition(position, LiteratePatterns.identifierExtractor);
            isReference = false;
        }

        if (!range) {
            return undefined;
        }

        const word = document.getText(range);
        let identifier: string;

        if (isReference) {
            const match = word.match(LiteratePatterns.codeBlockReference);
            if (match) identifier = match[1];
        } else {
            const match = word.match(LiteratePatterns.identifierExtractor);
            if (match) identifier = match[1];
        }

        if (!identifier) return undefined;

        try {
            const content = this.documentManager.getExpandedContent(identifier);
            const locations = await this.documentManager.getBlocksByIdentifier(identifier);

            let message = new vscode.MarkdownString();
            if (locations.length > 0) {
                const loc = locations[0];
                message.appendMarkdown(`**Definition**: ${loc.location.start.line + 1}\n\n`);
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
        const pattern = LiteratePatterns.codeBlockDefinition;
        
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
