import * as vscode from 'vscode';
import { DocumentManager } from '../document/manager';
import { log } from '../extension';

/** Regular expression for matching noweb references <<identifier>> */
const NOWEB_REFERENCE_REGEX = /<<([^>]+)>>/;

/** Regular expression for matching code block headers with identifiers */
const CODE_BLOCK_IDENTIFIER_REGEX = /^```\s*\{[^}]*#([^}\s]+)[^}]*\}/;

/**
 * Base class for Entangled providers with common functionality.
 */
abstract class EntangledProviderBase {
    protected documentManager: DocumentManager;

    constructor() {
        this.documentManager = DocumentManager.getInstance();
    }

    /**
     * Extracts a noweb reference identifier from text at a given position.
     */
    protected getNowebReference(document: vscode.TextDocument, position: vscode.Position): string | null {
        const range = document.getWordRangeAtPosition(position, NOWEB_REFERENCE_REGEX);
        if (!range) return null;

        const text = document.getText(range);
        return text.substring(2, text.length - 2); // Remove << and >>
    }

    /**
     * Extracts a code block identifier from a line.
     */
    protected getCodeBlockIdentifier(lineText: string): string | null {
        const match = lineText.match(CODE_BLOCK_IDENTIFIER_REGEX);
        return match?.[1] ?? null;
    }
}

/**
 * Provides "Go to Definition" functionality for noweb references.
 */
export class EntangledDefinitionProvider extends EntangledProviderBase implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition> {
        const identifier = this.getNowebReference(document, position);
        return identifier ? this.documentManager.findDefinition(identifier) : null;
    }
}

/**
 * Provides "Find All References" functionality for code blocks and noweb references.
 */
export class EntangledReferenceProvider extends EntangledProviderBase implements vscode.ReferenceProvider {
    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        const lineText = document.lineAt(position.line).text;
        
        // Check for code block identifier
        const blockId = this.getCodeBlockIdentifier(lineText);
        if (blockId) {
            return this.documentManager.findReferences(blockId);
        }

        // Check for noweb reference
        const refId = this.getNowebReference(document, position);
        if (refId) {
            return this.documentManager.findReferences(refId);
        }

        return [];
    }
}

/**
 * Provides hover information for code blocks and noweb references.
 */
export class EntangledHoverProvider extends EntangledProviderBase implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const lineText = document.lineAt(position.line).text;
        
        // Check for code block identifier
        const blockId = this.getCodeBlockIdentifier(lineText);
        if (blockId) {
            return this.createHover(blockId, 'Code Block Definition');
        }

        // Check for noweb reference
        const refId = this.getNowebReference(document, position);
        if (refId) {
            return this.createHover(refId, 'Referenced Code Block');
        }

        return null;
    }

    private createHover(identifier: string, title: string): vscode.Hover {
        const content = this.documentManager.getExpandedContent(identifier);
        return new vscode.Hover([
            new vscode.MarkdownString(`**${title}**`),
            new vscode.MarkdownString('```' + content + '```')
        ]);
    }
}

/**
 * Provides document symbols (outline) for code blocks.
 */
export class EntangledDocumentSymbolProvider extends EntangledProviderBase implements vscode.DocumentSymbolProvider {
    async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        log('Providing document symbols...');
        const uri = document.uri.toString();
        const symbols: vscode.DocumentSymbol[] = [];
        
        // Get blocks for this document
        const blocks = Object.entries(this.documentManager.documents)
            .flatMap(([identifier, blocks]) => 
                blocks
                    .filter(block => block.location.uri.toString() === uri)
                    .map(block => ({
                        identifier,
                        block
                    }))
            );

        log(`Found ${blocks.length} blocks in document`);
        
        // Create symbols
        for (const { identifier, block } of blocks) {
            const detail = block.language ? `[${block.language}]` : '';
            symbols.push(new vscode.DocumentSymbol(
                identifier,
                detail,
                vscode.SymbolKind.Class,
                block.location.range,
                block.location.range
            ));
        }
        
        log(`Returning ${symbols.length} symbols`);
        return symbols;
    }
}
