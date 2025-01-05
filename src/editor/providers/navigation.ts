import * as vscode from 'vscode';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';

/** Provides definition lookup for literate programming references */
export class EntangledDefinitionProvider implements vscode.DefinitionProvider {
  private documentManager: LiterateManager;
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
    // Get blocks for this document using read-only access
    const documentBlocks = this.documentManager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) {
      return null;
    }

    // Find the block that contains this position
    for (const block of documentBlocks) {
      // Check references first
      for (const range of block.referenceRanges) {
        if (range.contains(position)) {
          const identifier = Array.from(block.dependencies)[0];
          if (!identifier) continue;

          this.logger.debug('DefinitionProvider: Providing definition from reference', {
            identifier,
          });
          return this.documentManager.findDefinition(identifier);
        }
      }

      // Then check if we're on the definition itself
      if (block.location.range.contains(position)) {
        if (!block.identifier) continue;

        this.logger.debug('DefinitionProvider: Providing definition from block', {
          identifier: block.identifier,
        });
        return this.documentManager.findDefinition(block.identifier);
      }
    }

    return null;
  }
}

/** Provides reference lookup for literate programming blocks */
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
    // Get blocks for this document
    const documentBlocks = this.documentManager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) {
      return [];
    }

    // Find the block that contains this position
    for (const block of documentBlocks) {
      // Check if we're on the definition
      if (block.location.range.contains(position)) {
        if (!block.identifier) continue;

        this.logger.debug('ReferenceProvider: Providing references for definition', {
          identifier: block.identifier,
        });
        return this.documentManager.findReferences(block.identifier);
      }

      // Check if we're on a reference
      for (const range of block.referenceRanges) {
        if (range.contains(position)) {
          const identifier = Array.from(block.dependencies)[0];
          if (!identifier) continue;

          this.logger.debug('ReferenceProvider: Providing references from reference', {
            identifier,
          });
          return this.documentManager.findReferences(identifier);
        }
      }
    }

    return [];
  }
}

/** Provides hover information for literate programming blocks */
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
    this.logger.debug('HoverProvider: Providing hover for position', {
      position: position.toString(),
    });
    // Get blocks for this document
    const documentBlocks = this.documentManager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) {
      return undefined;
    }

    // Find the block that contains this position
    for (const block of documentBlocks) {
      // Check references first
      for (const range of block.referenceRanges) {
        if (range.contains(position)) {
          const identifier = Array.from(block.dependencies)[0];
          if (!identifier) continue;

          return this.provideHoverContent(identifier, range);
        }
      }

      // Then check if we're on the definition itself
      if (block.location.range.contains(position)) {
        if (!block.identifier) continue;

        return this.provideHoverContent(
          block.identifier,
          new vscode.Range(
            block.location.range.start,
            block.location.range.start.translate(0, block.identifier.length + 1)
          )
        );
      }
    }

    return undefined;
  }

  private async provideHoverContent(
    identifier: string,
    range: vscode.Range
  ): Promise<vscode.Hover | undefined> {
    const definition = await this.documentManager.findDefinition(identifier);
    if (!definition) {
      return undefined;
    }

    const hoverMessage = new vscode.MarkdownString();
    hoverMessage.appendMarkdown(`**Definition**: \`${identifier}\``);
    return new vscode.Hover(hoverMessage, range);
  }
}

/** Provides document symbols for literate programming blocks */
export class EntangledDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  private logger = Logger.getInstance();
  private documentManager: LiterateManager;

  constructor() {
    this.documentManager = LiterateManager.getInstance();
  }

  async provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    const uris = this.documentManager.getDocumentsUris();
    const documentBlocks = this.documentManager.getDocumentBlocks(document.uri.toString());
    this.logger.debug('SymbolProvider: Providing document symbols for document', {
      existingUris: uris,
      uri: document.uri.toString(),
      numBlocks: documentBlocks?.length,
    });
    if (!documentBlocks) {
      return [];
    }

    const symbols: vscode.DocumentSymbol[] = [];

    for (const block of documentBlocks) {
      if (!block.identifier) continue;

      const symbol = new vscode.DocumentSymbol(
        block.identifier,
        'Code Block',
        vscode.SymbolKind.String,
        block.location.range,
        block.location.range
      );

      symbols.push(symbol);
      this.logger.debug('SymbolProvider: Found document symbol', {
        identifier: block.identifier,
      });
    }

    return symbols;
  }
}
