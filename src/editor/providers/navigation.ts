import * as vscode from 'vscode';
import { DocumentBlock, NoWebReference } from '../../core/literate/entities';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';

/** Provides navigation features for literate documents. */
export class EntangledNavigationProvider
  // Return first codeblock definition:
  implements
    vscode.DefinitionProvider,
    vscode.DeclarationProvider,
    // Return all codeblock definitions:
    vscode.ImplementationProvider,
    // Return all noweb references like <<identifier>>:
    vscode.ReferenceProvider,
    // Mouse hover information:
    vscode.HoverProvider
{
  private static instance: EntangledNavigationProvider;
  private readonly logger = Logger.getInstance();
  private readonly manager = LiterateManager.getInstance();

  public static getInstance(): EntangledNavigationProvider {
    if (!EntangledNavigationProvider.instance) {
      EntangledNavigationProvider.instance = new EntangledNavigationProvider();
    }
    return EntangledNavigationProvider.instance;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | null> {
    return this.findCodeblockDefsOfEntityUnderCursor(document, position, token, false);
  }

  async provideDeclaration(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | null> {
    return this.findCodeblockDefsOfEntityUnderCursor(document, position, token, false);
  }

  async provideImplementation(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | null> {
    return this.findCodeblockDefsOfEntityUnderCursor(document, position, token, true);
  }

  private async findCodeblockDefsOfEntityUnderCursor(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    allLocations: boolean
  ): Promise<vscode.Definition | null> {
    if (token.isCancellationRequested) return null;

    const entity = this.findEntityAtPosition(document, position);
    if (!entity) return null;

    const logContext = allLocations ? 'provideImplementation' : 'provideEntityLocation';
    this.logger.debug(`navigation::${logContext}`, {
      position: `${position.line}:${position.character}`,
      foundEntity: { type: entity.type, identifier: entity.entity.identifier },
    });

    const docEntities = this.manager.getDocumentEntities(document.uri.toString());
    if (!docEntities) return null;

    const blockList = docEntities.blocks[entity.entity.identifier];
    if (!blockList || blockList.length === 0) return null;

    return allLocations
      ? blockList.map((block) => new vscode.Location(block.location.uri, block.location.id_pos))
      : new vscode.Location(blockList[0].location.uri, blockList[0].location.id_pos);
  }

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    if (token.isCancellationRequested) return [];
    if (!context.includeDeclaration) {
      return [];
    }

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

    const entity = this.findEntityAtPosition(document, position);
    const entities = this.manager.getDocumentEntities(document.uri.toString());

    // Case 1: Hovering over a noweb reference (<<identifier>>)
    if (entity?.type === 'reference') {
      const targetBlocks = entities?.blocks[entity.entity.identifier] || [];

      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`This is a Noweb reference to **#${entity.entity.identifier}**:\n\n`);

      if (targetBlocks.length > 0) {
        for (const block of targetBlocks) {
          markdown.appendCodeblock(block.content, block.language ?? 'markdown');
        }
      } else {
        markdown.appendText('No blocks found with this identifier');
      }

      return new vscode.Hover(markdown);
    }

    // Case 2: Hovering over a block definition
    if (entity?.type === 'block') {
      if (!entities) return null;

      const allBlocks = entities.blocks[entity.entity.identifier] || [];
      const allRefs = entities.references[entity.entity.identifier] || [];

      const currentPos = entity.entity.location.range.start;
      const beforeBlocks = allBlocks.filter((b) => b.location.range.start.isBefore(currentPos));
      const afterBlocks = allBlocks.filter((b) => b.location.range.start.isAfter(currentPos));
      const beforeRefs = allRefs.filter((r) => r.location.id_pos.start.isBefore(currentPos));
      const afterRefs = allRefs.filter((r) => r.location.id_pos.start.isAfter(currentPos));

      const markdown = new vscode.MarkdownString();
      // markdown.appendCodeblock(entity.entity.content, entity.entity.language ?? 'markdown');
      markdown.appendMarkdown('\n\n---\n\n');
      markdown.appendMarkdown(`This is definition of **#${entity.entity.identifier}**\n\n`);

      const beforeParts = [];
      if (beforeBlocks.length > 0) beforeParts.push(`**[${beforeBlocks.length}]** more earlier definitions`);
      if (beforeRefs.length > 0) beforeParts.push(`Used by **[${beforeRefs.length}]** times`);
      if (beforeParts.length > 0) {
        markdown.appendMarkdown(`Above this line: ${beforeParts.join(', ')}\n\n`);
      }

      const afterParts = [];
      if (afterBlocks.length > 0) afterParts.push(`definition extended **[${afterBlocks.length}]** times`);
      if (afterRefs.length > 0) afterParts.push(`Used by **[${afterRefs.length}]** times`);
      if (afterParts.length > 0) {
        markdown.appendMarkdown(`Below this line: ${afterParts.join(', ')}\n\n`);
      }

      return new vscode.Hover(markdown);
    }

    return null;
  }

  /** Find entity (block or reference) at position */
  private findEntityAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { type: 'reference'; entity: NoWebReference } | { type: 'block'; entity: DocumentBlock } | null {
    // First try to find a NoWebReference
    const reference = this.findNoWebReferenceUnderCursor(document, position);
    if (reference) {
      return { type: 'reference', entity: reference };
    }
    // Then try to find a block
    const block = this.findBlockIdentifierUnderCursor(document, position);
    if (block) {
      return { type: 'block', entity: block };
    }

    return null;
  }

  private findNoWebReferenceUnderCursor(
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

  private findBlockIdentifierUnderCursor(
    document: vscode.TextDocument,
    position: vscode.Position
  ): DocumentBlock | null {
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
}
