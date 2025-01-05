import * as vscode from 'vscode';
import { DocumentBlock, NoWebReference } from '../../core/literate/entities';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';

interface BlockReference {
  block: DocumentBlock;
  refIdentifier: string;
}

interface BlockWithIdentifier {
  identifier: string;
  block: DocumentBlock;
}

export class EntangledNavigationProvider
  implements vscode.DocumentSymbolProvider, vscode.DefinitionProvider, vscode.ReferenceProvider, vscode.HoverProvider
{
  private static readonly REFERENCE_REGEX = /<<([^>]+)>>/g;

  private readonly logger = Logger.getInstance();
  private readonly manager = LiterateManager.getInstance();

  /** Find a NoWebReference at a given position */
  private findNoWebReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): NoWebReference | undefined {
    const entities = this.manager.getDocumentEntities(document.uri.toString());
    if (!entities?.references) return undefined;

    return Object.values(entities.references).find((ref) => ref.location.id_pos.contains(position));
  }

  /** Find the block and reference at a given position */
  private findBlockAndReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): BlockReference | null {
    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return null;

    const line = document.lineAt(position.line).text;
    const matches = Array.from(line.matchAll(EntangledNavigationProvider.REFERENCE_REGEX));

    for (const blocks of Object.values(documentBlocks)) {
      for (const block of blocks) {
        if (!block.location.range.contains(position)) continue;

        const reference = matches.find((match) => {
          const start = match.index!;
          const end = start + match[0].length;
          return start <= position.character && position.character <= end;
        });

        if (reference) {
          return { block, refIdentifier: reference[1] };
        }
      }
    }
    return null;
  }

  /** Find the block at a given position */
  private findBlockAtPosition(document: vscode.TextDocument, position: vscode.Position): BlockWithIdentifier | null {
    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return null;

    for (const [identifier, blocks] of Object.entries(documentBlocks)) {
      const block = blocks.find((b) => b.location.id_pos.contains(position));
      if (block) {
        return { identifier, block };
      }
    }
    return null;
  }

  /** Create metadata string for a block */
  private createBlockMetadata(block: DocumentBlock): string {
    const metadata = [
      `Block #${block.blockCount}`,
      block.language && `Language: ${block.language}`,
      block.dependencies.size > 0 && `Dependencies: ${Array.from(block.dependencies).join(', ')}`,
      block.dependents.size > 0 && `Referenced by: ${Array.from(block.dependents).join(', ')}`,
    ].filter(Boolean);

    return metadata.join('\n');
  }

  async provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    this.logger.debug('navigation::provideDocumentSymbols', { uri: document.uri.toString() });

    if (token.isCancellationRequested) return [];

    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return [];

    return Object.entries(documentBlocks).flatMap(([identifier, blocks]) =>
      blocks.map((block) => {
        const symbol = new vscode.DocumentSymbol(
          identifier,
          `Code block #${block.blockCount}`,
          vscode.SymbolKind.Class,
          block.location.range,
          block.location.id_pos
        );
        symbol.detail = this.createBlockMetadata(block);
        return symbol;
      })
    );
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | null> {
    this.logger.debug('navigation::provideDefinition', {
      uri: document.uri.toString(),
      position: `${position.line}:${position.character}`,
    });

    if (token.isCancellationRequested) return null;

    // First check NoWebReferences
    const noWebRef = this.findNoWebReferenceAtPosition(document, position);
    if (noWebRef) {
      return new vscode.Location(noWebRef.location.uri, noWebRef.location.id_pos);
    }

    // Then check block references
    const blockAndRef = this.findBlockAndReferenceAtPosition(document, position);
    if (blockAndRef) {
      return this.manager.findDefinition(blockAndRef.refIdentifier);
    }

    // Finally check block definitions
    const blockAtPos = this.findBlockAtPosition(document, position);
    return blockAtPos ? new vscode.Location(document.uri, blockAtPos.block.location.id_pos) : null;
  }

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    this.logger.debug('navigation::provideReferences', {
      uri: document.uri.toString(),
      position: `${position.line}:${position.character}`,
    });

    if (token.isCancellationRequested) return [];

    // First check NoWebReferences
    const noWebRef = this.findNoWebReferenceAtPosition(document, position);
    if (noWebRef) {
      return [new vscode.Location(noWebRef.location.uri, noWebRef.location.id_pos)];
    }

    // Then check block references
    const blockAndRef = this.findBlockAndReferenceAtPosition(document, position);
    if (blockAndRef) {
      return this.manager.findReferences(blockAndRef.refIdentifier);
    }

    // Finally check block definitions
    const blockAtPos = this.findBlockAtPosition(document, position);
    return blockAtPos ? this.manager.findReferences(blockAtPos.identifier) : [];
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    this.logger.debug('navigation::provideHover', {
      uri: document.uri.toString(),
      position: `${position.line}:${position.character}`,
    });

    if (token.isCancellationRequested) return null;

    // First check NoWebReferences
    const noWebRef = this.findNoWebReferenceAtPosition(document, position);
    if (noWebRef) {
      const markdown = new vscode.MarkdownString();
      markdown.appendText(`Reference to ${noWebRef.identifier}`);
      return new vscode.Hover(markdown);
    }

    // Then check block references
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

    // Finally check block definitions
    const blockAtPos = this.findBlockAtPosition(document, position);
    if (blockAtPos) {
      const markdown = new vscode.MarkdownString();
      markdown.appendCodeblock(blockAtPos.block.content, blockAtPos.block.language ?? 'markdown');
      markdown.appendMarkdown('\n\n---\n\n' + this.createBlockMetadata(blockAtPos.block));
      return new vscode.Hover(markdown);
    }

    return null;
  }
}
