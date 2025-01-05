import * as vscode from 'vscode';
import { DocumentBlock } from '../../core/literate/entities';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';

export class EntangledNavigationProvider
  implements
    vscode.DocumentSymbolProvider,
    vscode.DefinitionProvider,
    vscode.ReferenceProvider,
    vscode.HoverProvider
{
  private logger: Logger;
  private manager: LiterateManager;

  constructor() {
    this.logger = Logger.getInstance();
    this.manager = LiterateManager.getInstance();
  }

  /** Find the block and reference at a given position */
  private findBlockAndReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { block: DocumentBlock; refIdentifier: string } | null {
    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return null;

    // Search through all blocks in the document
    for (const [_, blocks] of Object.entries(documentBlocks)) {
      for (const block of blocks) {
        // Check if we're in a reference within this block
        if (block.location.range.contains(position)) {
          // Find which reference we're on by checking the content
          const line = document.lineAt(position.line).text;
          const matches = Array.from(line.matchAll(/<<([^>]+)>>/g));
          for (const match of matches) {
            const start = match.index!;
            const end = start + match[0].length;
            if (start <= position.character && position.character <= end) {
              return { block, refIdentifier: match[1] };
            }
          }
        }
      }
    }
    return null;
  }

  /** Find the block at a given position */
  private findBlockAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { identifier: string; block: DocumentBlock } | null {
    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return null;

    for (const [identifier, blocks] of Object.entries(documentBlocks)) {
      for (const block of blocks) {
        if (block.location.range.contains(position)) {
          return { identifier, block };
        }
      }
    }
    return null;
  }

  /** Provide document symbols for the outline view */
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    this.logger.debug('navigation::provideDocumentSymbols', {
      uri: document.uri.toString(),
    });

    if (token.isCancellationRequested) {
      return [];
    }

    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return [];

    const symbols: vscode.DocumentSymbol[] = [];

    for (const [identifier, blocks] of Object.entries(documentBlocks)) {
      for (const block of blocks) {
        // Create a symbol for each block
        const symbol = new vscode.DocumentSymbol(
          identifier,
          `Code block #${block.blockCount}`,
          vscode.SymbolKind.Class,
          block.location.range,
          block.location.id_pos // Use the identifier position for the selection range
        );

        // Add details about dependencies and language
        symbol.detail = [
          block.language && `Language: ${block.language}`,
          block.dependencies.size > 0 &&
            `Dependencies: ${Array.from(block.dependencies).join(', ')}`,
          block.dependents.size > 0 && `Referenced by: ${Array.from(block.dependents).join(', ')}`,
        ]
          .filter(Boolean)
          .join(' | ');

        symbols.push(symbol);
      }
    }

    return symbols;
  }

  /** Provide definitions for code block references */
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    this.logger.debug('navigation::provideDefinition', {
      uri: document.uri.toString(),
      position: `${position.line}:${position.character}`,
    });

    if (token.isCancellationRequested) {
      return null;
    }

    // Check if we're on a reference
    const blockAndRef = this.findBlockAndReferenceAtPosition(document, position);
    if (blockAndRef) {
      return this.manager.findDefinition(blockAndRef.refIdentifier);
    }

    // Check if we're on a block definition
    const blockAtPos = this.findBlockAtPosition(document, position);
    if (blockAtPos) {
      return new vscode.Location(document.uri, blockAtPos.block.location.range);
    }

    return null;
  }

  /** Provide all references to a code block */
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    this.logger.debug('navigation::provideReferences', {
      uri: document.uri.toString(),
      position: `${position.line}:${position.character}`,
    });

    if (token.isCancellationRequested) {
      return [];
    }

    // First check if we're on a reference
    const blockAndRef = this.findBlockAndReferenceAtPosition(document, position);
    if (blockAndRef) {
      return this.manager.findReferences(blockAndRef.refIdentifier);
    }

    // Then check if we're on a block definition
    const blockAtPos = this.findBlockAtPosition(document, position);
    if (blockAtPos) {
      return this.manager.findReferences(blockAtPos.identifier);
    }

    return [];
  }

  /** Provide hover information for code blocks and references */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    this.logger.debug('navigation::provideHover', {
      uri: document.uri.toString(),
      position: `${position.line}:${position.character}`,
    });

    if (token.isCancellationRequested) {
      return null;
    }

    // Check if we're on a reference
    const blockAndRef = this.findBlockAndReferenceAtPosition(document, position);
    if (blockAndRef) {
      try {
        const content = this.manager.getExpandedContent(blockAndRef.refIdentifier);
        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(content, 'markdown');
        return new vscode.Hover(markdown);
      } catch (error) {
        this.logger.warn('Failed to get expanded content for hover', {
          identifier: blockAndRef.refIdentifier,
          error,
        });
        return null;
      }
    }

    // Check if we're on a block definition
    const blockAtPos = this.findBlockAtPosition(document, position);
    if (blockAtPos) {
      const markdown = new vscode.MarkdownString();
      markdown.appendCodeblock(blockAtPos.block.content, blockAtPos.block.language || 'markdown');

      // Add metadata
      const metadata = [
        `Block #${blockAtPos.block.blockCount}`,
        blockAtPos.block.language && `Language: ${blockAtPos.block.language}`,
        blockAtPos.block.dependencies.size > 0 &&
          `Dependencies: ${Array.from(blockAtPos.block.dependencies).join(', ')}`,
        blockAtPos.block.dependents.size > 0 &&
          `Referenced by: ${Array.from(blockAtPos.block.dependents).join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n');

      markdown.appendMarkdown('\n\n---\n\n' + metadata);
      return new vscode.Hover(markdown);
    }

    return null;
  }
}
