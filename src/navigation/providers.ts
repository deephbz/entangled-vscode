import * as vscode from 'vscode';
import { DocumentManager } from '../document/manager';
import { Logger } from '../utils/logger';

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

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const range = document.getWordRangeAtPosition(position, /(?:#[^\s\}]+)|(?:<<[^>]+>>)/);
        if (!range) {
            return [];
        }

        const word = document.getText(range);
        let identifier = word;

        // Handle both definition (#name) and reference (<<name>>) formats
        if (word.startsWith('#')) {
            identifier = word.substring(1);
        } else if (word.startsWith('<<')) {
            identifier = word.substring(2, word.length - 2);
        } else {
            return [];
        }

        this.logger.debug('Finding references', { identifier });
        const locations = this.documentManager.findReferences(identifier);

        // If we're looking for all references (includeDeclaration), also include the definition
        if (context.includeDeclaration) {
            const definitions = this.documentManager.findDefinition(identifier);
            locations.push(...definitions);
        }

        return locations;
    }
}

export class EntangledHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        const range = document.getWordRangeAtPosition(position, /(?:#[^\s\}]+)|(?:<<[^>]+>>)/);
        if (!range) {
            return undefined;
        }

        const word = document.getText(range);
        let identifier = word;
        
        // Handle both definition (#name) and reference (<<name>>) formats
        if (word.startsWith('#')) {
            identifier = word.substring(1);
        } else if (word.startsWith('<<')) {
            identifier = word.substring(2, word.length - 2);
        } else {
            return undefined;
        }

        const documentManager = DocumentManager.getInstance();
        const references = documentManager.findReferences(identifier);
        
        if (references.length === 0) {
            return undefined;
        }

        // Create markdown content for hover
        const contents: vscode.MarkdownString[] = [];
        
        if (word.startsWith('#')) {
            // For definitions, show where it's used
            const refCount = references.length;
            contents.push(new vscode.MarkdownString(`**${identifier}** has ${refCount} reference${refCount === 1 ? '' : 's'}:`));
            
            // Add command to show all references
            const commandUri = `command:entangled-vscode.findReferences?${encodeURIComponent(JSON.stringify([document.uri, range]))}`;
            contents.push(new vscode.MarkdownString(`[Show All References](${commandUri})`));
            
            // Show first few references
            const maxRefsToShow = 3;
            const refsToShow = references.slice(0, maxRefsToShow);
            const remainingRefs = references.length - maxRefsToShow;
            
            for (const ref of refsToShow) {
                const lineText = ref.uri.fsPath === document.uri.fsPath ? 
                    document.lineAt(ref.range.start.line).text.trim() :
                    `(in ${vscode.workspace.asRelativePath(ref.uri)})`;
                contents.push(new vscode.MarkdownString(`- ${lineText}`));
            }
            
            if (remainingRefs > 0) {
                contents.push(new vscode.MarkdownString(`... and ${remainingRefs} more reference${remainingRefs === 1 ? '' : 's'}`));
            }
        } else {
            // For references, show the definition
            const definitions = documentManager.findDefinition(identifier);
            if (definitions.length > 0) {
                const def = definitions[0];
                const defLineText = def.uri.fsPath === document.uri.fsPath ?
                    document.lineAt(def.range.start.line).text.trim() :
                    `(in ${vscode.workspace.asRelativePath(def.uri)})`;
                contents.push(new vscode.MarkdownString(`Defined as: ${defLineText}`));
            }
        }

        return new vscode.Hover(contents, range);
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
