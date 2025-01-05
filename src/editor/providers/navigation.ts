import * as vscode from 'vscode';
import { DocumentBlock, NoWebReference } from '../../core/literate/entities';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';
import { PATTERNS } from '../../utils/constants';

interface BlockReference {
  block: DocumentBlock;
  refIdentifier: string;
}

/** Provides navigation features for literate documents. */
export class EntangledNavigationProvider
  implements
    vscode.DocumentSymbolProvider,
    vscode.DefinitionProvider,
    vscode.ImplementationProvider,
    vscode.ReferenceProvider,
    vscode.HoverProvider
{
  private readonly logger = Logger.getInstance();
  private readonly manager = LiterateManager.getInstance();

  /** Find entity (block or reference) at position */
  private findEntityAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { type: 'reference'; entity: NoWebReference } | { type: 'block'; entity: DocumentBlock } | null {
    // First try to find a NoWebReference
    const reference = this.findNoWebReferenceAtPosition(document, position);
    if (reference) {
      return { type: 'reference', entity: reference };
    }
    // Then try to find a block
    const block = this.findBlockAtPosition(document, position);
    if (block) {
      return { type: 'block', entity: block };
    }

    return null;
  }

  private findNoWebReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): NoWebReference | undefined {
    const entities = this.manager.getDocumentEntities(document.uri.toString());
    if (!entities?.references) return undefined;

    for (const refs of Object.values(entities.references)) {
      const ref = refs.find((ref) => ref.location.id_pos.contains(position));
      if (ref) return ref;
    }
    return undefined;
  }

  private findBlockAtPosition(document: vscode.TextDocument, position: vscode.Position): DocumentBlock | null {
    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return null;

    for (const [_, blocks] of Object.entries(documentBlocks)) {
      const block = blocks.find((b) => b.location.id_pos.contains(position));
      if (block) {
        return block;
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
    if (token.isCancellationRequested) return null;

    const entity = this.findEntityAtPosition(document, position);
    if (!entity) return null;
    this.logger.debug('navigation::provideDefinition', {
      position: `${position.line}:${position.character}`,
      foundEntity: { type: entity.type, identifier: entity.entity.identifier },
    });

    // If we're on a reference, find the first matching block
    if (entity.type === 'reference') {
      const blocks = this.manager.getDocumentBlocks(document.uri.toString());
      if (!blocks) return null;

      for (const blockList of Object.values(blocks)) {
        for (const block of blockList) {
          if (block.identifier === entity.entity.identifier) {
            return new vscode.Location(block.location.uri, block.location.id_pos);
          }
        }
      }
    }

    // If we're on a block definition, return its position
    return new vscode.Location(document.uri, entity.entity.location.id_pos);
  }

  async provideImplementation(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | null> {
    if (token.isCancellationRequested) return null;

    const entity = this.findEntityAtPosition(document, position);
    if (!entity) return null;
    this.logger.debug('navigation::provideImplementation', {
      position: `${position.line}:${position.character}`,
      foundEntity: { type: entity.type, identifier: entity.entity.identifier },
    });

    const identifier = entity.type === 'reference' ? entity.entity.identifier : entity.entity.identifier;

    // Return all blocks with matching identifier
    const locations: vscode.Location[] = [];
    const blocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!blocks) return null;

    for (const blockList of Object.values(blocks)) {
      for (const block of blockList) {
        if (block.identifier === identifier) {
          locations.push(new vscode.Location(block.location.uri, block.location.id_pos));
        }
      }
    }

    return locations;
  }

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    if (token.isCancellationRequested) return [];

    const entity = this.findEntityAtPosition(document, position);
    if (!entity) return [];
    this.logger.debug('navigation::provideReferences', {
      position: `${position.line}:${position.character}`,
      foundEntity: { type: entity.type, identifier: entity.entity.identifier },
    });

    const identifier = entity.type === 'reference' ? entity.entity.identifier : entity.entity.identifier;

    // Find all references to this identifier
    const entities = this.manager.getDocumentEntities(document.uri.toString());
    if (!entities?.references) return [];

    return Object.values(entities.references)
      .flatMap((refs) => refs)
      .filter((ref) => ref.identifier === identifier)
      .map((ref) => new vscode.Location(ref.location.uri, ref.location.id_pos));
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
      markdown.appendCodeblock(blockAtPos.content, blockAtPos.language ?? 'markdown');
      markdown.appendMarkdown('\n\n---\n\n' + this.createBlockMetadata(blockAtPos));
      return new vscode.Hover(markdown);
    }

    return null;
  }

  private findBlockAndReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): BlockReference | null {
    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return null;

    const line = document.lineAt(position.line).text;
    const matches = Array.from(line.matchAll(PATTERNS.REFERENCE));

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
}
